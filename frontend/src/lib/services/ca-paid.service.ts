import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { carePassages, carePayments } from "@/lib/db/schema";
import { namesMatch } from "@/lib/name-matching";

/**
 * CA ENCAISSÉ d'un praticien, calculé depuis `care_payments` (retours NOEMIE).
 *
 * En BNC (comptabilité de trésorerie), le CA correct est la somme des
 * encaissements datés à la date de PAIEMENT — pas des montants facturés datés
 * à la date de soin (`care_passages`). Ce service est la source « paiements » ;
 * les appelants gardent la logique par passages en secours pour les cabinets
 * qui n'ont importé aucun retour NOEMIE.
 *
 * Attribution praticien : `care_payments` n'a pas de colonne praticien. On la
 * dérive de `care_passages` via la clé (practice_id, invoice_number). Une
 * facture peut compter jusqu'à ~30 passages : la jointure naïve dupliquerait
 * chaque paiement, d'où la table dérivée dédupliquée (GROUP BY + MIN). Aucune
 * facture n'a plusieurs praticiens distincts (vérifié en prod), MIN() est donc
 * sans perte.
 */

/** Agrégat mensuel des encaissements : clé "YYYY-MM" → { total, nb }. */
type PaidMonthlyAgg = Map<string, { total: number; nb: number }>;

/**
 * Encaissements agrégés par mois sur [startYear, endYear], filtrés sur le
 * praticien. Le name matching exact (`namesMatch`) étant du JS, la requête
 * ramène des lignes groupées par (praticien, mois) — jamais un total global —
 * pré-filtrées en SQL par ILIKE sur le nom de famille, puis affinées ici.
 */
async function fetchPaidMonthlyAgg(
  practiceIds: string[],
  fullName: string,
  lastName: string,
  startYear: number,
  endYear: number,
): Promise<PaidMonthlyAgg> {
  const map: PaidMonthlyAgg = new Map();
  if (practiceIds.length === 0) return map;

  const lastNamePattern = `%${lastName}%`;

  // Table dérivée (practice_id, invoice_number) → praticien, dédupliquée.
  const invoicePractitioners = db
    .select({
      practiceId: carePassages.practiceId,
      invoiceNumber: carePassages.invoiceNumber,
      practitioner: sql<string>`MIN(${carePassages.practitioner})`.as("practitioner"),
    })
    .from(carePassages)
    .where(inArray(carePassages.practiceId, practiceIds))
    .groupBy(carePassages.practiceId, carePassages.invoiceNumber)
    .as("invoice_practitioners");

  const rows = await db
    .select({
      practitioner: invoicePractitioners.practitioner,
      ym: sql<string>`to_char(${carePayments.paymentDate}, 'YYYY-MM')`,
      total: sql<string>`COALESCE(SUM(${carePayments.amountPaid}), 0)`,
      nb: sql<number>`COUNT(*)::int`,
    })
    .from(carePayments)
    .innerJoin(
      invoicePractitioners,
      and(
        eq(invoicePractitioners.practiceId, carePayments.practiceId),
        eq(invoicePractitioners.invoiceNumber, carePayments.invoiceNumber),
      ),
    )
    .where(
      and(
        inArray(carePayments.practiceId, practiceIds),
        sql`${carePayments.status} = 'paid'`,
        sql`${carePayments.paymentDate} >= ${`${startYear}-01-01`}`,
        sql`${carePayments.paymentDate} <= ${`${endYear}-12-31`}`,
        sql`${invoicePractitioners.practitioner} ILIKE ${lastNamePattern}`,
      ),
    )
    .groupBy(
      invoicePractitioners.practitioner,
      sql`to_char(${carePayments.paymentDate}, 'YYYY-MM')`,
    );

  for (const r of rows) {
    if (!namesMatch(fullName, r.practitioner)) continue;
    const agg = map.get(r.ym) ?? { total: 0, nb: 0 };
    agg.total += Number(r.total);
    agg.nb += Number(r.nb);
    map.set(r.ym, agg);
  }
  return map;
}

/**
 * CA encaissé d'une année, ventilé par mois (index 0 = janvier).
 * `nbPayments` = nombre de paiements 'paid' retenus — sert notamment aux
 * appelants à décider du repli sur les passages (total à 0 → pas de NOEMIE
 * joignable pour ce praticien).
 */
export async function getPaidCAByMonth(
  practiceIds: string[],
  fullName: string,
  lastName: string,
  year: number,
): Promise<{ byMonth: number[]; total: number; nbPayments: number }> {
  const agg = await fetchPaidMonthlyAgg(practiceIds, fullName, lastName, year, year);

  const byMonth = Array<number>(12).fill(0);
  let total = 0;
  let nbPayments = 0;
  for (const [ym, { total: monthTotal, nb }] of agg) {
    const monthIdx = Number(ym.slice(5, 7)) - 1;
    if (monthIdx < 0 || monthIdx > 11) continue;
    byMonth[monthIdx]! += monthTotal;
    total += monthTotal;
    nbPayments += nb;
  }
  return { byMonth, total, nbPayments };
}

/** CA encaissé annuel (total seul). */
export async function getPaidCATotal(
  practiceIds: string[],
  fullName: string,
  lastName: string,
  year: number,
): Promise<number> {
  const { total } = await getPaidCAByMonth(practiceIds, fullName, lastName, year);
  return total;
}

/**
 * Encaissements mensuels sur [startYear, endYear], clé "YYYY-MM" → CA.
 * Même forme que les MonthlyMap de `ca-history.service.ts`.
 */
export async function getPaidCAMonthlyMap(
  practiceIds: string[],
  fullName: string,
  lastName: string,
  startYear: number,
  endYear: number,
): Promise<Map<string, number>> {
  const agg = await fetchPaidMonthlyAgg(practiceIds, fullName, lastName, startYear, endYear);
  const map = new Map<string, number>();
  for (const [ym, { total }] of agg) {
    map.set(ym, total);
  }
  return map;
}
