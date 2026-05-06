"use server";

import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners } from "@/lib/db/schema";

export async function updateProfileAction(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorise" };
  }

  try {
    const firstName = (formData.get("firstName") as string)?.trim();
    const lastName = (formData.get("lastName") as string)?.trim();
    const profession = formData.get("profession") as string;
    const activityStartDate = formData.get("activityStartDate") as string;
    const taxRegime = formData.get("taxRegime") as string;
    const retrocessionType = (formData.get("retrocessionType") as string) || null;
    const retrocessionValue = (formData.get("retrocessionValue") as string)?.trim() || null;
    const urssafFrequency = formData.get("urssafFrequency") as string;
    const urssafPayDay = formData.get("urssafPayDay") as string;
    const pasFrequency = formData.get("pasFrequency") as string;
    const pasRate = (formData.get("pasRate") as string)?.trim() || "10";
    const carpimkoFrequency = formData.get("carpimkoFrequency") as string;

    if (!firstName || !lastName || !profession || !activityStartDate || !taxRegime) {
      return { error: "Tous les champs sont requis" };
    }

    await db
      .update(practitioners)
      .set({
        firstName,
        lastName,
        profession: profession as "nurse",
        activityStartDate,
        taxRegime: taxRegime as "bnc" | "micro_bnc",
        retrocessionType: retrocessionValue ? (retrocessionType as "percentage" | "fixed") : null,
        retrocessionValue: retrocessionValue,
        urssafFrequency: (urssafFrequency as "monthly" | "quarterly") || "monthly",
        urssafPayDay: (urssafPayDay as "5" | "20") || "5",
        pasFrequency: (pasFrequency as "monthly" | "quarterly") || "monthly",
        pasRate,
        carpimkoFrequency: (carpimkoFrequency as "monthly" | "semi_annual") || "monthly",
        updatedAt: new Date(),
      })
      .where(eq(practitioners.userId, session.id));

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur lors de la mise a jour";
    return { error: message };
  }
}
