"use server";

import { eq, and, inArray, sql, count, gte, lte, isNull } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners, bankAccounts, bankTransactions } from "@/lib/db/schema";
import { getCotisationsEstimate } from "@/actions/cotisations-estimate";
import { getFacturationData } from "@/actions/facturation";

export type HealthSubscoreKey = "treasury" | "charges_ratio" | "data_quality" | "collection_rate";

export type HealthSubscore = {
  key: HealthSubscoreKey;
  label: string;
  score: number; // 0-100
  weight: number; // 0-1
  detail: string;
  available: boolean;
};

export type HealthRecommendationSeverity = "info" | "warning" | "critical";

export type HealthRecommendation = {
  key: string;
  message: string;
  cta?: { label: string; href: string };
  severity: HealthRecommendationSeverity;
};

export type HealthScore = {
  score: number; // 0-100 weighted avg of available subscores
  subscores: HealthSubscore[];
  recommendations: HealthRecommendation[];
};

const WEIGHTS: Record<HealthSubscoreKey, number> = {
  treasury: 0.30,
  charges_ratio: 0.25,
  data_quality: 0.20,
  collection_rate: 0.25,
};

// Seuils des sous-scores (tunables).
const TREASURY_TARGET_MONTHS = 4;          // ≥ 4 mois de couverture → 100
const CHARGES_RATIO_BEST = 0.35;           // ≤ 35 % du CA en charges → 100
const CHARGES_RATIO_WORST = 0.55;          // ≥ 55 % du CA en charges → 0
const REJECTION_RATE_WORST = 0.10;         // ≥ 10 % de bordereaux rejetés → 0

const AVG_DAYS_PER_MONTH = 30.4375;        // 365.25 / 12, pour mois fractionnaires

// En début d'activité (< 2 ans), CARPIMKO et URSSAF appliquent des forfaits
// minimums (~3,5 k€/an + 19 % du PSS) qui ne reflètent pas le revenu réel.
// Sous ce seuil de revenu annualisé, le ratio charges/CA est dominé par ces
// forfaits et n'a pas de valeur informative → on n'affiche pas le sous-score.
const CHARGES_RATIO_DEBUT_MIN_REVENU = 12_000;

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

// Mappe une valeur entre `best` et `worst` vers un score 0-100.
// Quand value ≤ best → 100, quand value ≥ worst → 0, linéaire entre.
function scoreLowerIsBetter(value: number, best: number, worst: number): number {
  if (worst === best) return value <= best ? 100 : 0;
  return clamp(100 - ((value - best) / (worst - best)) * 100);
}

// Mois d'activité écoulés dans l'année courante, en valeur fractionnaire.
// Pour un praticien établi avant cette année on prend les mois calendaires
// écoulés ; pour un praticien démarré cette année on part de sa date de début.
// Renvoie `null` si aucune activité encore (date de début dans le futur).
function monthsOfActivityYtd(activityStartDate: string, now: Date): number | null {
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const activityStart = new Date(activityStartDate);
  const effectiveStart = activityStart > yearStart ? activityStart : yearStart;
  if (effectiveStart > now) return null;
  const days = (now.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24);
  return days / AVG_DAYS_PER_MONTH;
}

// Le sous-score "Poids des charges" n'est significatif que si :
//   - le CA annualisé est positif (sinon division par 0 + pas de base) ;
//   - on a une estimation de cotisations (URSSAF, CARPIMKO ou IR) ;
//   - le praticien n'est pas en début d'activité avec un faible revenu (sinon
//     le ratio est saturé par les forfaits minimums et serait trompeur).
function isChargesRatioMeaningful(
  caAnnualise: number,
  hasCotisations: boolean,
  yearsOfActivity: number,
): boolean {
  if (caAnnualise <= 0 || !hasCotisations) return false;
  if (yearsOfActivity < 2 && caAnnualise < CHARGES_RATIO_DEBUT_MIN_REVENU) return false;
  return true;
}

