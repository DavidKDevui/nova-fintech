"use server";

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners } from "@/lib/db/schema";
import { detectAndCreateSuggestions } from "@/actions/practice-links";

export async function completeOnboardingAction(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorise" };
  }

  const firstName = (formData.get("firstName") as string)?.trim();
  const lastName = (formData.get("lastName") as string)?.trim();
  const rppsNumber = (formData.get("rppsNumber") as string)?.trim();
  const profession = formData.get("profession") as string;
  const activityStartDate = formData.get("activityStartDate") as string;
  const taxRegime = formData.get("taxRegime") as string;

  if (!firstName || !lastName || !rppsNumber || !profession || !activityStartDate || !taxRegime) {
    return { error: "Tous les champs sont requis" };
  }

  if (!/^\d{11}$/.test(rppsNumber)) {
    return { error: "Le numéro RPPS doit contenir exactement 11 chiffres" };
  }

  if (!["nurse"].includes(profession)) {
    return { error: "Profession invalide" };
  }

  if (!["bnc", "micro_bnc"].includes(taxRegime)) {
    return { error: "Régime fiscal invalide" };
  }

  // Rétrocession et fréquence PAS configurables plus tard via /profile.
  // En base : retrocession reste null, pasFrequency utilise le défaut DB ("monthly").
  try {
    const [practitioner] = await db.insert(practitioners).values({
      userId: session.id,
      firstName,
      lastName,
      rppsNumber,
      profession: profession as "nurse",
      activityStartDate,
      taxRegime: taxRegime as "bnc" | "micro_bnc",
    }).returning({ id: practitioners.id });

    if (practitioner) {
      await detectAndCreateSuggestions(practitioner.id, `${firstName} ${lastName}`);
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur lors de la sauvegarde";
    return { error: message };
  }
}
