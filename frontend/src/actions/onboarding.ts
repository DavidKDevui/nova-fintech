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
  const profession = formData.get("profession") as string;
  const activityStartDate = formData.get("activityStartDate") as string;
  const taxRegime = formData.get("taxRegime") as string;
  const retrocessionType = (formData.get("retrocessionType") as string) || null;
  const retrocessionValue = (formData.get("retrocessionValue") as string)?.trim() || null;
  const pasFrequency = formData.get("pasFrequency") as string;

  if (!firstName || !lastName || !profession || !activityStartDate || !taxRegime || !pasFrequency) {
    return { error: "Tous les champs sont requis" };
  }

  if (!["nurse"].includes(profession)) {
    return { error: "Profession invalide" };
  }

  if (!["bnc", "micro_bnc"].includes(taxRegime)) {
    return { error: "Régime fiscal invalide" };
  }

  if (!["monthly", "quarterly"].includes(pasFrequency)) {
    return { error: "Fréquence de prélèvement invalide" };
  }

  if (retrocessionValue !== null) {
    if (!retrocessionType || !["percentage", "fixed"].includes(retrocessionType)) {
      return { error: "Type de rétrocession invalide" };
    }
    const val = parseFloat(retrocessionValue);
    if (isNaN(val) || val < 0) {
      return { error: "La valeur de rétrocession doit être positive" };
    }
    if (retrocessionType === "percentage" && val > 100) {
      return { error: "Le taux de rétrocession doit être entre 0 et 100%" };
    }
  }

  try {
    const [practitioner] = await db.insert(practitioners).values({
      userId: session.id,
      firstName,
      lastName,
      profession: profession as "nurse",
      activityStartDate,
      taxRegime: taxRegime as "bnc" | "micro_bnc",
      retrocessionType: retrocessionValue ? (retrocessionType as "percentage" | "fixed") : null,
      retrocessionValue: retrocessionValue,
      pasFrequency: pasFrequency as "monthly" | "quarterly",
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
