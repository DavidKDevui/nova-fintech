"use server";

import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners, bankAlerts } from "@/lib/db/schema";

async function getPractitioner() {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return null;
  const [p] = await db
    .select({ id: practitioners.id, defaultBankAccountId: practitioners.defaultBankAccountId })
    .from(practitioners)
    .where(eq(practitioners.userId, session.id));
  return p ?? null;
}

export async function getBankAlertAction() {
  const practitioner = await getPractitioner();
  if (!practitioner?.defaultBankAccountId) return { alert: null };

  const [alert] = await db
    .select({
      id: bankAlerts.id,
      threshold: bankAlerts.threshold,
      enabled: bankAlerts.enabled,
    })
    .from(bankAlerts)
    .where(
      and(
        eq(bankAlerts.practitionerId, practitioner.id),
        eq(bankAlerts.bankAccountId, practitioner.defaultBankAccountId),
      ),
    );

  return { alert: alert ?? null };
}

export async function upsertBankAlertAction(threshold: number, enabled: boolean) {
  const practitioner = await getPractitioner();
  if (!practitioner?.defaultBankAccountId) {
    return { error: "Aucun compte par défaut configuré" };
  }

  if (threshold < 0) {
    return { error: "Le seuil doit être positif" };
  }

  try {
    const [existing] = await db
      .select({ id: bankAlerts.id })
      .from(bankAlerts)
      .where(
        and(
          eq(bankAlerts.practitionerId, practitioner.id),
          eq(bankAlerts.bankAccountId, practitioner.defaultBankAccountId),
        ),
      );

    if (existing) {
      await db
        .update(bankAlerts)
        .set({
          threshold: String(threshold),
          enabled,
          // Réinitialiser le cooldown si le seuil change
          lastTriggeredAt: null,
        })
        .where(eq(bankAlerts.id, existing.id));
    } else {
      await db.insert(bankAlerts).values({
        practitionerId: practitioner.id,
        bankAccountId: practitioner.defaultBankAccountId,
        threshold: String(threshold),
        enabled,
      });
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur lors de la sauvegarde";
    return { error: message };
  }
}
