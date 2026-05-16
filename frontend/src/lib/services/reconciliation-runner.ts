/**
 * Runner serveur du rapprochement automatique entrants.
 *
 * Volontairement séparé de `actions/reconciliation.ts` pour ne PAS être exposé comme server action.
 * Appelable uniquement depuis du code serveur de confiance (jobs cron, hooks post-sync, post-import bordereau).
 * L'action utilisateur (`reconcileIncomingAction`) délègue à ce runner après validation de session.
 */

import { eq, and, inArray, notInArray, sql, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  practitioners,
  practiceLinks,
  carePassages,
  carePayments,
  bankAccounts,
  bankTransactions,
  carePaymentReconciliations,
} from "@/lib/db/schema";
import { namesMatch } from "@/lib/name-matching";
import {
  reconcileBatch,
  type UnmatchedBankTx,
  type UnmatchedCarePayment,
} from "@/lib/services/reconciliation.service";

// Couvre largement les délais caisses (mutuelles parfois > 6 semaines)
// sans charger inutilement les données les plus anciennes.
const LOOKBACK_MONTHS = 18;

function toCents(amount: string | number): number {
  return Math.round(Number(amount) * 100);
}

function lookbackDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - LOOKBACK_MONTHS);
  return d.toISOString().slice(0, 10);
}

/**
 * Réconcilie les virements entrants (caisses, mutuelles) avec les carePayments
 * Ozzen pour UN praticien. Idempotent : ne re-touche jamais les matchs existants.
 */
export async function reconcileIncomingForPractitioner(
  practitionerId: string,
): Promise<{ matched: number }> {
  const [hp] = await db
    .select({ firstName: practitioners.firstName, lastName: practitioners.lastName })
    .from(practitioners)
    .where(eq(practitioners.id, practitionerId));
  if (!hp) return { matched: 0 };

  // 1. Cabinets liés au praticien
  const links = await db
    .select({ practiceId: practiceLinks.practiceId })
    .from(practiceLinks)
    .where(eq(practiceLinks.practitionerId, practitionerId));
  if (links.length === 0) return { matched: 0 };
  const practiceIds = links.map((l) => l.practiceId);

  // 2. Numéros de facture appartenant au praticien (via name matching)
  const fullName = `${hp.firstName} ${hp.lastName}`;
  const lastNamePattern = `%${hp.lastName}%`;
  const preFilteredPassages = await db
    .select({ invoiceNumber: carePassages.invoiceNumber, practitioner: carePassages.practitioner })
    .from(carePassages)
    .where(
      and(
        inArray(carePassages.practiceId, practiceIds),
        sql`${carePassages.practitioner} ILIKE ${lastNamePattern}`,
      ),
    );
  const myInvoiceNumbers = [
    ...new Set(
      preFilteredPassages
        .filter((p) => namesMatch(fullName, p.practitioner))
        .map((p) => p.invoiceNumber),
    ),
  ];
  if (myInvoiceNumbers.length === 0) return { matched: 0 };

  // 3. carePayments du praticien dans la fenêtre, statut "paid"
  const cutoff = lookbackDate();
  const eligibleCps = await db
    .select({
      id: carePayments.id,
      paymentDate: carePayments.paymentDate,
      amountPaid: carePayments.amountPaid,
    })
    .from(carePayments)
    .where(
      and(
        inArray(carePayments.practiceId, practiceIds),
        inArray(carePayments.invoiceNumber, myInvoiceNumbers),
        eq(carePayments.status, "paid"),
        gte(carePayments.paymentDate, cutoff),
      ),
    );
  if (eligibleCps.length === 0) return { matched: 0 };

  // 4. Réconciliations existantes — scopées aux carePayments du praticien (pas de full table scan)
  const eligibleIds = eligibleCps.map((c) => c.id);
  const alreadyMatched = await db
    .select({ carePaymentId: carePaymentReconciliations.carePaymentId })
    .from(carePaymentReconciliations)
    .where(inArray(carePaymentReconciliations.carePaymentId, eligibleIds));
  const alreadyMatchedSet = new Set(alreadyMatched.map((r) => r.carePaymentId));
  const cps = eligibleCps.filter((c) => !alreadyMatchedSet.has(c.id));
  if (cps.length === 0) return { matched: 0 };

  // 5. bankTransactions entrantes du praticien dans la fenêtre,
  //    en excluant celles déjà référencées par une réconciliation existante :
  //    une bt est soit entièrement matchée (pass 1 ou subset complet pass 2),
  //    soit pas du tout — jamais "partiellement" disponible.
  const accountIds = (
    await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(eq(bankAccounts.practitionerId, practitionerId))
  ).map((a) => a.id);
  if (accountIds.length === 0) return { matched: 0 };

  const usedBtIds = (
    await db
      .select({ id: carePaymentReconciliations.bankTransactionId })
      .from(carePaymentReconciliations)
      .innerJoin(bankTransactions, eq(bankTransactions.id, carePaymentReconciliations.bankTransactionId))
      .where(inArray(bankTransactions.bankAccountId, accountIds))
  ).map((r) => r.id);

  const bts = await db
    .select({
      id: bankTransactions.id,
      date: bankTransactions.date,
      amount: bankTransactions.amount,
    })
    .from(bankTransactions)
    .where(
      and(
        inArray(bankTransactions.bankAccountId, accountIds),
        gte(bankTransactions.date, cutoff),
        sql`${bankTransactions.amount} > 0`,
        ...(usedBtIds.length > 0 ? [notInArray(bankTransactions.id, usedBtIds)] : []),
      ),
    );
  if (bts.length === 0) return { matched: 0 };

  // 6. Conversion en centimes + lancement de l'algo
  const cpInputs: UnmatchedCarePayment[] = cps.map((cp) => ({
    id: cp.id,
    paymentDate: cp.paymentDate,
    amountCents: toCents(cp.amountPaid),
  }));
  const btInputs: UnmatchedBankTx[] = bts.map((bt) => ({
    id: bt.id,
    date: bt.date,
    amountCents: toCents(bt.amount),
  }));

  const matches = reconcileBatch(btInputs, cpInputs);
  if (matches.length === 0) return { matched: 0 };

  // 7. Insertion en base. UNIQUE(care_payment_id) protège contre les doublons en cas de
  // runs concurrents : onConflictDoNothing garantit l'idempotence.
  await db
    .insert(carePaymentReconciliations)
    .values(
      matches.map((m) => ({
        carePaymentId: m.carePaymentId,
        bankTransactionId: m.bankTransactionId,
        pass: m.pass,
      })),
    )
    .onConflictDoNothing({ target: carePaymentReconciliations.carePaymentId });

  return { matched: matches.length };
}
