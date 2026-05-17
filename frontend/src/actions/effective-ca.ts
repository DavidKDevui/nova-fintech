"use server";

import { eq, and, inArray, gte, lte, sql, sum } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import {
  practitioners,
  practiceLinks,
  carePassages,
  bankAccounts,
  bankTransactions,
} from "@/lib/db/schema";
import { namesMatch } from "@/lib/name-matching";

export type EffectiveCASource = "bordereaux" | "transactions" | "none";

export type EffectiveCA = {
  /** CA year-to-date dans la source retenue. */
  ca: number;
  source: EffectiveCASource;
};

type Practitioner = typeof practitioners.$inferSelect;

async function getCAFromBordereaux(hp: Practitioner, year: number): Promise<number> {
  const links = await db
    .select({ practiceId: practiceLinks.practiceId })
    .from(practiceLinks)
    .where(eq(practiceLinks.practitionerId, hp.id));
  if (links.length === 0) return 0;

  const practiceIds = links.map((l) => l.practiceId);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const fullName = `${hp.firstName} ${hp.lastName}`;
  const lastNamePattern = `%${hp.lastName}%`;

  const passages = await db
    .select({
      practitioner: carePassages.practitioner,
      totalAmount: carePassages.totalAmount,
    })
    .from(carePassages)
    .where(
      and(
        inArray(carePassages.practiceId, practiceIds),
        sql`${carePassages.practitioner} ILIKE ${lastNamePattern}`,
        sql`${carePassages.careDate} >= ${yearStart}`,
        sql`${carePassages.careDate} <= ${yearEnd}`,
        sql`${carePassages.status} = 'paye'`,
      ),
    );

  return passages
    .filter((p) => namesMatch(fullName, p.practitioner))
    .reduce((acc, p) => acc + Number(p.totalAmount), 0);
}

async function getCAFromTransactions(hp: Practitioner, year: number): Promise<number> {
  const accounts = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(eq(bankAccounts.practitionerId, hp.id));
  if (accounts.length === 0) return 0;
  const accountIds = accounts.map((a) => a.id);

  const [row] = await db
    .select({ total: sum(bankTransactions.amount) })
    .from(bankTransactions)
    .where(
      and(
        inArray(bankTransactions.bankAccountId, accountIds),
        gte(bankTransactions.date, `${year}-01-01`),
        lte(bankTransactions.date, `${year}-12-31`),
        inArray(bankTransactions.category, ["income", "royalty"]),
        sql`${bankTransactions.amount} > 0`,
      ),
    );

  return Math.abs(Number(row?.total ?? 0));
}

export async function getEffectiveCAAction(
  year: number,
  primarySource: "bordereaux" | "transactions" = "bordereaux",
): Promise<EffectiveCA> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { ca: 0, source: "none" };
  }

  const [hp] = await db
    .select()
    .from(practitioners)
    .where(eq(practitioners.userId, session.id));
  if (!hp) return { ca: 0, source: "none" };

  const [caBordereaux, caTransactions] = await Promise.all([
    getCAFromBordereaux(hp, year),
    getCAFromTransactions(hp, year),
  ]);

  if (primarySource === "bordereaux") {
    if (caBordereaux > 0) return { ca: caBordereaux, source: "bordereaux" };
    if (caTransactions > 0) return { ca: caTransactions, source: "transactions" };
  } else {
    if (caTransactions > 0) return { ca: caTransactions, source: "transactions" };
    if (caBordereaux > 0) return { ca: caBordereaux, source: "bordereaux" };
  }
  return { ca: 0, source: "none" };
}
