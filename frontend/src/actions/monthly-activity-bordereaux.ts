"use server";

import { eq, and, inArray, sql } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners, practiceLinks, carePassages } from "@/lib/db/schema";
import { namesMatch } from "@/lib/name-matching";
import { addManualChargesToMonths } from "@/lib/db/manual-charges";
import type { MonthlyActivityMonth } from "./transaction";

/**
 * Fallback "Mon activité" quand le praticien n'a pas connecté sa banque mais a
 * des bordereaux. Agrège `carePassages` (status = paye) par mois en filtrant
 * par cabinets liés + name matching, à l'identique de `getCAFromBordereaux`.
 * Seul `income` est rempli — les autres champs restent à 0 car les dépenses ne
 * peuvent pas être dérivées des bordereaux (cf. estimation des cotisations
 * gérée côté UI via `getCotisationsEstimate`).
 */
export async function getMonthlyActivityFromBordereauxAction(
  year: number,
): Promise<{ months: MonthlyActivityMonth[] }> {
  const session = await getSession();
  const empty = emptyMonths();
  if (!session || session.accountType !== "practitioner") return { months: empty };

  try {
    const [hp] = await db
      .select()
      .from(practitioners)
      .where(eq(practitioners.userId, session.id));
    if (!hp) return { months: empty };

    const links = await db
      .select({ practiceId: practiceLinks.practiceId })
      .from(practiceLinks)
      .where(eq(practiceLinks.practitionerId, hp.id));
    if (links.length === 0) {
      // Pas de bordereaux, mais le praticien peut avoir saisi des charges manuelles.
      await addManualChargesToMonths(empty, hp.id, year);
      return { months: empty };
    }

    const practiceIds = links.map((l) => l.practiceId);
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const fullName = `${hp.firstName} ${hp.lastName}`;
    const lastNamePattern = `%${hp.lastName}%`;

    const passages = await db
      .select({
        practitioner: carePassages.practitioner,
        totalAmount: carePassages.totalAmount,
        month: sql<number>`EXTRACT(MONTH FROM ${carePassages.careDate})::int`,
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

    const months = emptyMonths();
    for (const p of passages) {
      if (!namesMatch(fullName, p.practitioner)) continue;
      const idx = Number(p.month) - 1;
      if (idx < 0 || idx > 11) continue;
      months[idx]!.income += Number(p.totalAmount);
    }
    // Charges pro. manuelles ajoutées par-dessus le CA dérivé des bordereaux.
    await addManualChargesToMonths(months, hp.id, year);
    return { months };
  } catch {
    return { months: empty };
  }
}

function emptyMonths(): MonthlyActivityMonth[] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    income: 0,
    cotisations: 0,
    autresDepenses: 0,
    urssaf: 0,
    carpimko: 0,
    chargesPro: 0,
    retrocession: 0,
    madelin: 0,
    impots: 0,
    cfe: 0,
    remuneration: 0,
  }));
}
