"use server";

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practiceLinks, carePassages, practitionerVacations } from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { simulerCotisationsURSSAF, getPlafondSecuriteSociale } from "@/lib/services/openfisca.service";
import { calculerCotisationsCarpimko } from "@/lib/services/carpimko.service";
import { getPaidCAByMonth } from "@/lib/services/ca-paid.service";
import { namesMatch } from "@/lib/name-matching";
import { countWorkingDays } from "@/lib/data/fr-holidays";
import { getPractitionerByUserId, type Practitioner } from "@/lib/data/current-practitioner";
import { cache } from "react";

export type CotisationsEstimate = {
  urssafAnnuel: number;
  carpimkoAnnuel: number;
  pasAnnuel: number;
  urssafParEcheance: number;
  carpimkoParEcheance: number;
  pasParEcheance: number;
  /**
   * Revenu professionnel annualisé NET de rétrocession et de charges déductibles
   * (= base des cotisations). En BNC réel, c'est une approximation du bénéfice
   * (recettes − charges), pas le CA. En micro-BNC, égal au CA brut (l'abattement
   * forfaitaire de 34 % est appliqué en aval, cf. `revenuNet`).
   */
  revenuAnnualise: number;
  /** CA brut annualisé (avant rétrocession et charges). Égal à `revenuAnnualise` si ni rétrocession ni charges. */
  caBrutAnnualise: number;
  /** Rétrocession annualisée déduite du CA brut (0 si pas de rétrocession configurée). */
  retrocessionAnnualise: number;
  /**
   * Charges professionnelles annualisées effectivement retenues dans l'assiette
   * (hors rétrocession, déjà comptée à part). 0 en micro-BNC (l'abattement 34 %
   * couvre toutes les charges) ou si l'appelant n'a rien transmis.
   */
  chargesAnnualise: number;
  revenuN2: number | null;
  urssafBase: "n2" | "forfaitaire" | "annualise";
  pss: number;
};

/**
 * Calcule la rétrocession sur une période donnée à partir du profil du praticien.
 *
 * Conventions :
 *  - `percentage` : pourcentage du CA → retrocession = CA × value / 100
 *  - `fixed`      : montant **mensuel** fixe (cas typique : loyer cabinet)
 *                   → retrocession = value × monthsElapsed
 */
function computeRetrocessionDeduction(
  retrocessionType: "percentage" | "fixed" | null,
  retrocessionValue: string | null,
  caGross: number,
  monthsElapsed: number,
): number {
  if (!retrocessionType || !retrocessionValue) return 0;
  const v = parseFloat(retrocessionValue);
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (retrocessionType === "percentage") {
    return Math.max(0, caGross * (v / 100));
  }
  // fixed : interprété comme un montant mensuel
  return Math.max(0, v * monthsElapsed);
}

/**
 * Récupère le CA payé d'une année donnée pour le praticien connecté,
 * en passant par ses cabinets liés et le name matching.
 *
 * Priorité aux montants ENCAISSÉS (`care_payments`, date de paiement — le CA
 * correct en BNC), repli sur les passages (facturé, date de soin) pour les
 * cabinets sans retours NOEMIE joignables — même règle que
 * `getCAFromBordereaux` (effective-ca.ts).
 *
 * Retourne aussi la couverture des données (`monthsCovered` = nombre de mois
 * distincts ayant au moins un encaissement/passage) : elle permet à l'appelant
 * de détecter une année tronquée (ex. bordereaux ne démarrant qu'en décembre)
 * dont le total ne représente pas un revenu annuel.
 */
