import { NextResponse } from "next/server";
import { eq, lte, inArray, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { practitioners, bankAccounts, bankTransactions } from "@/lib/db/schema";
import * as bridge from "@/lib/services/bridge.service";
import { verifyCronRequest } from "@/lib/cron-auth";

const SYNC_INTERVAL_DAYS = 15;

export async function POST(request: Request) {
  const auth = await verifyCronRequest(request);
  if (!auth.ok) return auth.response;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SYNC_INTERVAL_DAYS);

  try {
    // Find all accounts where lastSyncAt is older than 15 days
    const staleAccounts = await db
      .select({
        accountId: bankAccounts.id,
        bridgeAccountId: bankAccounts.bridgeAccountId,
        practitionerId: bankAccounts.practitionerId,
      })
      .from(bankAccounts)
      .where(lte(bankAccounts.lastSyncAt, cutoff));

    if (staleAccounts.length === 0) {
      return NextResponse.json({ message: "No accounts to sync", synced: 0 });
    }

    // Group stale accounts by practitioner
    const byPractitioner = new Map<string, typeof staleAccounts>();
    for (const acc of staleAccounts) {
      const list = byPractitioner.get(acc.practitionerId) || [];
      list.push(acc);
      byPractitioner.set(acc.practitionerId, list);
    }

    let totalNewTransactions = 0;
    let totalAccountsSynced = 0;
    const errors: string[] = [];

    for (const [practitionerId, accounts] of byPractitioner) {
      try {
        // Get practitioner's Bridge UUID
        const [practitioner] = await db
          .select({ bridgeUserUuid: practitioners.bridgeUserUuid })
          .from(practitioners)
          .where(eq(practitioners.id, practitionerId));

        if (!practitioner?.bridgeUserUuid) {
          errors.push(`Practitioner ${practitionerId}: no Bridge UUID`);
          continue;
        }

        const { access_token } = await bridge.getAccessToken(practitioner.bridgeUserUuid);

        // Get the latest bridgeUpdatedAt for incremental sync
        const accountIds = accounts.map((a) => a.accountId);
        const [latestSync] = await db
          .select({ latest: max(bankTransactions.bridgeUpdatedAt) })
          .from(bankTransactions)
          .where(inArray(bankTransactions.bankAccountId, accountIds));

        const since = latestSync?.latest
          ? latestSync.latest.toISOString().split("T")[0]
          : undefined;

        // Fetch transactions from Bridge (incremental if possible)
        const { resources: bridgeTransactions } = await bridge.listTransactions(access_token, since);

        // Build a set of bridge account IDs for this practitioner
        const accountMap = new Map(accounts.map((a) => [a.bridgeAccountId, a.accountId]));

        // Filter transactions for this practitioner's accounts
        const relevantTransactions = bridgeTransactions.filter((t) => accountMap.has(t.account_id));

        // Get existing bridge transaction IDs to avoid duplicates
        const existingTx = await db
          .select({ bridgeTransactionId: bankTransactions.bridgeTransactionId })
          .from(bankTransactions)
          .where(inArray(bankTransactions.bankAccountId, accountIds));

        const existingIds = new Set(existingTx.map((t) => t.bridgeTransactionId));
        const newTransactions = relevantTransactions.filter((t) => !existingIds.has(t.id));

        // Wrap inserts + updates in a transaction
        await db.transaction(async (tx) => {
          if (newTransactions.length > 0) {
            await tx.insert(bankTransactions).values(
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
            );
          }

          // Update balances and lastSyncAt
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

        totalNewTransactions += newTransactions.length;
        totalAccountsSynced += accounts.length;

        console.log(
          `[CRON] Synced practitioner ${practitionerId}: ${newTransactions.length} new transactions, ${accounts.length} accounts`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[CRON] Error syncing practitioner ${practitionerId}:`, msg);
        errors.push(`Practitioner ${practitionerId}: ${msg}`);
      }
    }

    return NextResponse.json({
      message: "Sync complete",
      accountsSynced: totalAccountsSynced,
      newTransactions: totalNewTransactions,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CRON] sync-bank fatal error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
