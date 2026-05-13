"use server";

import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners, practitionerVacations } from "@/lib/db/schema";

export async function getVacationsAction(year: number): Promise<number[]> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return Array(12).fill(0);

  const [hp] = await db.select().from(practitioners).where(eq(practitioners.userId, session.id));
  if (!hp) return Array(12).fill(0);

  const rows = await db
    .select()
    .from(practitionerVacations)
    .where(and(
      eq(practitionerVacations.practitionerId, hp.id),
      eq(practitionerVacations.year, year),
    ));

  const days = Array(12).fill(0);
  for (const row of rows) {
    if (row.month >= 1 && row.month <= 12) {
      days[row.month - 1] = row.days;
    }
  }
  return days;
}

export async function upsertVacationDayAction(year: number, month: number, days: number) {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorisé" };
  }

  const [hp] = await db.select().from(practitioners).where(eq(practitioners.userId, session.id));
  if (!hp) return { error: "Profil professionnel requis" };

  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: "Année invalide" };
  if (!Number.isInteger(month) || month < 1 || month > 12) return { error: "Mois invalide" };
  const daysInMonth = new Date(year, month, 0).getDate();
  if (!Number.isInteger(days) || days < 0 || days > daysInMonth) return { error: "Nombre de jours invalide" };

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
        .set({ days, updatedAt: new Date() })
        .where(eq(practitionerVacations.id, existing.id));
    } else {
      await db
        .insert(practitionerVacations)
        .values({ practitionerId: hp.id, year, month, days });
    }

    return { success: true };
  } catch (err) {
    console.error("[VACATIONS] Erreur :", err);
    return { error: "Impossible de sauvegarder les vacances" };
  }
}
