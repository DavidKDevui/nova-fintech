"use server";

import { eq, and, inArray, isNull, desc, asc, count, sum, sql, gte, lte, ilike, or } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db, pool } from "@/lib/db";
import { practitioners, bankAccounts, bankTransactions } from "@/lib/db/schema";

const VALID_CATEGORIES = [
  "income", "professional_reimbursement", "royalty", "urssaf", "carpimko",
  "professional_expenses", "retrocession", "madelin", "reprocessing", "taxes", "cfe", "compensation",
] as const;

export async function updateTransactionCategoryAction(transactionId: string, category: string | null) {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorisé" };
  }

  if (category !== null && !VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
    return { error: "Catégorie invalide" };
  }

  try {
    const [hp] = await db.select().from(practitioners).where(eq(practitioners.userId, session.id));
    if (!hp) return { error: "Profil professionnel requis" };

    const accounts = await db.select({ id: bankAccounts.id }).from(bankAccounts).where(eq(bankAccounts.practitionerId, hp.id));
    const accountIds = accounts.map((a) => a.id);
    if (accountIds.length === 0) return { error: "Aucun compte" };

    const [tx] = await db
      .select()
      .from(bankTransactions)
      .where(and(eq(bankTransactions.id, transactionId), inArray(bankTransactions.bankAccountId, accountIds)));

    if (!tx) return { error: "Transaction introuvable" };

    // Update the target transaction
    await db.update(bankTransactions).set({ category }).where(eq(bankTransactions.id, transactionId));

    // Auto-categorize similar uncategorized transactions
    let autoCount = 0;
    if (category !== null) {
      const txDescription = tx.cleanDescription || tx.description;
      const amountCond = Number(tx.amount) >= 0 ? "amount >= 0" : "amount < 0";
      const placeholders = accountIds.map((_, i) => `$${i + 4}`).join(", ");

      try {
        // Try pg_trgm first (fast, in-DB)
        const result = await pool.query(
          `UPDATE bank_transactions
           SET category = $1
           WHERE id != $2
             AND bank_account_id IN (${placeholders})
             AND category IS NULL
             AND ${amountCond}
             AND similarity(COALESCE(clean_description, description), $3) >= 0.8`,
          [category, transactionId, txDescription, ...accountIds],
        );
        autoCount = result.rowCount ?? 0;
      } catch {
        // Fallback: Levenshtein in JS
        const candidates = await db
          .select({ id: bankTransactions.id, description: bankTransactions.description, cleanDescription: bankTransactions.cleanDescription })
          .from(bankTransactions)
          .where(and(
            inArray(bankTransactions.bankAccountId, accountIds),
            isNull(bankTransactions.category),
            Number(tx.amount) >= 0 ? sql`amount >= 0` : sql`amount < 0`,
          ));

        const ref = txDescription.toLowerCase().trim();
        const matchIds: string[] = [];
        for (const c of candidates) {
          if (c.id === transactionId) continue;
          const desc = (c.cleanDescription || c.description).toLowerCase().trim();
          const maxLen = Math.max(ref.length, desc.length);
          if (maxLen === 0 || ref === desc) { matchIds.push(c.id); continue; }
          // Simple Levenshtein
          const m = ref.length, n = desc.length;
          const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
          for (let i = 1; i <= m; i++) {
            let prev = dp[0]!; dp[0] = i;
            for (let j = 1; j <= n; j++) {
              const tmp = dp[j]!;
              dp[j] = ref[i - 1] === desc[j - 1] ? prev : 1 + Math.min(prev, dp[j]!, dp[j - 1]!);
              prev = tmp;
            }
          }
          if (1 - dp[n]! / maxLen >= 0.8) matchIds.push(c.id);
        }

        if (matchIds.length > 0) {
          await db.update(bankTransactions).set({ category }).where(inArray(bankTransactions.id, matchIds));
        }
        autoCount = matchIds.length;
      }
    }

    return { success: true, autoCount };
  } catch (err: unknown) {
    console.error("[DB] updateTransactionCategory error:", err);
    return { error: "Impossible de mettre à jour la catégorie." };
  }
}

