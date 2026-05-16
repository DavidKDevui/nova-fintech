"use server";

import { eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners, bankAccounts, bankTransactions } from "@/lib/db/schema";
import * as bridge from "@/lib/services/bridge.service";
import { reconcileIncomingForPractitioner } from "@/lib/services/reconciliation-runner";

export async function connectBankAction() {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorisé" };
  }

  try {
    // Get HP profile
    const [hp] = await db
      .select()
      .from(practitioners)
      .where(eq(practitioners.userId, session.id));

    if (!hp) {
      return { error: "Profil professionnel requis" };
    }

    // Create Bridge user if not exists
    let bridgeUserUuid = hp.bridgeUserUuid;

    if (!bridgeUserUuid) {
      const bridgeUser = await bridge.createUser(session.id);
      bridgeUserUuid = bridgeUser.uuid;

      await db
        .update(practitioners)
        .set({ bridgeUserUuid, updatedAt: new Date() })
        .where(eq(practitioners.userId, session.id));
    }

    // Get access token
    const { access_token } = await bridge.getAccessToken(bridgeUserUuid);

    // Build redirect URL back to our app
    const headersList = await headers();
    const host = headersList.get("host") || "localhost:3000";
    const protocol = headersList.get("x-forwarded-proto") || "http";
    const redirectUrl = `${protocol}://${host}/callback/bridge`;

    // Create connect session
    const connectSession = await bridge.createConnectSession(access_token, session.email, redirectUrl);

    return { url: connectSession.url };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    console.error("[BRIDGE] connectBankAction:", raw);

    if (raw.includes("401") || raw.includes("403")) {
      return { error: "Authentification bancaire échouée. Veuillez réessayer." };
    }
    if (raw.includes("429")) {
      return { error: "Trop de requêtes. Veuillez patienter quelques instants." };
    }
    if (raw.includes("500") || raw.includes("502") || raw.includes("503")) {
      return { error: "Le service bancaire est temporairement indisponible." };
    }
    return { error: "Erreur lors de la connexion bancaire. Veuillez réessayer." };
  }
}

export async function fetchAccountsAction() {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorisé" };
  }

  try {
    const [hp] = await db
      .select()
      .from(practitioners)
      .where(eq(practitioners.userId, session.id));

    if (!hp?.bridgeUserUuid) {
      return { error: "Aucune banque connectée" };
    }

    const { access_token } = await bridge.getAccessToken(hp.bridgeUserUuid);
    const { resources } = await bridge.listAccounts(access_token);

    return { accounts: resources };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    console.error("[BRIDGE] fetch error:", raw);
    return { error: "Impossible de récupérer les données bancaires. Veuillez réessayer." };
  }
}

export async function fetchTransactionsAction(since?: string) {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorisé" };
  }

  try {
    const [hp] = await db
      .select()
      .from(practitioners)
      .where(eq(practitioners.userId, session.id));

    if (!hp?.bridgeUserUuid) {
      return { error: "Aucune banque connectée" };
    }

    const { access_token } = await bridge.getAccessToken(hp.bridgeUserUuid);
    const result = await bridge.listTransactions(access_token, since);

    return { transactions: result.resources };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    console.error("[BRIDGE] fetch error:", raw);
    return { error: "Impossible de récupérer les données bancaires. Veuillez réessayer." };
  }
}

export async function fetchLocalAccountsAction() {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorisé" };
  }

  try {
    const [hp] = await db
      .select()
      .from(practitioners)
      .where(eq(practitioners.userId, session.id));

    if (!hp) {
      return { error: "Profil professionnel requis" };
    }

    const accounts = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.practitionerId, hp.id));

    return { accounts };
  } catch (err: unknown) {
    console.error("[DB] fetchLocalAccounts error:", err);
    return { error: "Impossible de récupérer les comptes." };
  }
}

export async function fetchLocalTransactionsAction() {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorisé" };
  }

  try {
    const [hp] = await db
      .select()
      .from(practitioners)
      .where(eq(practitioners.userId, session.id));

    if (!hp) {
      return { error: "Profil professionnel requis" };
    }

    const accounts = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(eq(bankAccounts.practitionerId, hp.id));

    if (accounts.length === 0) {
      return { transactions: [] };
    }

    const accountIds = accounts.map((a) => a.id);

    const transactions = await db
      .select()
      .from(bankTransactions)
      .where(inArray(bankTransactions.bankAccountId, accountIds));

    return { transactions };
  } catch (err: unknown) {
    console.error("[DB] fetchLocalTransactions error:", err);
    return { error: "Impossible de récupérer les transactions." };
  }
}

