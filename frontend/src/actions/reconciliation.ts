"use server";

import { getSession } from "@/lib/session";
import { reconcileIncomingForPractitioner } from "@/lib/services/reconciliation-runner";
import { getPractitionerByUserId } from "@/lib/data/current-practitioner";

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

  const hp = await getPractitionerByUserId(session.id);
  if (!hp) return { matched: 0 };

  return reconcileIncomingForPractitioner(hp.id);
}