export async function getTransactionKpisAction(accountId?: string | null, year?: number) {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { encaissement: 0, decaissement: 0 };
  }

  const kpiYear = year ?? new Date().getFullYear();

  try {
    const [hp] = await db.select().from(practitioners).where(eq(practitioners.userId, session.id));
    if (!hp) return { encaissement: 0, decaissement: 0 };

    let accountIds: string[];
    if (accountId) {
      accountIds = [accountId];
    } else {
      const accounts = await db.select({ id: bankAccounts.id }).from(bankAccounts).where(eq(bankAccounts.practitionerId, hp.id));
      if (accounts.length === 0) return { encaissement: 0, decaissement: 0 };
      accountIds = accounts.map((a) => a.id);
    }

    const yearFilter = and(
      gte(bankTransactions.date, `${kpiYear}-01-01`),
      lte(bankTransactions.date, `${kpiYear}-12-31`),
    );
    const accountFilter = and(inArray(bankTransactions.bankAccountId, accountIds), yearFilter);

    const depenseFilter = and(
      accountFilter,
      inArray(bankTransactions.category, ["urssaf", "carpimko", "professional_expenses", "retrocession", "madelin"]),
      sql`${bankTransactions.amount} < 0`,
    );

    const [encaissementRow, decaissementRow, remunerationRow, depenseCountRow] = await Promise.all([
      // Encaissement = somme des transactions positives catégorisées "income" ou "royalty"
      db
        .select({ total: sum(bankTransactions.amount) })
        .from(bankTransactions)
        .where(and(accountFilter, inArray(bankTransactions.category, ["income", "royalty"]), sql`${bankTransactions.amount} > 0`)),
      // Décaissement = somme absolue des transactions négatives catégorisées dépenses
      db
        .select({ total: sum(bankTransactions.amount) })
        .from(bankTransactions)
        .where(depenseFilter),
      // Rémunération = somme absolue des transactions négatives catégorisées "compensation"
      db
        .select({ total: sum(bankTransactions.amount) })
        .from(bankTransactions)
        .where(and(accountFilter, eq(bankTransactions.category, "compensation"), sql`${bankTransactions.amount} < 0`)),
      // Nombre de transactions dépenses
      db
        .select({ total: count() })
        .from(bankTransactions)
        .where(depenseFilter),
    ]);

    // Cotisations sociales = urssaf + carpimko
    const [cotisationsRow] = await db
      .select({ total: sum(bankTransactions.amount) })
      .from(bankTransactions)
      .where(and(accountFilter, inArray(bankTransactions.category, ["urssaf", "carpimko"]), sql`${bankTransactions.amount} < 0`));

    return {
      encaissement: Math.abs(Number(encaissementRow[0]?.total ?? 0)),
      decaissement: Math.abs(Number(decaissementRow[0]?.total ?? 0)),
      remuneration: Math.abs(Number(remunerationRow[0]?.total ?? 0)),
      cotisations: Math.abs(Number(cotisationsRow?.total ?? 0)),
      nbTransactionsDepenses: depenseCountRow[0]?.total ?? 0,
    };
  } catch {
    return { encaissement: 0, decaissement: 0, remuneration: 0, cotisations: 0, nbTransactionsDepenses: 0 };
  }
}

export type MonthlyActivityMonth = {
  month: number;
  income: number;
  cotisations: number;
  autresDepenses: number;
  urssaf: number;
  carpimko: number;
  chargesPro: number;
  retrocession: number;
  madelin: number;
  impots: number;
  cfe: number;
  remuneration: number;
};