// Mémoïsé PAR REQUÊTE (praticien, année) : requête groupée lourde sur les passages.
const getCAForYear = cache(async (
  practitionerId: string,
  fullName: string,
  lastName: string,
  year: number,
): Promise<{ ca: number; monthsCovered: number }> => {
  const links = await db
    .select({ practiceId: practiceLinks.practiceId })
    .from(practiceLinks)
    .where(eq(practiceLinks.practitionerId, practitionerId));

  if (links.length === 0) return { ca: 0, monthsCovered: 0 };

  const practiceIds = links.map((l) => l.practiceId);

  const paid = await getPaidCAByMonth(practiceIds, fullName, lastName, year);
  if (paid.total > 0) {
    return {
      ca: paid.total,
      monthsCovered: paid.byMonth.filter((m) => m > 0).length,
    };
  }

  const lastNamePattern = `%${lastName}%`;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const passages = await db
    .select({
      practitioner: carePassages.practitioner,
      totalAmount: carePassages.totalAmount,
      careDate: carePassages.careDate,
    })
    .from(carePassages)
    .where(
      and(
        inArray(carePassages.practiceId, practiceIds),
        sql`${carePassages.practitioner} ILIKE ${lastNamePattern}`,
        sql`${carePassages.careDate} >= ${yearStart}`,
        sql`${carePassages.careDate} <= ${yearEnd}`,
        sql`${carePassages.status} = 'paye'`,
      )
    );

  // Affiner avec namesMatch côté JS
  const matched = passages.filter((p) => namesMatch(fullName, p.practitioner));
  const ca = matched.reduce((sum, p) => sum + Number(p.totalAmount), 0);
  // `careDate` est une colonne `date` → chaîne "YYYY-MM-DD" : le mois est en position 5-6.
  const monthsCovered = new Set(matched.map((p) => String(p.careDate).slice(5, 7))).size;
  return { ca, monthsCovered };
});

export async function getCotisationsEstimate(
  totalCA: number,
  deductionSociale: number = 0,
  year?: number,
  /**
   * Charges professionnelles déductibles ANNUALISÉES (loyer, matériel, Madelin…),
   * hors rétrocession (déduite à part via le profil) et hors cotisations sociales
   * elles-mêmes : dans cette estimation, les cotisations de l'année ne se
   * déduisent pas de leur propre assiette (sinon le calcul serait circulaire —
   * l'URSSAF raisonne de toute façon sur le revenu N-2 ou une base forfaitaire).
   * Défaut 0 = comportement historique (assiette = CA net de rétrocession).
   */
  chargesAnnuelles: number = 0,
): Promise<CotisationsEstimate | null> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return null;
  return cachedEstimate(session.id, totalCA, deductionSociale, year ?? null, chargesAnnuelles);
}

// Mémoïsé PAR REQUÊTE (React cache) sur (utilisateur, arguments) : un rendu
// serveur qui demande plusieurs fois la même estimation (préchargement layout,
// page, score de santé…) ne la calcule qu'une fois. Les appels OpenFisca sont
// en plus mis en cache par process dans openfisca.service.ts.
const cachedEstimate = cache(async (
  userId: string,
  totalCA: number,
  deductionSociale: number,
  year: number | null,
  chargesAnnuelles: number,
): Promise<CotisationsEstimate | null> => {
  const hp = await getPractitionerByUserId(userId);
  if (!hp) return null;
  return computeCotisationsEstimate(hp, totalCA, deductionSociale, year ?? undefined, chargesAnnuelles);
});

