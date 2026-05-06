"use server";

import { getSession } from "@/lib/session";
import { simulerCotisationsIDEL, type SimulationResult } from "@/lib/services/cotisations.service";

export async function simulerCotisationsAction(formData: FormData): Promise<{ error?: string; data?: SimulationResult }> {
  const session = await getSession();
  if (!session) {
    return { error: "Non autorisé" };
  }

  const revenuAnnuel = Number(formData.get("revenuAnnuel"));
  const annee = Number(formData.get("annee"));
  const regime = formData.get("regime") as "bnc" | "micro_bnc";

  if (!revenuAnnuel || isNaN(revenuAnnuel)) {
    return { error: "Revenu annuel invalide" };
  }
  if (!annee || isNaN(annee)) {
    return { error: "Année invalide" };
  }
  if (!regime || !["bnc", "micro_bnc"].includes(regime)) {
    return { error: "Régime fiscal invalide" };
  }

  try {
    const data = await simulerCotisationsIDEL({ revenuAnnuel, annee, regime });
    return { data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur lors de la simulation";
    console.error("[cotisations] Erreur simulation:", message);
    return { error: message };
  }
}
