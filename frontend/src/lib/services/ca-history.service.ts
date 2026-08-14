import { eq, and, inArray, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  practitioners,
  practiceLinks,
  carePassages,
  bankAccounts,
  bankTransactions,
} from "@/lib/db/schema";
import { namesMatch } from "@/lib/name-matching";
import { getPaidCAMonthlyMap } from "@/lib/services/ca-paid.service";

export type CASource = "bordereaux" | "transactions" | "none";

/** CA d'une année : total + ventilation mensuelle (index 0 = janvier). */
export type YearlyCA = {
  year: number;
  /** CA total de l'année dans la source retenue. */
  total: number;
  /** Ventilation mensuelle, tableau de 12 valeurs (index 0 = janvier). */
  months: number[];
  /** Source effectivement utilisée pour cette année. */
  source: CASource;
  /** Année complète (passée) ou partielle (année courante en cours). */
  isComplete: boolean;
  /** Nombre de mois disposant réellement de données (CA > 0). */
  monthsWithData: number;
};

export type CAHistory = {
  /** Années par ordre chronologique croissant. */
  years: YearlyCA[];
  currentYear: number;
};

type Practitioner = typeof practitioners.$inferSelect;

/** Clé de regroupement mensuel "YYYY-MM" → CA. */
type MonthlyMap = Map<string, number>;

function ymKey(year: number, month1to12: number): string {
  return `${year}-${String(month1to12).padStart(2, "0")}`;
}

/**
 * CA mensuel issu des encaissements bancaires (income + royalty, montants
 * positifs) sur l'intervalle [startYear, endYear]. Regroupement fait en SQL.
 */
async function getMonthlyFromTransactions(
  hp: Practitioner,
  startYear: number,
  endYear: number,
): Promise<MonthlyMap> {
  const accounts = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(eq(bankAccounts.practitionerId, hp.id));
  const map: MonthlyMap = new Map();
  if (accounts.length === 0) return map;
  const accountIds = accounts.map((a) => a.id);

  const rows = await db
    .select({
      ym: sql<string>`to_char(${bankTransactions.date}, 'YYYY-MM')`,
      total: sql<string>`COALESCE(SUM(${bankTransactions.amount}), 0)`,
    })
    .from(bankTransactions)
    .where(
      and(
        inArray(bankTransactions.bankAccountId, accountIds),
        gte(bankTransactions.date, `${startYear}-01-01`),
        lte(bankTransactions.date, `${endYear}-12-31`),
        inArray(bankTransactions.category, ["income", "royalty"]),
        sql`${bankTransactions.amount} > 0`,
      ),
    )
    .groupBy(sql`to_char(${bankTransactions.date}, 'YYYY-MM')`);

  for (const r of rows) {
    map.set(r.ym, Math.abs(Number(r.total ?? 0)));
  }
  return map;
}

/** Cabinets liés au praticien (ids), prérequis des deux sources bordereaux. */
async function getLinkedPracticeIds(hp: Practitioner): Promise<string[]> {
  const links = await db
    .select({ practiceId: practiceLinks.practiceId })
    .from(practiceLinks)
    .where(eq(practiceLinks.practitionerId, hp.id));
  return links.map((l) => l.practiceId);
}

/**
 * CA mensuel issu des encaissements NOEMIE (care_payments 'paid', mois de
 * paiement), praticien attribué via la jointure sur les passages — cf.
 * `ca-paid.service.ts`.
 */
async function getMonthlyFromPayments(
  hp: Practitioner,
  practiceIds: string[],
  startYear: number,
  endYear: number,
): Promise<MonthlyMap> {
  if (practiceIds.length === 0) return new Map();
  const fullName = `${hp.firstName} ${hp.lastName}`;
  return getPaidCAMonthlyMap(practiceIds, fullName, hp.lastName, startYear, endYear);
}

/**
 * CA mensuel issu des bordereaux (care_passages payés). Le name matching ne
 * peut pas être fait en SQL (logique JS dans `namesMatch`), donc on récupère
 * les passages de l'intervalle puis on les ventile par mois côté JS.
 */
