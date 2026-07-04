// Accès bas niveau aux charges pro. saisies manuellement.
// Fonctions pures serveur (pas de "use server") prenant un `practitionerId` déjà
// résolu — réutilisées par les server actions (UI) ET par les agrégations qui
// doivent intégrer ces charges (activité mensuelle, KPI décaissement,
// recommandations, health-score) pour rester cohérentes partout.

import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { practitionerManualCharges } from "@/lib/db/schema";

export type ManualChargeRow = {
  id: string;
  year: number;
  month: number;
  chargeType: string;
  amount: number;
};

/** Toutes les lignes de charges manuelles d'un praticien pour une année. */
export async function getManualChargeRows(practitionerId: string, year: number): Promise<ManualChargeRow[]> {
  const rows = await db
    .select()
    .from(practitionerManualCharges)
    .where(and(
      eq(practitionerManualCharges.practitionerId, practitionerId),
      eq(practitionerManualCharges.year, year),
    ));
  return rows.map((r) => ({
    id: r.id,
    year: r.year,
    month: r.month,
    chargeType: r.chargeType,
    amount: Number(r.amount),
  }));
}

/**
 * Somme des charges manuelles par mois (tous types confondus).
 * Renvoie toujours un tableau de 12 valeurs, index 0 = janvier.
 */
export async function getManualChargesByMonth(practitionerId: string, year: number): Promise<number[]> {
  const byMonth = Array<number>(12).fill(0);
  const rows = await getManualChargeRows(practitionerId, year);
  for (const r of rows) {
    if (r.month >= 1 && r.month <= 12) byMonth[r.month - 1]! += r.amount;
  }
  return byMonth;
}

/**
 * Total des charges manuelles d'une année, éventuellement borné aux mois écoulés.
 * @param throughMonth mois inclus (1-12) jusqu'auquel sommer ; par défaut les 12 mois.
 */
export async function getManualChargesTotal(
  practitionerId: string,
  year: number,
  throughMonth = 12,
): Promise<number> {
  const byMonth = await getManualChargesByMonth(practitionerId, year);
  const limit = Math.max(0, Math.min(12, throughMonth));
  let total = 0;
  for (let i = 0; i < limit; i++) total += byMonth[i]!;
  return total;
}

/**
 * Ajoute (en place) les charges manuelles au champ `chargesPro` et au total
 * `autresDepenses` de chaque mois. Type structurel minimal pour rester
 * découplé de `MonthlyActivityMonth`. `months` doit être indexé par mois
 * (month 1-12) ; les mois manquants sont ignorés.
 */
export async function addManualChargesToMonths(
  months: { month: number; chargesPro: number; autresDepenses: number }[],
  practitionerId: string,
  year: number,
): Promise<void> {
  const byMonth = await getManualChargesByMonth(practitionerId, year);
  for (const m of months) {
    const add = byMonth[m.month - 1] ?? 0;
    if (add > 0) {
      m.chargesPro += add;
      m.autresDepenses += add;
    }
  }
}