export async function initialSyncAction(itemId?: number) {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorisé" };
  }

  try {
    const [hp] = await db
      .select()
      .from(practitioners)
      .where(eq(practitioners.userId, session.id));

    if (!hp?.bridgeUserUuid) {
      return { error: "Aucune banque connectée" };
    }

    // Check if accounts already exist — prevent duplicate syncs
    const existingAccounts = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(eq(bankAccounts.practitionerId, hp.id))
      .limit(1);

    if (existingAccounts.length > 0) {
      return { alreadySynced: true };
    }

    const { access_token } = await bridge.getAccessToken(hp.bridgeUserUuid);

    // Fetch accounts from Bridge (filter by item_id if available)
    // Bridge may not have accounts ready immediately after connect — retry with delay
    // Only keep accounts with a balance (= actually synced/authorized by user)
    let accounts: Awaited<ReturnType<typeof bridge.listAccounts>>["resources"] = [];
    const maxAttempts = itemId ? 4 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      const { resources: allAccounts } = await bridge.listAccounts(access_token);
      const filtered = itemId ? allAccounts.filter((a) => a.item_id === itemId) : allAccounts;
      accounts = filtered.filter((a) => a.balance != null);
      if (accounts.length > 0) break;
    }

    if (accounts.length === 0) {
      return { error: "Aucun compte bancaire trouvé" };
    }

    const now = new Date();

    // Insert accounts
    const insertedAccounts = await db
      .insert(bankAccounts)
      .values(
        accounts.map((a) => ({
          practitionerId: hp.id,
          bridgeAccountId: a.id,
          name: a.name,
          balance: a.balance != null ? String(a.balance) : null,
          currencyCode: a.currency_code,
          type: a.type,
          status: a.status || "active",
          lastSyncAt: now,
          updatedAt: now,
        })),
      )
      .returning({ id: bankAccounts.id, bridgeAccountId: bankAccounts.bridgeAccountId });

    // Build bridgeAccountId -> uuid map
    const accountMap = new Map(insertedAccounts.map((a) => [a.bridgeAccountId, a.id]));

    // Fetch transactions from Bridge — may not be ready yet for freshly connected items
    let transactionCount = 0;
    try {
      const { resources: transactions } = await bridge.listTransactions(access_token);
      const relevantTransactions = transactions.filter((t) => accountMap.has(t.account_id));

      if (relevantTransactions.length > 0) {
        await db.insert(bankTransactions).values(
          relevantTransactions.map((t) => ({
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
      transactionCount = relevantTransactions.length;
    } catch (txErr) {
      // Transactions may not be available yet — accounts are still synced successfully
      console.warn("[BRIDGE] Transactions not yet available:", txErr);
    }

    // Best-effort : tente un rapprochement automatique avec les bordereaux existants.
    if (transactionCount > 0) {
      try {
        await reconcileIncomingForPractitioner(hp.id);
      } catch (recErr) {
        console.error("[BRIDGE] reconciliation failed after initial sync:", recErr);
      }
    }

    return { success: true, accountCount: accounts.length, transactionCount };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    console.error("[BRIDGE] initialSync error:", raw);

    if (raw.includes("429")) {
      return { error: "Trop de requêtes. Veuillez patienter quelques instants." };
    }
    return { error: "Erreur lors de la synchronisation bancaire. Veuillez réessayer." };
  }
}

export async function disconnectBankAction() {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorisé" };
  }

  try {
    const [hp] = await db
      .select()
      .from(practitioners)
      .where(eq(practitioners.userId, session.id));

    if (!hp) {
      return { error: "Profil professionnel requis" };
    }

    // Delete all bank data in a transaction (cascade handles transactions)
    await db.transaction(async (tx) => {
      await tx
        .delete(bankAccounts)
        .where(eq(bankAccounts.practitionerId, hp.id));

      await tx
        .update(practitioners)
        .set({ bridgeUserUuid: null, updatedAt: new Date() })
        .where(eq(practitioners.id, hp.id));
    });

    return { success: true };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    console.error("[BRIDGE] disconnectBank error:", raw);
    return { error: "Erreur lors de la déconnexion bancaire." };
  }
}
