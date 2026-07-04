"use server";

import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners, practitionerManualCharges } from "@/lib/db/schema";
import { getManualChargeRows, type ManualChargeRow } from "@/lib/db/manual-charges";
import { isManualChargeType } from "@/lib/data/manual-charge-types";

/** Résout l'id du praticien courant, ou null si session non-praticien. */
async function currentPractitionerId(): Promise<string | null> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return null;
  const [hp] = await db
    .select({ id: practitioners.id })
    .from(practitioners)
    .where(eq(practitioners.userId, session.id));
  return hp?.id ?? null;
}

/** Lignes de charges manuelles de l'année pour le praticien courant. */
export async function getManualChargesAction(year: number): Promise<ManualChargeRow[]> {
  const practitionerId = await currentPractitionerId();
  if (!practitionerId) return [];
  try {
    return await getManualChargeRows(practitionerId, year);
  } catch (err) {
    console.error("[DB] getManualCharges error:", err);
    return [];
  }
}

/**
 * Enregistre le montant d'une case (type × mois). Un montant <= 0 supprime la
 * case (on ne stocke pas de zéros, pour garder la table propre).
 */
export async function upsertManualChargeCellAction(
  year: number,
  month: number,
  chargeType: string,
  amount: number,
) {
  const practitionerId = await currentPractitionerId();
  if (!practitionerId) return { error: "Non autorisé" };
  if (!Number.isInteger(month) || month < 1 || month > 12) return { error: "Mois invalide" };
  if (!isManualChargeType(chargeType)) return { error: "Type de charge invalide" };

  const value = Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;

  // Filtre d'unicité de la case (praticien, année, mois, type).
  const cellFilter = and(
    eq(practitionerManualCharges.practitionerId, practitionerId),
    eq(practitionerManualCharges.year, year),
    eq(practitionerManualCharges.month, month),
    eq(practitionerManualCharges.chargeType, chargeType),
  );

  try {
    // Montant nul → on ne conserve pas de zéro : la case est supprimée.
    if (value === 0) {
      await db.delete(practitionerManualCharges).where(cellFilter);
      return { success: true };
    }

    // Upsert applicatif (pas d'ON CONFLICT : cf. index non-unique côté sync.ts).
    const [existing] = await db
      .select({ id: practitionerManualCharges.id })
      .from(practitionerManualCharges)
      .where(cellFilter);

    if (existing) {
      await db
        .update(practitionerManualCharges)
        .set({ amount: String(value), updatedAt: new Date() })
        .where(eq(practitionerManualCharges.id, existing.id));
    } else {
      await db
        .insert(practitionerManualCharges)
        .values({ practitionerId, year, month, chargeType, amount: String(value) });
    }
    return { success: true };
  } catch (err) {
    console.error("[DB] upsertManualChargeCell error:", err);
    return { error: "Impossible d'enregistrer la charge." };
  }
}

/** Supprime toute une ligne (les 12 mois d'un type de charge) pour l'année. */
export async function deleteManualChargeLineAction(year: number, chargeType: string) {
  const practitionerId = await currentPractitionerId();
  if (!practitionerId) return { error: "Non autorisé" };
  if (!isManualChargeType(chargeType)) return { error: "Type de charge invalide" };

  try {
    await db
      .delete(practitionerManualCharges)
      .where(and(
        eq(practitionerManualCharges.practitionerId, practitionerId),
        eq(practitionerManualCharges.year, year),
        eq(practitionerManualCharges.chargeType, chargeType),
      ));
    return { success: true };
  } catch (err) {
    console.error("[DB] deleteManualChargeLine error:", err);
    return { error: "Impossible de supprimer la ligne." };
  }
}
