"use server";

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners, practiceLinks, carePassages } from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { simulerCotisationsURSSAF, getPlafondSecuriteSociale } from "@/lib/services/openfisca.service";
import { calculerCotisationsCarpimko } from "@/lib/services/carpimko.service";
import { namesMatch } from "@/lib/name-matching";

export type CotisationsEstimate = {
  urssafAnnuel: number;
  carpimkoAnnuel: number;
  pasAnnuel: number;
  urssafParEcheance: number;
  carpimkoParEcheance: number;
  pasParEcheance: number;
  revenuAnnualise: number;
  revenuN2: number | null;
  urssafBase: "n2" | "forfaitaire" | "annualise";
  pss: number;
};

/**
 * Récupère le CA payé d'une année donnée pour le praticien connecté,
 * en passant par ses cabinets liés et le name matching.
 */
async function getCAForYear(
  practitionerId: string,
  fullName: string,
  lastName: string,
  year: number,
): Promise<number> {
  const links = await db
    .select({ practiceId: practiceLinks.practiceId })
    .from(practiceLinks)
    .where(eq(practiceLinks.practitionerId, practitionerId));

  if (links.length === 0) return 0;

  const practiceIds = links.map((l) => l.practiceId);
  const lastNamePattern = `%${lastName}%`;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const passages = await db
    .select({
      practitioner: carePassages.practitioner,
      totalAmount: carePassages.totalAmount,
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
  return passages
    .filter((p) => namesMatch(fullName, p.practitioner))
    .reduce((sum, p) => sum + Number(p.totalAmount), 0);
}

export async function getCotisationsEstimate(totalCA: number): Promise<CotisationsEstimate | null> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return null;

  const [hp] = await db
    .select()
    .from(practitioners)
    .where(eq(practitioners.userId, session.id))
    .limit(1);

  if (!hp) return null;

  const now = new Date();
  const annee = now.getFullYear();
  const regime = hp.taxRegime;

  // ── CA annualisé (année en cours) pour CARPIMKO et PAS ──
  const monthsElapsed = now.getMonth() + 1;
  const revenuAnnualise = monthsElapsed >= 2
    ? Math.round((totalCA / monthsElapsed) * 12)
    : totalCA;

  if (revenuAnnualise <= 0) return null;

  // ── Déterminer si le praticien est dans ses 2 premières années ──
  const activityStart = new Date(hp.activityStartDate);
  const yearsOfActivity = annee - activityStart.getFullYear();
  const isDebutActivite = yearsOfActivity < 2;

  // ── CA N-2 (pour URSSAF) ──
  const fullName = `${hp.firstName} ${hp.lastName}`;
  const anneeN2 = annee - 2;
  let revenuN2: number | null = null;
  if (!isDebutActivite) {
    try {
      const caN2 = await getCAForYear(hp.id, fullName, hp.lastName, anneeN2);
      if (caN2 > 0) revenuN2 = caN2;
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
    urssafRevenu = revenuAnnualise;
    urssafRevenuNet = revenuNet;
    urssafBase = "annualise";
  }

  let urssafAnnuel = 0;
  try {
    const result = await simulerCotisationsURSSAF({
      revenuAnnuel: urssafRevenu,
      annee,
      regime,
    });
    urssafAnnuel = result.totalCotisationsOpenFisca;
  } catch {
    urssafAnnuel = urssafRevenuNet * 0.22;
  }

  if (urssafAnnuel <= 0) {
    urssafAnnuel = urssafRevenuNet * 0.22;
  }

  // ── CARPIMKO : basé sur CA annualisé (estimation prospective) ──
  const carpimkoResult = calculerCotisationsCarpimko(revenuNet, annee);
  const carpimkoAnnuel = carpimkoResult.totalCarpimko;

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
    revenuN2,
    urssafBase,
    pss,
  };
}
