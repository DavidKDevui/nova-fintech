"use server";

import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners } from "@/lib/db/schema";
import { reconcileIncomingForPractitioner } from "@/lib/services/reconciliation-runner";

/**
 * Server action utilisateur : déclenche le rapprochement automatique des virements
 * entrants du praticien connecté avec ses carePayments Ozzen.
 *
 * Le travail réel est délégué au runner serveur dans lib/services/reconciliation-runner.ts —
 * volontairement séparé pour ne pas exposer la version par-ID comme RPC ouvert au client.
 */
export async function reconcileIncomingAction(): Promise<{ matched: number }> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return { matched: 0 };

  const [hp] = await db
    .select({ id: practitioners.id })
    .from(practitioners)
    .where(eq(practitioners.userId, session.id));
  if (!hp) return { matched: 0 };

  return reconcileIncomingForPractitioner(hp.id);
}
