"use server";

import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners } from "@/lib/db/schema";

export type RejectionAlertConfig = {
  enabled: boolean;
  threshold: number; // pourcentage, ex. 5 = 5 %
};

export async function getRejectionAlertAction(): Promise<{ alert: RejectionAlertConfig | null }> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return { alert: null };

  const [row] = await db
    .select({
      enabled: practitioners.rejectionAlertEnabled,
      threshold: practitioners.rejectionAlertThreshold,
    })
    .from(practitioners)
    .where(eq(practitioners.userId, session.id));

  if (!row) return { alert: null };

  return {
    alert: {
      enabled: row.enabled,
      threshold: Number(row.threshold),
    },
  };
}

export async function upsertRejectionAlertAction(threshold: number, enabled: boolean) {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorisé" };
  }

  // Borné [0,5 %, 50 %] pour éviter saisies absurdes (0 % spam permanent,
  // > 50 % jamais déclenché).
  if (!Number.isFinite(threshold)) {
    return { error: "Seuil invalide" };
  }
  const clamped = Math.min(50, Math.max(0.5, threshold));

  try {
    await db
      .update(practitioners)
      .set({
        rejectionAlertEnabled: enabled,
        rejectionAlertThreshold: clamped.toFixed(2),
        // Reset le cooldown si le seuil change : prochaine exécution du job
        // peut envoyer immédiatement si la condition est remplie.
        rejectionAlertLastSentAt: null,
        updatedAt: new Date(),
      })
      .where(eq(practitioners.userId, session.id));
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur lors de la sauvegarde";
    return { error: message };
  }
}
