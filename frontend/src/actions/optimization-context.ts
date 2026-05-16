"use server";

import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners } from "@/lib/db/schema";
import { getPlafondSecuriteSociale, getSmicMensuel } from "@/lib/services/openfisca.service";
import { countWorkingDays } from "@/lib/data/fr-holidays";

export type OptimizationContext = {
  pass: number;
  smicMensuel: number;
  joursTravaillesAnnee: number;
};

const FALLBACK_PASS_2026 = 47_100;
const FALLBACK_SMIC_2026 = 1_802;

export async function getOptimizationContextAction(annee: number): Promise<OptimizationContext | null> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return null;

  const [hp] = await db
    .select()
    .from(practitioners)
    .where(eq(practitioners.userId, session.id))
    .limit(1);

  if (!hp) return null;

  const [passResult, smicResult] = await Promise.allSettled([
    getPlafondSecuriteSociale(annee),
    getSmicMensuel(annee),
  ]);

  const pass = passResult.status === "fulfilled" && passResult.value > 0
    ? passResult.value
    : FALLBACK_PASS_2026;

  const smicMensuel = smicResult.status === "fulfilled" && smicResult.value > 0
    ? smicResult.value
    : FALLBACK_SMIC_2026;

  const daysPerWeek = hp.daysPerWeekWorked;
  let joursTravaillesAnnee = 0;
  for (let m = 1; m <= 12; m++) {
    joursTravaillesAnnee += countWorkingDays(annee, m, daysPerWeek);
  }

  return { pass, smicMensuel, joursTravaillesAnnee };
}