export async function getHealthScoreAction(): Promise<HealthScore | null> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return null;

  const [hp] = await db.select().from(practitioners).where(eq(practitioners.userId, session.id));
  if (!hp) return null;
  return computeHealthScore(hp);
}

// Variante par identifiant praticien, exposable côté outils IA / scripts.
export async function computeHealthScoreById(practitionerId: string): Promise<HealthScore | null> {
  const [hp] = await db.select().from(practitioners).where(eq(practitioners.id, practitionerId));
  if (!hp) return null;
  return computeHealthScore(hp);
}

type Practitioner = typeof practitioners.$inferSelect;

async function computeHealthScore(hp: Practitioner): Promise<HealthScore> {
  const now = new Date();
  const year = now.getFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const yearsOfActivity = year - new Date(hp.activityStartDate).getFullYear();
  const monthsActive = monthsOfActivityYtd(hp.activityStartDate, now);

  // ── Comptes + transactions ──
  const accounts = await db
    .select({ id: bankAccounts.id, balance: bankAccounts.balance })
    .from(bankAccounts)
    .where(eq(bankAccounts.practitionerId, hp.id));
  const accountIds = accounts.map((a) => a.id);
  const totalBalance = accounts.reduce((acc, a) => acc + Number(a.balance ?? 0), 0);
  const bankConnected = !!hp.bridgeUserUuid && accounts.length > 0;

  let decaissementYtd = 0;
  let totalTxCount = 0;
  let uncategorizedCount = 0;

  if (accountIds.length > 0) {
    const accountFilter = and(
      inArray(bankTransactions.bankAccountId, accountIds),
      gte(bankTransactions.date, yearStart),
      lte(bankTransactions.date, yearEnd),
    );

    const [decRow, totalRow, uncatRow] = await Promise.all([
      db
        .select({ total: sql<string>`COALESCE(SUM(ABS(${bankTransactions.amount})), 0)` })
        .from(bankTransactions)
        .where(and(accountFilter, sql`${bankTransactions.amount} < 0`)),
      db.select({ total: count() }).from(bankTransactions).where(accountFilter),
      db
        .select({ total: count() })
        .from(bankTransactions)
        .where(and(accountFilter, isNull(bankTransactions.category))),
    ]);

    decaissementYtd = Number(decRow[0]?.total ?? 0);
    totalTxCount = Number(totalRow[0]?.total ?? 0);
    uncategorizedCount = Number(uncatRow[0]?.total ?? 0);
  }

  // ── CA & bordereaux ──
  const facturation = await getFacturationData();
  const summary = "summary" in facturation ? facturation.summary : null;
  const caPaid = summary?.byStatus.paye.total ?? 0;
  const passageCount = summary?.passageCount ?? 0;
  const rejectedCount = summary?.byStatus.rejete.count ?? 0;

  // ── Cotisations annuelles projetées ──
  // `caPaid` est YTD, donc on compare aux cotisations & au CA **annualisés**
  // pour éviter qu'un ratio "annuel / YTD" explose en début d'année.
  let cotisationsAnnuelles = 0;
  let pasAnnuel = 0;
  let revenuAnnualise = 0;
  if (caPaid > 0) {
    const estimate = await getCotisationsEstimate(caPaid);
    if (estimate) {
      cotisationsAnnuelles = estimate.urssafAnnuel + estimate.carpimkoAnnuel;
      pasAnnuel = estimate.pasAnnuel;
      revenuAnnualise = estimate.revenuAnnualise;
    }
  }

  // ── Profil ──
  const profileFields = [
    hp.firstName,
    hp.lastName,
    hp.profession,
    hp.activityStartDate,
    hp.taxRegime,
    hp.rppsNumber,
    hp.bridgeUserUuid,
  ];
  const profileCompletion = Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100);

  // ─── Sous-scores ───
  // Métriques intermédiaires conservées hors des blocs pour rester réutilisables
  // dans les recommandations sans re-parser les libellés.
  // On normalise les charges YTD par les **mois d'activité réelle** (et non les
  // mois calendaires écoulés depuis janvier) pour ne pas sous-estimer la charge
  // mensuelle d'un praticien démarré en cours d'année. Plancher 0.5 mois pour
  // éviter qu'une activité < 2 semaines fasse exploser le ratio.
  const MIN_MONTHS_FOR_COVERAGE = 0.5;
  const coverage = decaissementYtd > 0 && monthsActive !== null
    ? totalBalance / (decaissementYtd / Math.max(monthsActive, MIN_MONTHS_FOR_COVERAGE))
    : null;

  // On compare CA et charges des deux côtés annualisés pour rester juste en cours d'année.
  const caAnnualise = revenuAnnualise > 0 ? revenuAnnualise : caPaid;
  const hasCotisations = cotisationsAnnuelles > 0 || pasAnnuel > 0;
  const chargesMeaningful = isChargesRatioMeaningful(caAnnualise, hasCotisations, yearsOfActivity);
  const chargesRatio = chargesMeaningful
    ? (cotisationsAnnuelles + pasAnnuel) / caAnnualise
    : null;

  const rejectionRate = passageCount > 0 ? rejectedCount / passageCount : null;

  const subscores: HealthSubscore[] = [];

  // 1. Trésorerie : nombre de mois de charges que le solde couvre.
  if (coverage !== null) {
    subscores.push({
      key: "treasury",
      label: "Trésorerie",
      score: clamp((coverage / TREASURY_TARGET_MONTHS) * 100),
      weight: WEIGHTS.treasury,
      detail: `${coverage.toFixed(1)} mois de couverture (cible : ${TREASURY_TARGET_MONTHS} mois)`,
      available: true,
    });
  } else {
    subscores.push({
      key: "treasury",
      label: "Trésorerie",
      score: 0,
      weight: WEIGHTS.treasury,
      detail: bankConnected ? "Pas encore de dépenses enregistrées" : "Connectez votre banque",
      available: false,
    });
  }

  // 2. Poids des charges : (URSSAF + CARPIMKO + IR) / CA, en valeurs annualisées.
  if (chargesRatio !== null) {
    subscores.push({
      key: "charges_ratio",
      label: "Poids des charges",
      score: scoreLowerIsBetter(chargesRatio, CHARGES_RATIO_BEST, CHARGES_RATIO_WORST),
      weight: WEIGHTS.charges_ratio,
      detail: `${(chargesRatio * 100).toFixed(0)} % du CA en URSSAF + CARPIMKO + IR (cible : ≤ ${Math.round(CHARGES_RATIO_BEST * 100)} %)`,
      available: true,
    });
  } else {
    const detail = !hasCotisations
      ? "CA insuffisant pour estimer le ratio"
      : "Indicateur non significatif en début d'activité (cotisations forfaitaires minimum)";
    subscores.push({
      key: "charges_ratio",
      label: "Poids des charges",
      score: 0,
      weight: WEIGHTS.charges_ratio,
      detail,
      available: false,
    });
  }

  // 3. Qualité des données : profil + banque + transactions catégorisées.
  const catRate = totalTxCount > 0
    ? ((totalTxCount - uncategorizedCount) / totalTxCount) * 100
    : bankConnected ? 100 : 0;
  const dataQualityScore = clamp(0.5 * profileCompletion + 0.3 * (bankConnected ? 100 : 0) + 0.2 * catRate);
  const dataQualityReasons: string[] = [];
  if (profileCompletion < 100) dataQualityReasons.push(`profil ${profileCompletion} %`);
  if (!bankConnected) dataQualityReasons.push("banque non connectée");
  if (totalTxCount > 0 && uncategorizedCount > 0) {
    dataQualityReasons.push(`${uncategorizedCount} transaction${uncategorizedCount > 1 ? "s" : ""} à catégoriser`);
  }
  subscores.push({
    key: "data_quality",
    label: "Complétude des données",
    score: dataQualityScore,
    weight: WEIGHTS.data_quality,
    detail: dataQualityReasons.length > 0 ? dataQualityReasons.join(" · ") : "Toutes les données sont à jour",
    available: true,
  });

  // 4. Recouvrement bordereaux : part de bordereaux rejetés.
  if (rejectionRate !== null) {
    subscores.push({
      key: "collection_rate",
      label: "Recouvrement",
      score: scoreLowerIsBetter(rejectionRate, 0, REJECTION_RATE_WORST),
      weight: WEIGHTS.collection_rate,
      detail: `${(rejectionRate * 100).toFixed(1)} % de bordereaux rejetés (cible : 0 %)`,
      available: true,
    });
  } else {
    subscores.push({
      key: "collection_rate",
      label: "Recouvrement",
      score: 0,
      weight: WEIGHTS.collection_rate,
      detail: "Aucun bordereau importé",
      available: false,
    });
  }

  // ── Score global (moyenne pondérée des sous-scores disponibles) ──
  const available = subscores.filter((s) => s.available);
  const totalWeight = available.reduce((acc, s) => acc + s.weight, 0);
  const global = totalWeight > 0
    ? Math.round(available.reduce((acc, s) => acc + s.score * s.weight, 0) / totalWeight)
    : 0;

  // ── Recommandations ──
  const recommendations: HealthRecommendation[] = [];
  const subFor = (k: HealthSubscoreKey) => subscores.find((s) => s.key === k);

  const treasurySub = subFor("treasury");
  if (treasurySub?.available && coverage !== null && treasurySub.score < 50) {
    recommendations.push({
      key: "treasury_low",
      severity: treasurySub.score < 25 ? "critical" : "warning",
      message: `Votre trésorerie ne couvre qu'environ ${coverage.toFixed(1)} mois de charges. Pensez à provisionner.`,
      cta: { label: "Voir mes transactions", href: "/transactions" },
    });
  }

  const chargesSub = subFor("charges_ratio");
  if (chargesSub?.available && chargesSub.score < 50) {
    recommendations.push({
      key: "charges_high",
      severity: chargesSub.score < 25 ? "critical" : "warning",
      message: "Vos charges représentent une part importante du CA. Des optimisations (PER, Madelin, frais pro) peuvent réduire ce ratio.",
      cta: { label: "Voir les optimisations", href: "/optimization" },
    });
  }

  if (dataQualityScore < 80) {
    if (!bankConnected) {
      recommendations.push({
        key: "connect_bank",
        severity: "critical",
        message: "Connectez votre banque pour un suivi précis de votre trésorerie.",
        cta: { label: "Connecter", href: "/transactions" },
      });
    } else if (profileCompletion < 100) {
      recommendations.push({
        key: "complete_profile",
        severity: "info",
        message: `Votre profil est complété à ${profileCompletion} %. Quelques infos manquantes améliorent la précision des estimations.`,
        cta: { label: "Compléter mon profil", href: "/profile" },
      });
    } else if (uncategorizedCount > 0) {
      recommendations.push({
        key: "categorize_tx",
        severity: "info",
        message: `${uncategorizedCount} transaction${uncategorizedCount > 1 ? "s" : ""} à catégoriser pour affiner vos indicateurs.`,
        cta: { label: "Catégoriser", href: "/transactions" },
      });
    }
  }

  const recouvrementSub = subFor("collection_rate");
  if (recouvrementSub?.available && recouvrementSub.score < 70) {
    recommendations.push({
      key: "rejection_high",
      severity: recouvrementSub.score < 40 ? "critical" : "warning",
      message: "Votre taux de rejet bordereaux est élevé. Vérifiez les causes pour récupérer du chiffre d'affaires.",
      cta: { label: "Voir la facturation", href: "/facturation" },
    });
  }

  // Reco proactive : si le CA est significatif et que les charges ne sont pas
  // déjà signalées, on pousse vers /optimization (point d'entrée affiliation).
  if (caPaid > 30000 && !recommendations.some((rec) => rec.key === "charges_high")) {
    recommendations.push({
      key: "explore_optim",
      severity: "info",
      message: "Explorez les optimisations fiscales (PER, Madelin) pour réduire vos charges.",
      cta: { label: "Voir les optimisations", href: "/optimization" },
    });
  }

  return {
    score: global,
    subscores,
    recommendations: recommendations.slice(0, 3),
  };
}