async function computeCotisationsEstimate(
  hp: Practitioner,
  totalCA: number,
  deductionSociale: number,
  year: number | undefined,
  chargesAnnuelles: number,
): Promise<CotisationsEstimate | null> {

  const now = new Date();
  const currentYear = now.getFullYear();
  // `annee` = année cible du calcul (sélecteur d'année côté UI). Si non
  // précisée → année courante. C'est ce qui permet d'estimer rétroactivement
  // les cotisations d'une année passée sans extrapolation faussée.
  const annee = year ?? currentYear;
  const regime = hp.taxRegime;

  // ── CA annualisé : daily rate × jours travaillés sur l'année complète ──
  // On utilise le rythme de travail (daysPerWeekWorked) + les jours de vacances
  // saisis par le praticien pour obtenir une projection plus juste qu'une
  // simple extrapolation linéaire mois × 12.
  // Pour une année passée complète, monthsElapsed = 12 (pas d'extrapolation).
  // Pour l'année courante, monthsElapsed = mois en cours. Pour une année future,
  // monthsElapsed = 12 (on suppose le CA passé en argument déjà annualisé).
  const monthsElapsed = annee < currentYear
    ? 12
    : annee > currentYear
      ? 12
      : now.getMonth() + 1;
  const daysPerWeek = hp.daysPerWeekWorked;

  // Si activityStartDate est dans l'année cible, on borne les jours
  // travaillables à cette date (sinon on annualise sur 12 mois entiers même
  // pour quelqu'un démarré en septembre, ce qui surestime gravement le CA).
  const activityStartDate = new Date(hp.activityStartDate);
  const startMonth = activityStartDate.getFullYear() === annee
    ? activityStartDate.getMonth() + 1
    : 1;

  // Charger les jours travaillés saisis pour l'année cible (null = non saisi).
  const workedRows = await db
    .select()
    .from(practitionerVacations)
    .where(and(
      eq(practitionerVacations.practitionerId, hp.id),
      eq(practitionerVacations.year, annee),
    ));
  const workedDays: (number | null)[] = Array(12).fill(null);
  for (const row of workedRows) {
    if (row.month >= 1 && row.month <= 12) {
      workedDays[row.month - 1] = row.workedDays;
    }
  }

  // Jours réellement travaillés YTD (jours saisis, ou défaut = jours ouvrés).
  // On démarre au mois d'activité, pas en janvier.
  let workedYTD = 0;
  for (let m = startMonth; m <= monthsElapsed; m++) {
    const wd = countWorkingDays(annee, m, daysPerWeek);
    workedYTD += workedDays[m - 1] ?? wd;
  }
  // Jours travaillés sur le reste de l'année (depuis startMonth jusqu'à
  // décembre). Pour un praticien établi, c'est l'année complète.
  let workedYear = 0;
  for (let m = startMonth; m <= 12; m++) {
    const wd = countWorkingDays(annee, m, daysPerWeek);
    workedYear += workedDays[m - 1] ?? wd;
  }

  // Annualisation du CA **brut** : daily rate × jours travaillés sur le reste
  // de l'année. On exige un minimum de jours travaillés YTD pour utiliser le
  // daily rate, sinon une variance ponctuelle (3 jours d'activité, 2 grosses
  // factures…) extrapole un revenu annuel artificiellement explosif. En dessous
  // de ce seuil, on utilise une moyenne mensuelle (plus stable) ou on renvoie
  // le CA brut si l'activité est trop récente.
  // Pour une année passée complète, workedYTD === workedYear → caBrutAnnualise
  // = totalCA (pas d'extrapolation).
  const MIN_WORKED_DAYS_FOR_DAILY_PROJECTION = 60;
  const dailyRate = workedYTD > 0 ? totalCA / workedYTD : 0;
  let caBrutAnnualise: number;
  if (workedYTD >= MIN_WORKED_DAYS_FOR_DAILY_PROJECTION && dailyRate > 0) {
    caBrutAnnualise = Math.round(dailyRate * workedYear);
  } else if (monthsElapsed >= 2) {
    caBrutAnnualise = Math.round((totalCA / monthsElapsed) * 12);
  } else {
    caBrutAnnualise = totalCA;
  }

  if (caBrutAnnualise <= 0) return null;

  // ── Retrait de la rétrocession et des charges déductibles ──
  // En BNC réel, les cotisations s'assoient sur le RÉSULTAT (recettes − charges
  // déductibles), pas sur le CA : on retire du CA brut annualisé la rétrocession
  // (issue du profil) ET les charges professionnelles annualisées transmises par
  // l'appelant pour obtenir la base des cotisations URSSAF / CARPIMKO / PAS.
  // En micro-BNC en revanche, l'abattement forfaitaire 34 % est censé couvrir
  // toutes les charges (rétrocession et charges pro comprises) — on n'applique
  // donc aucune double déduction. Les valeurs sont tout de même exposées (champs
  // `retrocessionAnnualise` / `chargesAnnualise`) pour usage informatif côté UI.
  const retrocessionAnnualise = Math.round(computeRetrocessionDeduction(
    hp.retrocessionType,
    hp.retrocessionValue,
    caBrutAnnualise,
    12,
  ));
  const isMicroBNCRegime = regime === "micro_bnc";
  // Montant de charges effectivement retenu dans l'assiette (0 en micro-BNC).
  const chargesAnnualise = isMicroBNCRegime
    ? 0
    : Math.max(0, Math.round(chargesAnnuelles));
  // Plancher à 0 : un résultat négatif (charges + rétrocession > CA) signifie
  // simplement « pas de bénéfice », donc pas de cotisations proportionnelles.
  // Surtout NE PAS retomber sur le CA brut dans ce cas — cotiser sur le CA
  // alors que l'activité est déficitaire serait pire que l'assiette nulle.
  const revenuAnnualise = isMicroBNCRegime
    ? caBrutAnnualise
    : Math.max(0, caBrutAnnualise - retrocessionAnnualise - chargesAnnualise);

  // ── Déterminer si le praticien est dans ses 2 premières années ──
  const activityStart = new Date(hp.activityStartDate);
  const yearsOfActivity = annee - activityStart.getFullYear();
  const isDebutActivite = yearsOfActivity < 2;

  // ── CA N-2 (pour URSSAF) ──
  // Règle de couverture : on n'utilise le N-2 QUE si les données couvrent au
  // moins 10 mois distincts de l'année. Une année tronquée (ex. bordereaux ne
  // couvrant que le 17→31 décembre) donnerait un « revenu annuel » dérisoire et
  // non représentatif → une URSSAF quasi nulle, incohérente avec la CARPIMKO
  // calculée sur le revenu annualisé courant. Dans ce cas, on traite comme
  // « pas de données N-2 » → fallback sur la base annualisée ci-dessous.
  const MIN_N2_MONTHS_COVERAGE = 10;
  const fullName = `${hp.firstName} ${hp.lastName}`;
  const anneeN2 = annee - 2;
  let revenuN2: number | null = null;
  if (!isDebutActivite) {
    try {
      const { ca: caN2, monthsCovered } = await getCAForYear(hp.id, fullName, hp.lastName, anneeN2);
      if (caN2 > 0 && monthsCovered >= MIN_N2_MONTHS_COVERAGE) revenuN2 = caN2;
    } catch {
      // pas de données N-2 disponibles
    }
  }

  // Revenu net (après abattement micro-BNC si applicable)
  const revenuNet = regime === "micro_bnc" ? revenuAnnualise * 0.66 : revenuAnnualise;
  const revenuNetN2 = revenuN2 != null
    ? (regime === "micro_bnc" ? revenuN2 * 0.66 : revenuN2)
    : null;

  // Récupérer le PASS via OpenFisca
  let pss = 47_100;
  try {
    pss = await getPlafondSecuriteSociale(annee);
  } catch {
    // silently use fallback
  }

  // ── URSSAF : base forfaitaire (début activité), N-2, ou CA annualisé ──
  let urssafRevenu: number;
  let urssafRevenuNet: number;
  let urssafBase: "n2" | "forfaitaire" | "annualise";

  if (isDebutActivite) {
    // 2 premières années : base forfaitaire = 19% du PASS
    urssafRevenu = Math.round(pss * 0.19);
    urssafRevenuNet = urssafRevenu;
    urssafBase = "forfaitaire";
  } else if (revenuN2 != null) {
    urssafRevenu = revenuN2;
    urssafRevenuNet = revenuNetN2!;
    urssafBase = "n2";
  } else {
    // Base annualisée : la déduction sociale (Madelin, blanchisserie...) s'applique
    // immédiatement. Pour forfait/N-2, l'effet est différé en N+2 (régularisation).
    urssafRevenu = Math.max(0, revenuAnnualise - deductionSociale);
    urssafRevenuNet = Math.max(0, revenuNet - deductionSociale);
    urssafBase = "annualise";
  }

  // ── URSSAF (PAMC) ──
  // OpenFisca calcule par défaut le régime "profession_liberale" générique (CIPAV).
  // Pour les IDEL conventionnés (régime PAMC), deux corrections s'imposent :
  //   1. La cotisation maladie-maternité (6,5 % en standard) est prise en charge
  //      à hauteur de 5,9 % par la CPAM sur les actes conventionnés. La part résiduelle
  //      à la charge de l'IDEL est ~0,6 % (= facteur 0,6 / 6,5 ≈ 9,2 %).
  //   2. La retraite de base (vieillesse_profession_liberale) est prélevée par la
  //      CARPIMKO (mandataire CNAVPL), pas par l'URSSAF. On la retranche du total
  //      URSSAF et on l'ajoute au total CARPIMKO ci-dessous.
  const PAMC_MALADIE_FACTOR = 0.6 / 6.5;
  let urssafAnnuel = 0;
  let retraiteBaseCarpimko = 0;
  let openFiscaOk = false;
  try {
    const result = await simulerCotisationsURSSAF({
      revenuAnnuel: urssafRevenu,
      annee,
      regime,
    });
    const maladieCpamCharge = result.maladieMaterniteProfessionLiberale * (1 - PAMC_MALADIE_FACTOR);
    retraiteBaseCarpimko = result.retraiteBase;
    urssafAnnuel = Math.max(0, result.totalCotisationsOpenFisca - maladieCpamCharge - retraiteBaseCarpimko);
    openFiscaOk = urssafAnnuel > 0;
  } catch {
    // fallback approximé : 26 % sur revenu net (moyenne URSSAF non-PAMC).
    urssafAnnuel = urssafRevenuNet * 0.26;
  }

  if (!openFiscaOk && urssafAnnuel <= 0) {
    urssafAnnuel = urssafRevenuNet * 0.26;
  }

  // ── CARPIMKO : retraite complémentaire + ASV + invalidité + IJ ──
  // On ajoute la retraite de base extraite d'OpenFisca (prélevée par la CARPIMKO chez l'IDEL).
  const carpimkoResult = calculerCotisationsCarpimko(revenuNet, annee);
  const carpimkoAnnuel = carpimkoResult.totalCarpimko + retraiteBaseCarpimko;

  // ── PAS : basé sur CA annualisé ──
  const pasRate = parseFloat(hp.pasRate) / 100;
  const pasAnnuel = revenuNet * pasRate;

  // Diviser par nombre d'échéances
  const urssafDiviseur = hp.urssafFrequency === "monthly" ? 12 : 4;
  const carpimkoDiviseur = hp.carpimkoFrequency === "monthly" ? 10 : 2;
  const pasDiviseur = hp.pasFrequency === "monthly" ? 12 : 4;

  return {
    urssafAnnuel: Math.round(urssafAnnuel),
    carpimkoAnnuel: Math.round(carpimkoAnnuel),
    pasAnnuel: Math.round(pasAnnuel),
    urssafParEcheance: Math.round(urssafAnnuel / urssafDiviseur),
    carpimkoParEcheance: Math.round(carpimkoAnnuel / carpimkoDiviseur),
    pasParEcheance: Math.round(pasAnnuel / pasDiviseur),
    revenuAnnualise,
    caBrutAnnualise,
    retrocessionAnnualise,
    chargesAnnualise,
    revenuN2,
    urssafBase,
    pss,
  };
}
