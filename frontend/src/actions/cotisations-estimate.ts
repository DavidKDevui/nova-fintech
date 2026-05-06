"use server";

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { simulerCotisationsURSSAF } from "@/lib/services/openfisca.service";
import { calculerCotisationsCarpimko } from "@/lib/services/carpimko.service";

export type CotisationsEstimate = {
  urssafAnnuel: number;
  carpimkoAnnuel: number;
  pasAnnuel: number;
  urssafParEcheance: number;
  carpimkoParEcheance: number;
  pasParEcheance: number;
  revenuAnnualise: number;
};

export async function getCotisationsEstimate(totalCA: number): Promise<CotisationsEstimate | null> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return null;

  const [hp] = await db
    .select()
    .from(practitioners)
    .where(eq(practitioners.userId, session.id))
    .limit(1);

  if (!hp) return null;

  // Annualiser le CA : on prend le CA payé et on extrapole sur 12 mois
  // basé sur le nombre de mois écoulés dans l'année
  const now = new Date();
  const monthsElapsed = now.getMonth() + 1; // 1-12
  const revenuAnnualise = monthsElapsed >= 2
    ? Math.round((totalCA / monthsElapsed) * 12)
    : totalCA; // pas assez de données pour extrapoler

  if (revenuAnnualise <= 0) return null;

  const annee = now.getFullYear();
  const regime = hp.taxRegime;


  // Revenu net (après abattement micro-BNC si applicable)
  const revenuNet = regime === "micro_bnc" ? revenuAnnualise * 0.66 : revenuAnnualise;

  // Appel OpenFisca pour URSSAF
  let urssafAnnuel = 0;
  try {
    const result = await simulerCotisationsURSSAF({
      revenuAnnuel: revenuAnnualise,
      annee,
      regime,
    });
    urssafAnnuel = result.totalCotisationsOpenFisca;
  } catch {
    // Fallback : estimation à ~22% du revenu net (taux moyen IDEL)
    urssafAnnuel = revenuNet * 0.22;
  }

  // Si OpenFisca retourne 0 (revenu trop faible pour les seuils), fallback
  if (urssafAnnuel <= 0) {
    urssafAnnuel = revenuNet * 0.22;
  }

  // CARPIMKO (calcul local)
  const carpimkoResult = calculerCotisationsCarpimko(revenuNet, annee);
  const carpimkoAnnuel = carpimkoResult.totalCarpimko;

  // PAS (impôt sur le revenu)
  const pasRate = parseFloat(hp.pasRate) / 100;
  const pasAnnuel = revenuNet * pasRate;

  // Diviser par nombre d'échéances
  const urssafDiviseur = hp.urssafFrequency === "monthly" ? 12 : 4;
  const carpimkoDiviseur = hp.carpimkoFrequency === "monthly" ? 10 : 2; // 10 mois (jan-oct) ou 2 semestres
  const pasDiviseur = hp.pasFrequency === "monthly" ? 12 : 4;

  return {
    urssafAnnuel: Math.round(urssafAnnuel),
    carpimkoAnnuel: Math.round(carpimkoAnnuel),
    pasAnnuel: Math.round(pasAnnuel),
    urssafParEcheance: Math.round(urssafAnnuel / urssafDiviseur),
    carpimkoParEcheance: Math.round(carpimkoAnnuel / carpimkoDiviseur),
    pasParEcheance: Math.round(pasAnnuel / pasDiviseur),
    revenuAnnualise,
  };
}