async function getMonthlyFromBordereaux(
  hp: Practitioner,
  practiceIds: string[],
  startYear: number,
  endYear: number,
): Promise<MonthlyMap> {
  const map: MonthlyMap = new Map();
  if (practiceIds.length === 0) return map;

  const fullName = `${hp.firstName} ${hp.lastName}`;
  const lastNamePattern = `%${hp.lastName}%`;

  const passages = await db
    .select({
      careDate: carePassages.careDate,
      practitioner: carePassages.practitioner,
      totalAmount: carePassages.totalAmount,
    })
    .from(carePassages)
    .where(
      and(
        inArray(carePassages.practiceId, practiceIds),
        sql`${carePassages.practitioner} ILIKE ${lastNamePattern}`,
        sql`${carePassages.careDate} >= ${`${startYear}-01-01`}`,
        sql`${carePassages.careDate} <= ${`${endYear}-12-31`}`,
        sql`${carePassages.status} = 'paye'`,
      ),
    );

  for (const p of passages) {
    if (!namesMatch(fullName, p.practitioner)) continue;
    // careDate est une string "YYYY-MM-DD" ; on en extrait la clé "YYYY-MM".
    const key = String(p.careDate).slice(0, 7);
    map.set(key, (map.get(key) ?? 0) + Number(p.totalAmount));
  }
  return map;
}

/** Extrait le tableau mensuel (12 valeurs) d'une année depuis une MonthlyMap. */
function yearMonths(map: MonthlyMap, year: number): number[] {
  const months = Array<number>(12).fill(0);
  for (let m = 1; m <= 12; m++) {
    months[m - 1] = Math.round(map.get(ymKey(year, m)) ?? 0);
  }
  return months;
}

/**
 * Historique de CA mensuel d'un praticien sur les `lookbackYears` dernières
 * années + l'année courante.
 *
 * Source : banque (encaissements réels) en priorité, repli sur bordereaux —
 * décision prise **année par année**. Si une année n'a aucune donnée bancaire
 * mais des bordereaux, on prend les bordereaux pour cette année-là, sans
 * contaminer les autres. Côté bordereaux, priorité aux ENCAISSEMENTS
 * (care_payments, mois de paiement — le CA correct en BNC), repli sur les
 * passages (facturé, date de soin) pour les années sans NOEMIE joignable.
 */
export async function getCAHistoryForPractitioner(
  hp: Practitioner,
  lookbackYears = 3,
): Promise<CAHistory> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const startYear = currentYear - lookbackYears;

  const practiceIds = await getLinkedPracticeIds(hp);
  const [txMap, paidMap, passagesMap] = await Promise.all([
    getMonthlyFromTransactions(hp, startYear, currentYear),
    getMonthlyFromPayments(hp, practiceIds, startYear, currentYear),
    getMonthlyFromBordereaux(hp, practiceIds, startYear, currentYear),
  ]);

  const years: YearlyCA[] = [];
  for (let year = startYear; year <= currentYear; year++) {
    const txMonths = yearMonths(txMap, year);
    // Bordereaux : encaissements si l'année en a, sinon passages.
    const paidMonths = yearMonths(paidMap, year);
    const paidTotal = paidMonths.reduce((a, b) => a + b, 0);
    const brdMonths = paidTotal > 0 ? paidMonths : yearMonths(passagesMap, year);
    const txTotal = txMonths.reduce((a, b) => a + b, 0);
    const brdTotal = brdMonths.reduce((a, b) => a + b, 0);

    // Priorité banque ; repli bordereaux si la banque est vide cette année.
    let months: number[];
    let total: number;
    let source: CASource;
    if (txTotal > 0) {
      months = txMonths;
      total = txTotal;
      source = "transactions";
    } else if (brdTotal > 0) {
      months = brdMonths;
      total = brdTotal;
      source = "bordereaux";
    } else {
      months = brdMonths; // tout à zéro
      total = 0;
      source = "none";
    }

    const monthsWithData = months.filter((v) => v > 0).length;
    // L'année courante est toujours partielle (CA encore en cours).
    const isComplete = year < currentYear;

    // On n'inclut pas une année totalement vide en tête d'historique (le
    // praticien n'avait probablement pas démarré son activité).
    if (total === 0 && years.length === 0 && year < currentYear) continue;

    years.push({ year, total, months, source, isComplete, monthsWithData });
  }

  return { years, currentYear };
}
