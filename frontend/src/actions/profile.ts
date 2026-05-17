"use server";

import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { bankAlerts, practitioners } from "@/lib/db/schema";

export async function updateProfileAction(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorise" };
  }

  try {
    const firstName = (formData.get("firstName") as string)?.trim();
    const lastName = (formData.get("lastName") as string)?.trim();
    const rppsNumber = (formData.get("rppsNumber") as string)?.trim();
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
    const carpimkoPayDay = formData.get("carpimkoPayDay") as string;
    const daysPerWeekWorkedRaw = formData.get("daysPerWeekWorked") as string;
    const daysPerWeekWorked = Math.max(1, Math.min(7, parseInt(daysPerWeekWorkedRaw, 10) || 5));

    if (!firstName || !lastName || !profession || !activityStartDate || !taxRegime) {
      return { error: "Tous les champs sont requis" };
    }

    await db
      .update(practitioners)
      .set({
        firstName,
        lastName,
        rppsNumber: rppsNumber || null,
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
        carpimkoPayDay: (carpimkoPayDay as "5" | "10" | "15" | "20" | "25") || "10",
        daysPerWeekWorked,
        updatedAt: new Date(),
      })
      .where(eq(practitioners.userId, session.id));

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur lors de la mise a jour";
    return { error: message };
  }
}

export async function updateNotificationsAction(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorisé" };
  }

  const recapEnabled = formData.get("recapEnabled") === "on";
  const recapFreqRaw = formData.get("recapFrequency") as string | null;
  const recapFrequency: "none" | "monthly" | "quarterly" = !recapEnabled
    ? "none"
    : recapFreqRaw === "quarterly"
      ? "quarterly"
      : "monthly";

  const deadlinesReminderEnabled = formData.get("deadlinesReminderEnabled") === "on";

  const rejectionEnabled = formData.get("rejectionAlertEnabled") === "on";
  const rejectionRaw = (formData.get("rejectionAlertThreshold") as string | null)?.trim();
  let rejectionThreshold: number | null = null;
  if (rejectionEnabled) {
    const n = parseFloat(rejectionRaw ?? "");
    if (!Number.isFinite(n) || n < 0.5 || n > 50) {
      return { error: "Le seuil du taux de rejet doit être compris entre 0,5 et 50 %." };
    }
    rejectionThreshold = n;
  }

  const treasuryEnabled = formData.get("treasuryAlertEnabled") === "on";
  const treasuryRaw = (formData.get("treasuryAlertThreshold") as string | null)?.trim();
  let treasuryThreshold: number | null = null;
  if (treasuryEnabled) {
    const n = parseFloat(treasuryRaw ?? "");
    if (!Number.isFinite(n) || n < 0) {
      return { error: "Le seuil de trésorerie doit être un nombre positif." };
    }
    treasuryThreshold = n;
  }

  try {
    const [p] = await db
      .select({ id: practitioners.id, defaultBankAccountId: practitioners.defaultBankAccountId })
      .from(practitioners)
      .where(eq(practitioners.userId, session.id));
    if (!p) return { error: "Profil introuvable" };

    const practitionerUpdate: Record<string, unknown> = {
      recapFrequency,
      deadlinesReminderEnabled,
      rejectionAlertEnabled: rejectionEnabled,
      rejectionAlertLastSentAt: null,
      updatedAt: new Date(),
    };
    if (rejectionThreshold !== null) {
      practitionerUpdate.rejectionAlertThreshold = rejectionThreshold.toFixed(2);
    }

    await db.update(practitioners).set(practitionerUpdate).where(eq(practitioners.id, p.id));

    if (p.defaultBankAccountId) {
      const [existing] = await db
        .select({ id: bankAlerts.id })
        .from(bankAlerts)
        .where(and(
          eq(bankAlerts.practitionerId, p.id),
          eq(bankAlerts.bankAccountId, p.defaultBankAccountId),
        ));

      if (existing) {
        const bankUpdate: Record<string, unknown> = {
          enabled: treasuryEnabled,
          lastTriggeredAt: null,
        };
        if (treasuryThreshold !== null) {
          bankUpdate.threshold = String(treasuryThreshold);
        }
        await db.update(bankAlerts).set(bankUpdate).where(eq(bankAlerts.id, existing.id));
      } else if (treasuryEnabled && treasuryThreshold !== null) {
        await db.insert(bankAlerts).values({
          practitionerId: p.id,
          bankAccountId: p.defaultBankAccountId,
          threshold: String(treasuryThreshold),
          enabled: true,
        });
      }
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur lors de la mise à jour";
    return { error: message };
  }
}
