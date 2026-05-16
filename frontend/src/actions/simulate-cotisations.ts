"use server";

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { simulerCotisationsURSSAF, getPlafondSecuriteSociale } from "@/lib/services/openfisca.service";
import { calculerCotisationsCarpimko } from "@/lib/services/carpimko.service";

export type SimulationResult = {
  revenuAnnuel: number;
  urssafAnnuel: number;
  carpimkoAnnuel: number;
  pasAnnuel: number;
  totalCotisations: number;
  urssafParEcheance: number;
  carpimkoParEcheance: number;
  pasParEcheance: number;
  remunerationNette: number;
};

// Même correction PAMC que dans cotisations-estimate.ts : la cotisation
// maladie-maternité (6,5 %) est prise en charge à hauteur de 5,9 % par la CPAM
// sur les actes conventionnés. La part résiduelle à charge de l'IDEL est ~0,6 %.
const PAMC_MALADIE_FACTOR = 0.6 / 6.5;

/**
 * Simule les cotisations pour un revenu annuel **déjà annualisé**.
 * Ne dépend pas du CA YTD ni de la date du jour : utilisé pour le
 * comparateur "et si je faisais X € de CA cette année ?".
 */
export async function simulateCotisations(revenuAnnuel: number): Promise<SimulationResult | null> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return null;
  if (revenuAnnuel <= 0) return null;

  const [hp] = await db
    .select()
    .from(practitioners)
    .where(eq(practitioners.userId, session.id))
    .limit(1);

  if (!hp) return null;

  const annee = new Date().getFullYear();
  const regime = hp.taxRegime;

  // Revenu net (après abattement micro-BNC si applicable)
  const revenuNet = regime === "micro_bnc" ? revenuAnnuel * 0.66 : revenuAnnuel;

  // PASS (juste pour cohérence si on veut l'afficher, non utilisé ici)
  try {
    await getPlafondSecuriteSociale(annee);
  } catch {
    // ignore
  }

  // ── URSSAF (PAMC, retraite de base extraite vers CARPIMKO) ──
  let urssafAnnuel = 0;
  let retraiteBaseCarpimko = 0;
  try {
    const result = await simulerCotisationsURSSAF({
      revenuAnnuel,
      annee,
      regime,
    });
    const maladieCpamCharge = result.maladieMaterniteProfessionLiberale * (1 - PAMC_MALADIE_FACTOR);
    retraiteBaseCarpimko = result.retraiteBase;
    urssafAnnuel = Math.max(0, result.totalCotisationsOpenFisca - maladieCpamCharge - retraiteBaseCarpimko);
  } catch {
    urssafAnnuel = revenuNet * 0.26;
  }

  if (urssafAnnuel <= 0) urssafAnnuel = revenuNet * 0.26;

  // ── CARPIMKO (+ retraite de base extraite d'OpenFisca) ──
  const carpimkoResult = calculerCotisationsCarpimko(revenuNet, annee);
  const carpimkoAnnuel = carpimkoResult.totalCarpimko + retraiteBaseCarpimko;

  // ── PAS ──
  const pasRate = parseFloat(hp.pasRate) / 100;
  const pasAnnuel = revenuNet * pasRate;

  // Diviseurs d'échéance
  const urssafDiviseur = hp.urssafFrequency === "monthly" ? 12 : 4;
  const carpimkoDiviseur = hp.carpimkoFrequency === "monthly" ? 10 : 2;
  const pasDiviseur = hp.pasFrequency === "monthly" ? 12 : 4;

  const total = urssafAnnuel + carpimkoAnnuel + pasAnnuel;
  // Solde "avant charges pro" = CA − cotisations sociales − PAS.
  // Les charges pro (loyer cabinet, blanchisserie, matériel, rétrocession…)
  // dépendent du comportement et ne sont pas simulées ici.
  const remunerationNette = Math.max(0, revenuAnnuel - total);

  return {
    revenuAnnuel,
    urssafAnnuel: Math.round(urssafAnnuel),
    carpimkoAnnuel: Math.round(carpimkoAnnuel),
    pasAnnuel: Math.round(pasAnnuel),
    totalCotisations: Math.round(total),
    urssafParEcheance: Math.round(urssafAnnuel / urssafDiviseur),
    carpimkoParEcheance: Math.round(carpimkoAnnuel / carpimkoDiviseur),
    pasParEcheance: Math.round(pasAnnuel / pasDiviseur),
    remunerationNette: Math.round(remunerationNette),
  };
}
