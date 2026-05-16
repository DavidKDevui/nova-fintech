import { eq, lte, inArray, max } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { practitioners, bankAccounts, bankTransactions } from "@/lib/db/schema";
import * as bridge from "@/lib/services/bridge.service";
import { reconcileIncomingForPractitioner } from "@/lib/services/reconciliation-runner";

const AUTO_CATEGORIZE_THRESHOLD = 0.85;

const SYNC_INTERVAL_DAYS = 15;

export type SyncBankResult = {
  accountsSynced: number;
  newTransactions: number;
  autoCategorized: number;
  errors: string[];
};

async function autoCategorizeBySimilarity(accountIds: string[], newTxIds: string[]): Promise<number> {
  if (newTxIds.length === 0 || accountIds.length === 0) return 0;
  try {
    const result = await pool.query(
      `UPDATE bank_transactions nt
       SET category = m.category, categorization_source = 'auto_similarity'
       FROM (
         SELECT DISTINCT ON (target.id) target.id, src.category
         FROM bank_transactions target
         JOIN bank_transactions src
           ON src.bank_account_id = ANY($1::uuid[])
          AND src.id <> target.id
          AND src.category IS NOT NULL
          AND ((target.amount >= 0 AND src.amount >= 0) OR (target.amount < 0 AND src.amount < 0))
          AND similarity(
            COALESCE(target.clean_description, target.description),
            COALESCE(src.clean_description, src.description)
          ) >= $3
         WHERE target.id = ANY($2::uuid[])
         ORDER BY
           target.id,
           similarity(
             COALESCE(target.clean_description, target.description),
             COALESCE(src.clean_description, src.description)
           ) DESC
       ) m
       WHERE nt.id = m.id`,
      [accountIds, newTxIds, AUTO_CATEGORIZE_THRESHOLD],
    );
    return result.rowCount ?? 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-bank] auto-categorization failed:", msg);
    return 0;
  }
}

export async function runSyncBank(): Promise<SyncBankResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SYNC_INTERVAL_DAYS);

  const staleAccounts = await db
    .select({
      accountId: bankAccounts.id,
      bridgeAccountId: bankAccounts.bridgeAccountId,
      practitionerId: bankAccounts.practitionerId,
    })
    .from(bankAccounts)
    .where(lte(bankAccounts.lastSyncAt, cutoff));

  if (staleAccounts.length === 0) {
    return { accountsSynced: 0, newTransactions: 0, autoCategorized: 0, errors: [] };
  }

  const byPractitioner = new Map<string, typeof staleAccounts>();
  for (const acc of staleAccounts) {
    const list = byPractitioner.get(acc.practitionerId) || [];
    list.push(acc);
    byPractitioner.set(acc.practitionerId, list);
  }

  let totalNewTransactions = 0;
  let totalAccountsSynced = 0;
  let totalAutoCategorized = 0;
  const errors: string[] = [];

  for (const [practitionerId, accounts] of byPractitioner) {
    try {
      const [practitioner] = await db
        .select({ bridgeUserUuid: practitioners.bridgeUserUuid })
        .from(practitioners)
        .where(eq(practitioners.id, practitionerId));

      if (!practitioner?.bridgeUserUuid) {
        errors.push(`Practitioner ${practitionerId}: no Bridge UUID`);
        continue;
      }

      const { access_token } = await bridge.getAccessToken(practitioner.bridgeUserUuid);

      const accountIds = accounts.map((a) => a.accountId);
      const [latestSync] = await db
        .select({ latest: max(bankTransactions.bridgeUpdatedAt) })
        .from(bankTransactions)
        .where(inArray(bankTransactions.bankAccountId, accountIds));

      const since = latestSync?.latest
        ? latestSync.latest.toISOString().split("T")[0]
        : undefined;

      const { resources: bridgeTransactions } = await bridge.listTransactions(access_token, since);

      const accountMap = new Map(accounts.map((a) => [a.bridgeAccountId, a.accountId]));

      const relevantTransactions = bridgeTransactions.filter((t) => accountMap.has(t.account_id));

      const existingTx = await db
        .select({ bridgeTransactionId: bankTransactions.bridgeTransactionId })
        .from(bankTransactions)
        .where(inArray(bankTransactions.bankAccountId, accountIds));

      const existingIds = new Set(existingTx.map((t) => t.bridgeTransactionId));
      const newTransactions = relevantTransactions.filter((t) => !existingIds.has(t.id));

      const insertedIds: string[] = [];
      await db.transaction(async (tx) => {
        if (newTransactions.length > 0) {
          const inserted = await tx
            .insert(bankTransactions)
            .values(
              newTransactions.map((t) => ({
                bankAccountId: accountMap.get(t.account_id)!,
                bridgeTransactionId: t.id,
                amount: String(t.amount),
                currencyCode: t.currency_code,
                date: t.date,
                description: t.description || t.clean_description || "",
                cleanDescription: t.clean_description || null,
                operationType: t.operation_type || null,
                categoryId: t.category_id,
                bridgeUpdatedAt: new Date(t.updated_at),
              })),
            )
            .returning({ id: bankTransactions.id });
          insertedIds.push(...inserted.map((r) => r.id));
        }

        const { resources: bridgeAccounts } = await bridge.listAccounts(access_token);
        const now = new Date();

        await Promise.all(
          accounts.map((acc) => {
            const bridgeAcc = bridgeAccounts.find((ba) => ba.id === acc.bridgeAccountId);
            return tx
              .update(bankAccounts)
              .set({
                ...(bridgeAcc ? { balance: String(bridgeAcc.balance) } : {}),
                lastSyncAt: now,
                updatedAt: now,
              })
              .where(eq(bankAccounts.id, acc.accountId));
          }),
        );
      });

      const autoCount = await autoCategorizeBySimilarity(accountIds, insertedIds);

      // Tente un rapprochement automatique avec les bordereaux du praticien.
      // Idempotent : si aucun nouveau virement entrant n'est arrivé, ne fait rien.
      let matchedCount = 0;
      if (insertedIds.length > 0) {
        try {
          matchedCount = (await reconcileIncomingForPractitioner(practitionerId)).matched;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[sync-bank] reconciliation failed for practitioner ${practitionerId}:`, msg);
        }
      }

      totalNewTransactions += newTransactions.length;
      totalAccountsSynced += accounts.length;
      totalAutoCategorized += autoCount;

      console.log(`[sync-bank] practitioner ${practitionerId}: ${newTransactions.length} new transactions, ${autoCount} auto-categorized, ${matchedCount} reconciled, ${accounts.length} accounts`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[sync-bank] error for practitioner ${practitionerId}:`, msg);
      errors.push(`Practitioner ${practitionerId}: ${msg}`);
    }
  }

  return {
    accountsSynced: totalAccountsSynced,
    newTransactions: totalNewTransactions,
    autoCategorized: totalAutoCategorized,
    errors,
  };
}