export async function getMonthlyActivityAction(year: number): Promise<{ months: MonthlyActivityMonth[] }> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { months: [] };
  }

  try {
    const [hp] = await db.select().from(practitioners).where(eq(practitioners.userId, session.id));
    if (!hp) return { months: [] };

    const accounts = await db.select({ id: bankAccounts.id }).from(bankAccounts).where(eq(bankAccounts.practitionerId, hp.id));
    if (accounts.length === 0) return { months: [] };

    const accountIds = accounts.map((a) => a.id);
    const yearFilter = and(
      inArray(bankTransactions.bankAccountId, accountIds),
      gte(bankTransactions.date, `${year}-01-01`),
      lte(bankTransactions.date, `${year}-12-31`),
    );

    const rows = await db
      .select({
        month: sql<number>`EXTRACT(MONTH FROM ${bankTransactions.date})::int`,
        income: sql<number>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} > 0 AND ${bankTransactions.category} IN ('income', 'royalty', 'professional_reimbursement') THEN ${bankTransactions.amount} ELSE 0 END), 0)`,
        cotisations: sql<number>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} < 0 AND ${bankTransactions.category} IN ('urssaf', 'carpimko') THEN ABS(${bankTransactions.amount}) ELSE 0 END), 0)`,
        autresDepenses: sql<number>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} < 0 AND ${bankTransactions.category} IN ('professional_expenses', 'retrocession', 'madelin') THEN ABS(${bankTransactions.amount}) ELSE 0 END), 0)`,
        urssaf: sql<number>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} < 0 AND ${bankTransactions.category} = 'urssaf' THEN ABS(${bankTransactions.amount}) ELSE 0 END), 0)`,
        carpimko: sql<number>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} < 0 AND ${bankTransactions.category} = 'carpimko' THEN ABS(${bankTransactions.amount}) ELSE 0 END), 0)`,
        chargesPro: sql<number>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} < 0 AND ${bankTransactions.category} = 'professional_expenses' THEN ABS(${bankTransactions.amount}) ELSE 0 END), 0)`,
        retrocession: sql<number>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} < 0 AND ${bankTransactions.category} = 'retrocession' THEN ABS(${bankTransactions.amount}) ELSE 0 END), 0)`,
        madelin: sql<number>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} < 0 AND ${bankTransactions.category} = 'madelin' THEN ABS(${bankTransactions.amount}) ELSE 0 END), 0)`,
        impots: sql<number>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} < 0 AND ${bankTransactions.category} = 'taxes' THEN ABS(${bankTransactions.amount}) ELSE 0 END), 0)`,
        cfe: sql<number>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} < 0 AND ${bankTransactions.category} = 'cfe' THEN ABS(${bankTransactions.amount}) ELSE 0 END), 0)`,
        remuneration: sql<number>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} < 0 AND ${bankTransactions.category} = 'compensation' THEN ABS(${bankTransactions.amount}) ELSE 0 END), 0)`,
      })
      .from(bankTransactions)
      .where(yearFilter)
      .groupBy(sql`EXTRACT(MONTH FROM ${bankTransactions.date})`)
      .orderBy(sql`EXTRACT(MONTH FROM ${bankTransactions.date})`);

    // Fill all 12 months
    const monthMap = new Map(rows.map((r) => [Number(r.month), {
      income: Number(r.income), cotisations: Number(r.cotisations), autresDepenses: Number(r.autresDepenses),
      urssaf: Number(r.urssaf), carpimko: Number(r.carpimko), chargesPro: Number(r.chargesPro),
      retrocession: Number(r.retrocession), madelin: Number(r.madelin), impots: Number(r.impots), cfe: Number(r.cfe), remuneration: Number(r.remuneration),
    }]));
    const zero = { income: 0, cotisations: 0, autresDepenses: 0, urssaf: 0, carpimko: 0, chargesPro: 0, retrocession: 0, madelin: 0, impots: 0, cfe: 0, remuneration: 0 };
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      ...(monthMap.get(i + 1) ?? zero),
    }));

    return { months };
  } catch {
    return { months: [] };
  }
}

export type CategoryTransaction = {
  id: string;
  date: string;
  description: string;
  cleanDescription: string | null;
  amount: number;
  category: string;
};

/**
 * Liste les transactions du praticien pour une année donnée, filtrées par catégorie.
 * Utilisé pour afficher l'historique granulaire dans Mes impôts (taxes + cfe)
 * et Mes cotisations (urssaf + carpimko).
 */
export async function getCategoryTransactionsAction(
  year: number,
  categories: string[],
): Promise<CategoryTransaction[]> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return [];

  if (categories.length === 0) return [];

  try {
    const [hp] = await db.select().from(practitioners).where(eq(practitioners.userId, session.id));
    if (!hp) return [];

    const accounts = await db.select({ id: bankAccounts.id }).from(bankAccounts).where(eq(bankAccounts.practitionerId, hp.id));
    if (accounts.length === 0) return [];
    const accountIds = accounts.map((a) => a.id);

    const rows = await db
      .select({
        id: bankTransactions.id,
        date: bankTransactions.date,
        description: bankTransactions.description,
        cleanDescription: bankTransactions.cleanDescription,
        amount: bankTransactions.amount,
        category: bankTransactions.category,
      })
      .from(bankTransactions)
      .where(and(
        inArray(bankTransactions.bankAccountId, accountIds),
        gte(bankTransactions.date, `${year}-01-01`),
        lte(bankTransactions.date, `${year}-12-31`),
        inArray(bankTransactions.category, categories),
      ))
      .orderBy(desc(bankTransactions.date));

    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      description: r.description,
      cleanDescription: r.cleanDescription,
      amount: Number(r.amount),
      category: r.category ?? "",
    }));
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[CATEGORY_TRANSACTIONS] ${detail}`, err);
    return [];
  }
}

