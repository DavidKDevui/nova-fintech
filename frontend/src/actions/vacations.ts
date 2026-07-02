"use server";

import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners, practitionerVacations } from "@/lib/db/schema";


// Jours travaillés saisis par mois (null = non saisi → l'appelant applique le
// défaut = jours ouvrés du mois). Remplace le modèle "jours de congés".
export async function getWorkedDaysAction(year: number): Promise<(number | null)[]> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return Array(12).fill(null);

  const [hp] = await db.select().from(practitioners).where(eq(practitioners.userId, session.id));
  if (!hp) return Array(12).fill(null);

  const rows = await db
    .select()
    .from(practitionerVacations)
    .where(and(
      eq(practitionerVacations.practitionerId, hp.id),
      eq(practitionerVacations.year, year),
    ));

  const worked: (number | null)[] = Array(12).fill(null);
  for (const row of rows) {
    if (row.month >= 1 && row.month <= 12) {
      worked[row.month - 1] = row.workedDays;
    }
  }
  return worked;
}

export async function upsertWorkedDayAction(year: number, month: number, workedDays: number) {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorisé" };
  }

  const [hp] = await db.select().from(practitioners).where(eq(practitioners.userId, session.id));
  if (!hp) return { error: "Profil professionnel requis" };

  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: "Année invalide" };
  if (!Number.isInteger(month) || month < 1 || month > 12) return { error: "Mois invalide" };
  const daysInMonth = new Date(year, month, 0).getDate();
  if (!Number.isInteger(workedDays) || workedDays < 0 || workedDays > daysInMonth) return { error: "Nombre de jours invalide" };

  try {
    const [existing] = await db
      .select()
      .from(practitionerVacations)
      .where(and(
        eq(practitionerVacations.practitionerId, hp.id),
        eq(practitionerVacations.year, year),
        eq(practitionerVacations.month, month),
      ));

    if (existing) {
      await db
        .update(practitionerVacations)
        .set({ workedDays, updatedAt: new Date() })
        .where(eq(practitionerVacations.id, existing.id));
    } else {
      await db
        .insert(practitionerVacations)
        .values({ practitionerId: hp.id, year, month, workedDays });
    }

    return { success: true };
  } catch (err) {
    console.error("[WORKED_DAYS] Erreur :", err);
    return { error: "Impossible de sauvegarder les jours travaillés" };
  }
}

