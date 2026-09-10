"use server";

import { eq, and, inArray, sql } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practiceLinks, carePassages } from "@/lib/db/schema";
import { namesMatch } from "@/lib/name-matching";
import { getPaidCAByMonth } from "@/lib/services/ca-paid.service";
import { addManualChargesToMonths } from "@/lib/db/manual-charges";
import type { MonthlyActivityMonth } from "./transaction";
import { getPractitionerByUserId } from "@/lib/data/current-practitioner";
import { cache } from "react";

/**
 * Fallback "Mon activité" quand le praticien n'a pas connecté sa banque mais a
 * des bordereaux. Agrège en priorité les ENCAISSEMENTS (`carePayments`, mois de
 * paiement) ; à défaut, les passages `carePassages` (status = paye) par mois de
 * soin, en filtrant par cabinets liés + name matching, à l'identique de
 * `getCAFromBordereaux`.
 * Seul `income` est rempli — les autres champs restent à 0 car les dépenses ne
 * peuvent pas être dérivées des bordereaux (cf. estimation des cotisations
 * gérée côté UI via `getCotisationsEstimate`).
 */
export async function getMonthlyActivityFromBordereauxAction(
  year: number,
): Promise<{ months: MonthlyActivityMonth[] }> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return { months: emptyMonths() };
  return loadMonthlyFromBordereaux(session.id, year);
}

// Mémoïsé PAR REQUÊTE (utilisateur, année).
const loadMonthlyFromBordereaux = cache(async (userId: string, year: number): Promise<{ months: MonthlyActivityMonth[] }> => {
  const empty = emptyMonths();
  try {
    const hp = await getPractitionerByUserId(userId);
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
    const fullName = `${hp.firstName} ${hp.lastName}`;

    // Priorité aux montants ENCAISSÉS (care_payments, mois de paiement) : en
    // BNC c'est le CA correct. Repli sur les passages (facturé, date de soin)
    // pour les cabinets sans retours NOEMIE joignables.
    const paid = await getPaidCAByMonth(practiceIds, fullName, hp.lastName, year);
    if (paid.total > 0) {
      const months = emptyMonths();
      for (let i = 0; i < 12; i++) {
        months[i]!.income = paid.byMonth[i] ?? 0;
      }
      // Charges pro. manuelles ajoutées par-dessus le CA encaissé.
      await addManualChargesToMonths(months, hp.id, year);
      return { months };
    }

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
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
});

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
