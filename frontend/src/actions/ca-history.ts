"use server";

import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners } from "@/lib/db/schema";
import {
  getCAHistoryForPractitioner,
  type CAHistory,
} from "@/lib/services/ca-history.service";
import type { CAForecast } from "@/lib/services/ca-forecast.service";
import { buildScenarioForecast, type StoredAdjustment } from "@/lib/services/ca-scenario.service";

export type { CAHistory, YearlyCA, CASource } from "@/lib/services/ca-history.service";
export type { CAForecast } from "@/lib/services/ca-forecast.service";
export type { StoredAdjustment } from "@/lib/services/ca-scenario.service";

const EMPTY_HISTORY: CAHistory = { years: [], currentYear: new Date().getFullYear() };

/**
 * Nombre de mois RÉVOLUS de l'année courante (le mois en cours, partiel, est
 * exclu du run-rate pour ne pas sous-estimer la projection).
 */
function elapsedFullMonths(): number {
  return new Date().getMonth(); // 0 en janvier → 0 mois révolu ; 5 en juin → 5 (jan-mai)
}

async function resolvePractitioner() {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return null;
  const [hp] = await db
    .select()
    .from(practitioners)
    .where(eq(practitioners.userId, session.id));
  return hp ?? null;
}

/** Historique de CA mensuel du praticien connecté. */
export async function getCAHistoryAction(lookbackYears = 3): Promise<CAHistory> {
  const hp = await resolvePractitioner();
  if (!hp) return EMPTY_HISTORY;
  return getCAHistoryForPractitioner(hp, lookbackYears);
}

export type CAForecastResult = {
  history: CAHistory;
  forecast: CAForecast | null;
  /** Prévision de base avant scénario (référence pour comparaison). */
  baseForecast: CAForecast | null;
  /** Mois révolus de l'année courante (sert à distinguer réalisé/projeté côté UI). */
  monthsElapsed: number;
  /** true si un scénario (congés réduits ou leviers) est actif. */
  hasScenario: boolean;
  adjustments: StoredAdjustment[];
};

/**
 * Historique + prévision de CA (scénario persistant appliqué) pour l'année
 * courante, en un seul aller-retour pour l'UI. `forecast` est null si le
 * praticien n'a aucun historique.
 */
export async function getCAForecastAction(): Promise<CAForecastResult> {
  const monthsElapsed = elapsedFullMonths();
  const hp = await resolvePractitioner();
  if (!hp) {
    return { history: EMPTY_HISTORY, forecast: null, baseForecast: null, monthsElapsed, hasScenario: false, adjustments: [] };
  }
  return buildScenarioForecast(hp, monthsElapsed);
}