export async function getUncategorizedCountAction() {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return 0;

  try {
    const [hp] = await db.select().from(practitioners).where(eq(practitioners.userId, session.id));
    if (!hp) return 0;

    const accounts = await db.select({ id: bankAccounts.id }).from(bankAccounts).where(eq(bankAccounts.practitionerId, hp.id));
    if (accounts.length === 0) return 0;

    const [row] = await db
      .select({ total: count() })
      .from(bankTransactions)
      .where(and(inArray(bankTransactions.bankAccountId, accounts.map((a) => a.id)), isNull(bankTransactions.category)));

    return row?.total ?? 0;
  } catch {
    return 0;
  }
}

export async function fetchPaginatedTransactionsAction(
  page: number = 1,
  limit: number = 10,
  accountId?: string | null,
  sortBy: "date" | "description" | "amount" = "date",
  sortDir: "asc" | "desc" = "desc",
  onlyUncategorized: boolean = false,
  search?: string | null,
  dateFrom?: string | null,
  dateTo?: string | null,
  categoryFilter?: string | null,
) {
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

    let accountIds: string[];
    if (accountId) {
      const [acc] = await db
        .select({ id: bankAccounts.id })
        .from(bankAccounts)
        .where(eq(bankAccounts.id, accountId));
      if (!acc) return { transactions: [], total: 0 };
      accountIds = [accountId];
    } else {
      const accounts = await db
        .select({ id: bankAccounts.id })
        .from(bankAccounts)
        .where(eq(bankAccounts.practitionerId, hp.id));
      if (accounts.length === 0) return { transactions: [], total: 0 };
      accountIds = accounts.map((a) => a.id);
    }

    const conditions = [inArray(bankTransactions.bankAccountId, accountIds)];
    if (onlyUncategorized) conditions.push(isNull(bankTransactions.category));
    if (search) {
      const term = `%${search}%`;
      conditions.push(or(ilike(bankTransactions.description, term), ilike(bankTransactions.cleanDescription, term))!);
    }
    if (dateFrom) conditions.push(gte(bankTransactions.date, dateFrom));
    if (dateTo) conditions.push(lte(bankTransactions.date, dateTo));
    if (categoryFilter) conditions.push(eq(bankTransactions.category, categoryFilter));
    const whereClause = and(...conditions);
    const offset = (page - 1) * limit;

    const sortColumn = {
      date: bankTransactions.date,
      description: bankTransactions.cleanDescription,
      amount: bankTransactions.amount,
    }[sortBy];
    const orderFn = sortDir === "asc" ? asc : desc;

    const [transactions, [totalRow], [uncatRow]] = await Promise.all([
      db
        .select()
        .from(bankTransactions)
        .where(whereClause)
        .orderBy(orderFn(sortColumn))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(bankTransactions)
        .where(whereClause),
      db
        .select({ total: count() })
        .from(bankTransactions)
        .where(and(whereClause, isNull(bankTransactions.category))),
    ]);

    return {
      transactions,
      total: totalRow?.total ?? 0,
      uncategorizedCount: uncatRow?.total ?? 0,
    };
  } catch (err: unknown) {
    console.error("[DB] fetchPaginatedTransactions error:", err);
    return { error: "Impossible de récupérer les transactions." };
  }
}
