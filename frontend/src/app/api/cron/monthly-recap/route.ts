import { NextResponse } from "next/server";
import { eq, ne, and, inArray, sql, gte, lte, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { practitioners, users, bankAccounts, bankTransactions, bankAlerts } from "@/lib/db/schema";
import { sendMonthlyRecap, type MonthlyRecapData } from "@/lib/services/mail.service";
import { verifyCronRequest } from "@/lib/cron-auth";

const MONTH_NAMES = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const INCOME_CATEGORIES = ["income", "royalty", "professional_reimbursement"];
const COTISATION_CATEGORIES = ["urssaf", "carpimko"];
const STALE_DAYS = 15;

type Period = { start: string; end: string; label: string; isQuarterly: boolean };

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getMonthlyPeriod(now: Date): Period {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return {
    start: toIso(start),
    end: toIso(end),
    label: `${capitalize(MONTH_NAMES[start.getUTCMonth()]!)} ${start.getUTCFullYear()}`,
    isQuarterly: false,
  };
}

function getQuarterlyPeriod(now: Date): Period | null {
  const month = now.getUTCMonth() + 1; // 1-12
  if (![1, 4, 7, 10].includes(month)) return null;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const q = Math.floor(start.getUTCMonth() / 3) + 1;
  return {
    start: toIso(start),
    end: toIso(end),
    label: `T${q} ${start.getUTCFullYear()} (${MONTH_NAMES[start.getUTCMonth()]} — ${MONTH_NAMES[end.getUTCMonth()]})`,
    isQuarterly: true,
  };
}

function getPreviousPeriod(period: Period): { start: string; end: string } {
  const start = new Date(period.start + "T00:00:00Z");
  const months = period.isQuarterly ? 3 : 1;
  const prevStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - months, 1));
  const prevEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0));
  return { start: toIso(prevStart), end: toIso(prevEnd) };
}

async function sumByCategory(
  accountIds: string[],
  categories: string[],
  start: string,
  end: string,
  positive: boolean,
): Promise<number> {
  const sign = positive ? sql`${bankTransactions.amount} > 0` : sql`${bankTransactions.amount} < 0`;
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(ABS(${bankTransactions.amount})), 0)` })
    .from(bankTransactions)
    .where(and(
      inArray(bankTransactions.bankAccountId, accountIds),
      inArray(bankTransactions.category, categories),
      sign,
      gte(bankTransactions.date, start),
      lte(bankTransactions.date, end),
    ));
  return Number(row?.total ?? 0);
}

export async function POST(request: Request) {
  const auth = await verifyCronRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const now = new Date();
    const monthlyPeriod = getMonthlyPeriod(now);
    const quarterlyPeriod = getQuarterlyPeriod(now);

    const candidates = await db
      .select({
        practitionerId: practitioners.id,
        firstName: practitioners.firstName,
        email: users.email,
        recapFrequency: practitioners.recapFrequency,
      })
      .from(practitioners)
      .innerJoin(users, eq(practitioners.userId, users.id))
      .where(and(
        ne(practitioners.recapFrequency, "none"),
        isNull(users.deletedAt),
      ));

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const p of candidates) {
      const period = p.recapFrequency === "quarterly" ? quarterlyPeriod : monthlyPeriod;
      if (!period) {
        skipped++;
        continue;
      }

      try {
        const accounts = await db
          .select({
            id: bankAccounts.id,
            balance: bankAccounts.balance,
            name: bankAccounts.name,
            lastSyncAt: bankAccounts.lastSyncAt,
          })
          .from(bankAccounts)
          .where(eq(bankAccounts.practitionerId, p.practitionerId));

        const accountIds = accounts.map((a) => a.id);

        let txCount = 0;
        if (accountIds.length > 0) {
          const [row] = await db
            .select({ total: sql<number>`count(*)::int` })
            .from(bankTransactions)
            .where(and(
              inArray(bankTransactions.bankAccountId, accountIds),
              gte(bankTransactions.date, period.start),
              lte(bankTransactions.date, period.end),
            ));
          txCount = Number(row?.total ?? 0);
        }

        // Skip practitioners with no bank account AND no transaction on the period
        if (accounts.length === 0 && txCount === 0) {
          skipped++;
          continue;
        }

        const data: MonthlyRecapData = {
          firstName: p.firstName,
          periodLabel: period.label,
          isQuarterly: period.isQuarterly,
        };

        if (accounts.length > 0) {
          const total = accounts.reduce((acc, a) => acc + Number(a.balance ?? 0), 0);
          data.totalBalance = total;

          const cutoff = new Date(now);
          cutoff.setDate(cutoff.getDate() - STALE_DAYS);
          const stale = accounts.filter((a) => !a.lastSyncAt || a.lastSyncAt < cutoff);
          if (stale.length > 0) data.staleAccountsCount = stale.length;
        }

        if (accountIds.length > 0 && txCount > 0) {
          const prev = getPreviousPeriod(period);

          const [ca, caPrev, cot, fraisPro] = await Promise.all([
            sumByCategory(accountIds, INCOME_CATEGORIES, period.start, period.end, true),
            sumByCategory(accountIds, INCOME_CATEGORIES, prev.start, prev.end, true),
            sumByCategory(accountIds, COTISATION_CATEGORIES, period.start, period.end, false),
            sumByCategory(accountIds, ["professional_expenses"], period.start, period.end, false),
          ]);

          if (ca > 0) data.ca = ca;
          if (caPrev > 0) data.caPrev = caPrev;
          if (cot > 0) data.cotisationsPaid = cot;
          if (fraisPro > 0) data.professionalExpenses = fraisPro;

          const alertRows = await db
            .select({
              accountName: bankAccounts.name,
              threshold: bankAlerts.threshold,
              balance: bankAccounts.balance,
            })
            .from(bankAlerts)
            .innerJoin(bankAccounts, eq(bankAlerts.bankAccountId, bankAccounts.id))
            .where(and(
              eq(bankAlerts.practitionerId, p.practitionerId),
              eq(bankAlerts.enabled, true),
            ));
          const under = alertRows
            .filter((a) => a.balance !== null && Number(a.balance) < Number(a.threshold))
            .map((a) => a.accountName);
          if (under.length > 0) data.underThresholdAccounts = under;
        }

        await sendMonthlyRecap(p.email, data);
        sent++;
        console.log(`[CRON] Monthly recap sent to ${p.email} (${p.recapFrequency}, ${period.label})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[CRON] Error sending recap for ${p.practitionerId}:`, msg);
        errors.push(`Practitioner ${p.practitionerId}: ${msg}`);
      }
    }

    return NextResponse.json({
      message: "Recap complete",
      sent,
      skipped,
      candidates: candidates.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CRON] monthly-recap fatal error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
