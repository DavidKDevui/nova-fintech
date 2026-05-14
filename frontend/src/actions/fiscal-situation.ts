"use server";

import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners, practitionerFiscalSituations } from "@/lib/db/schema";

const VALID_MARITAL_STATUSES = ["celibataire", "marie", "pacse"] as const;

export async function getFiscalSituationAction(year: number) {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return null;

  const [hp] = await db.select().from(practitioners).where(eq(practitioners.userId, session.id));
  if (!hp) return null;

  const [situation] = await db
    .select()
    .from(practitionerFiscalSituations)
    .where(and(
      eq(practitionerFiscalSituations.practitionerId, hp.id),
      eq(practitionerFiscalSituations.year, year),
    ));

  return situation ?? null;
}

export async function upsertFiscalSituationAction(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorisé" };
  }

  const [hp] = await db.select().from(practitioners).where(eq(practitioners.userId, session.id));
  if (!hp) return { error: "Profil professionnel requis" };

  const year = parseInt(formData.get("year") as string);
  const maritalStatus = formData.get("maritalStatus") as string;
  const dependentChildren = parseInt(formData.get("dependentChildren") as string) || 0;
  const otherIncome = parseFloat(formData.get("otherIncome") as string) || 0;
  const isSingleParent = formData.get("isSingleParent") === "on";
  const declaredIrRaw = formData.get("declaredIr");
  const declaredIrStr = typeof declaredIrRaw === "string" ? declaredIrRaw.trim() : "";
  let declaredIr: number | null = null;
  if (declaredIrStr !== "") {
    const parsed = parseFloat(declaredIrStr.replace(",", "."));
    if (isNaN(parsed) || parsed < 0) return { error: "IR déclaré invalide" };
    declaredIr = parsed;
  }

  if (!year || isNaN(year)) return { error: "Année invalide" };
  if (!VALID_MARITAL_STATUSES.includes(maritalStatus as typeof VALID_MARITAL_STATUSES[number])) {
    return { error: "Situation conjugale invalide" };
  }
  if (dependentChildren < 0) return { error: "Nombre d'enfants invalide" };
  if (otherIncome < 0) return { error: "Montant invalide" };

  try {
    const [existing] = await db
      .select()
      .from(practitionerFiscalSituations)
      .where(and(
        eq(practitionerFiscalSituations.practitionerId, hp.id),
        eq(practitionerFiscalSituations.year, year),
      ));

    const values = {
      maritalStatus: maritalStatus as typeof VALID_MARITAL_STATUSES[number],
      dependentChildren,
      isSingleParent: isSingleParent && maritalStatus === "celibataire" && dependentChildren >= 1,
      otherIncome: String(otherIncome),
      declaredIr: declaredIr === null ? null : String(declaredIr),
      updatedAt: new Date(),
    };

    if (existing) {
      await db
        .update(practitionerFiscalSituations)
        .set(values)
        .where(eq(practitionerFiscalSituations.id, existing.id));
    } else {
      await db
        .insert(practitionerFiscalSituations)
        .values({
          practitionerId: hp.id,
          year,
          ...values,
        });
    }

    return { success: true };
  } catch (err) {
    console.error("[FISCAL_SITUATION] Erreur :", err);
    return { error: "Impossible de sauvegarder la situation fiscale" };
  }
}

