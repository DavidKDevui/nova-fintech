import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  practitioners,
  practitionerVacations,
  practitionerCaAdjustments,
  practitionerPlannedActs,
} from "@/lib/db/schema";
import { countWorkingDays } from "@/lib/data/fr-holidays";
import { getCAHistoryForPractitioner, type CAHistory } from "./ca-history.service";
import {
  forecastFromHistory,
  applyScenarioToForecast,
  type CAForecast,
  type CAAdjustment,
  type CAAdjustmentKind,
} from "./ca-forecast.service";

type Practitioner = typeof practitioners.$inferSelect;

export type StoredAdjustment = {
  id: string;
  kind: CAAdjustmentKind;
  value: number;
  startMonth: number;
  endMonth: number;
  label: string | null;
};

/**
 * Facteur de disponibilité par mois (12 valeurs, 0..1) pour l'année cible :
 * jours travaillés saisis / jours ouvrés du mois.
 * Un mois entièrement off → 0, un mois normal (non saisi) → 1.
 */
export async function buildAvailabilityFactor(
  practitionerId: string,
  year: number,
  daysPerWeek: number,
): Promise<number[]> {
  const rows = await db
    .select()
    .from(practitionerVacations)
    .where(and(
      eq(practitionerVacations.practitionerId, practitionerId),
      eq(practitionerVacations.year, year),
    ));

  // Jours travaillés saisis par mois ; null = non saisi → défaut = mois complet.
  const workedDays = Array<number | null>(12).fill(null);
  for (const r of rows) {
    if (r.month >= 1 && r.month <= 12) workedDays[r.month - 1] = r.workedDays;
  }

  const factor = Array<number>(12).fill(1);
  for (let m = 1; m <= 12; m++) {
    const workable = countWorkingDays(year, m, daysPerWeek);
    if (workable <= 0) { factor[m - 1] = 1; continue; }
    const worked = workedDays[m - 1] ?? workable;
    factor[m - 1] = Math.max(0, Math.min(1, worked / workable));
  }
  return factor;
}

/** Indique si une disponibilité est non triviale (au moins un mois réduit). */
function hasReducedAvailability(factor: number[]): boolean {
  return factor.some((f) => f < 0.999);
}

// ── CRUD leviers de C.A. ──

export async function listCaAdjustments(
  practitionerId: string,
  year: number,
): Promise<StoredAdjustment[]> {
  const rows = await db
    .select()
    .from(practitionerCaAdjustments)
    .where(and(
      eq(practitionerCaAdjustments.practitionerId, practitionerId),
      eq(practitionerCaAdjustments.year, year),
    ));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as CAAdjustmentKind,
    value: Number(r.value),
    startMonth: r.startMonth,
    endMonth: r.endMonth,
    label: r.label,
  }));
}

export async function addCaAdjustment(
  practitionerId: string,
  year: number,
  input: { kind: CAAdjustmentKind; value: number; startMonth: number; endMonth: number; label?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { kind, value, startMonth, endMonth, label } = input;
  if (!["rate_pct", "volume_pct", "fixed_monthly", "fixed_oneoff", "month_override"].includes(kind)) {
    return { ok: false, error: "Type de levier invalide" };
  }
  if (!Number.isFinite(value)) return { ok: false, error: "Valeur invalide" };
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) return { ok: false, error: "Mois de début invalide" };
  if (!Number.isInteger(endMonth) || endMonth < 1 || endMonth > 12 || endMonth < startMonth) return { ok: false, error: "Mois de fin invalide" };

  await db.insert(practitionerCaAdjustments).values({
    practitionerId,
    year,
    kind,
    value: String(value),
    startMonth,
    endMonth,
    label: label ?? null,
  });
  return { ok: true };
}

/**
 * Impose la valeur de CA d'un mois (remplace tout scénario pour ce mois).
 * Un seul `month_override` par mois : on retire l'ancien avant d'insérer.
 */
export async function setMonthOverride(
  practitionerId: string,
  year: number,
  month: number,
  value: number,
  label?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(month) || month < 1 || month > 12) return { ok: false, error: "Mois invalide" };
  if (!Number.isFinite(value) || value < 0) return { ok: false, error: "Montant invalide" };

  const existing = await db
    .select({ id: practitionerCaAdjustments.id, startMonth: practitionerCaAdjustments.startMonth, kind: practitionerCaAdjustments.kind })
    .from(practitionerCaAdjustments)
    .where(and(
      eq(practitionerCaAdjustments.practitionerId, practitionerId),
      eq(practitionerCaAdjustments.year, year),
    ));
  for (const e of existing) {
    if (e.kind === "month_override" && e.startMonth === month) {
      await db.delete(practitionerCaAdjustments).where(eq(practitionerCaAdjustments.id, e.id));
    }
  }

  await db.insert(practitionerCaAdjustments).values({
    practitionerId,
    year,
    kind: "month_override",
    value: String(value),
    startMonth: month,
    endMonth: month,
    label: label ?? null,
  });
  return { ok: true };
}

/**
 * Ajoute un montant ponctuel (`fixed_oneoff`) au CA d'un mois, SANS écraser la
 * projection existante — contrairement à `setMonthOverride`. Idempotent par
 * (mois + label) : une nouvelle saisie manuelle remplace la précédente au lieu
 * de s'empiler.
 */
export async function setMonthAddition(
  practitionerId: string,
  year: number,
  month: number,
  value: number,
  label: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(month) || month < 1 || month > 12) return { ok: false, error: "Mois invalide" };
  if (!Number.isFinite(value) || value < 0) return { ok: false, error: "Montant invalide" };

  const existing = await db
    .select({ id: practitionerCaAdjustments.id, startMonth: practitionerCaAdjustments.startMonth, kind: practitionerCaAdjustments.kind, label: practitionerCaAdjustments.label })
    .from(practitionerCaAdjustments)
    .where(and(
      eq(practitionerCaAdjustments.practitionerId, practitionerId),
      eq(practitionerCaAdjustments.year, year),
    ));
  for (const e of existing) {
    if (e.kind === "fixed_oneoff" && e.startMonth === month && e.label === label) {
      await db.delete(practitionerCaAdjustments).where(eq(practitionerCaAdjustments.id, e.id));
    }
  }

  await db.insert(practitionerCaAdjustments).values({
    practitionerId,
    year,
    kind: "fixed_oneoff",
    value: String(value),
    startMonth: month,
    endMonth: month,
    label,
  });
  return { ok: true };
}

/**
 * Retire l'ajustement issu de la saisie manuelle d'actes pour un mois donné,
 * avant de réappliquer. Sinon :
 *  - passer de « Définir tout le mois » à « Compléter » laisserait l'ancien
 *    month_override actif, qui **masque** le fixed_oneoff (un override écrase le
 *    mois et court-circuite les leviers additifs dans applyScenarioToForecast) ;
 *  - un month_override hérité (ancien label) resterait collé au mois.
 *
 * On retire donc TOUT `month_override` du mois — c'est par nature une « valeur
 * imposée par actes », supplantée par la nouvelle saisie, quel que soit son
 * label. Le `fixed_oneoff`, lui, n'est retiré que s'il provient de la saisie
 * manuelle (label), pour ne pas toucher une prime ponctuelle saisie par ailleurs.
 */
export async function clearPlannedActsAdjustment(
  practitionerId: string,
  year: number,
  month: number,
  label: string,
): Promise<void> {
  const rows = await db
    .select({ id: practitionerCaAdjustments.id, kind: practitionerCaAdjustments.kind, startMonth: practitionerCaAdjustments.startMonth, label: practitionerCaAdjustments.label })
    .from(practitionerCaAdjustments)
    .where(and(
      eq(practitionerCaAdjustments.practitionerId, practitionerId),
      eq(practitionerCaAdjustments.year, year),
    ));
  for (const e of rows) {
    if (e.startMonth !== month) continue;
    const belongsToPlannedActs =
      e.kind === "month_override" || (e.kind === "fixed_oneoff" && e.label === label);
    if (belongsToPlannedActs) {
      await db.delete(practitionerCaAdjustments).where(eq(practitionerCaAdjustments.id, e.id));
    }
  }
}

/**
 * Réinitialise TOUT le scénario de l'année → la prévision revient à la base brute :
 *   - leviers de CA (actes manuels, leviers IA…),
 *   - jours travaillés / congés saisis (retour à la disponibilité pleine),
 *   - détail des actes prévus (le formulaire de saisie manuelle se vide).
 */
export async function clearScenario(practitionerId: string, year: number): Promise<void> {
  await db.delete(practitionerCaAdjustments).where(and(
    eq(practitionerCaAdjustments.practitionerId, practitionerId),
    eq(practitionerCaAdjustments.year, year),
  ));
  await db.delete(practitionerVacations).where(and(
    eq(practitionerVacations.practitionerId, practitionerId),
    eq(practitionerVacations.year, year),
  ));
  await db.delete(practitionerPlannedActs).where(and(
    eq(practitionerPlannedActs.practitionerId, practitionerId),
    eq(practitionerPlannedActs.year, year),
  ));
}

export async function clearCaAdjustments(practitionerId: string, year: number): Promise<number> {
  const rows = await db
    .delete(practitionerCaAdjustments)
    .where(and(
      eq(practitionerCaAdjustments.practitionerId, practitionerId),
      eq(practitionerCaAdjustments.year, year),
    ))
    .returning({ id: practitionerCaAdjustments.id });
  return rows.length;
}

// ── Disponibilité : écritures ──

/** Upsert du nombre de jours de congés d'un mois donné. */
export async function setWorkedDaysMonth(
  practitionerId: string,
  year: number,
  month: number,
  workedDays: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(month) || month < 1 || month > 12) return { ok: false, error: "Mois invalide" };
  const daysInMonth = new Date(year, month, 0).getDate();
  if (!Number.isInteger(workedDays) || workedDays < 0 || workedDays > daysInMonth) return { ok: false, error: "Nombre de jours invalide" };

  const [existing] = await db
    .select()
    .from(practitionerVacations)
    .where(and(
      eq(practitionerVacations.practitionerId, practitionerId),
      eq(practitionerVacations.year, year),
      eq(practitionerVacations.month, month),
    ));

  if (existing) {
    await db.update(practitionerVacations)
      .set({ workedDays, updatedAt: new Date() })
      .where(eq(practitionerVacations.id, existing.id));
  } else {
    await db.insert(practitionerVacations).values({ practitionerId, year, month, workedDays });
  }
  return { ok: true };
}

export async function setDaysPerWeek(
  practitionerId: string,
  days: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(days) || days < 1 || days > 7) return { ok: false, error: "Jours/semaine invalide (1 à 7)" };
  await db.update(practitioners)
    .set({ daysPerWeekWorked: days, updatedAt: new Date() })
    .where(eq(practitioners.id, practitionerId));
  return { ok: true };
}

// ── Orchestration : prévision avec scénario persistant ──

export type ScenarioForecast = {
  history: CAHistory;
  forecast: CAForecast | null;
  /** Prévision de base AVANT scénario (référence pour comparaison). */
  baseForecast: CAForecast | null;
  monthsElapsed: number;
  /** true si une dispo réduite ou des leviers sont actifs. */
  hasScenario: boolean;
  adjustments: StoredAdjustment[];
};

/**
 * Prévision de l'année courante en appliquant le scénario persisté du praticien
 * (congés/jours par semaine + leviers de C.A.).
 *
 * @param monthsElapsed Mois révolus de l'année courante (mois en cours exclu).
 */
export async function buildScenarioForecast(
  hp: Practitioner,
  monthsElapsed: number,
): Promise<ScenarioForecast> {
  const history = await getCAHistoryForPractitioner(hp);
  const year = history.currentYear;

  if (history.years.length === 0) {
    return { history, forecast: null, baseForecast: null, monthsElapsed, hasScenario: false, adjustments: [] };
  }

  const baseForecast = forecastFromHistory(history.years, year, monthsElapsed);

  const [availabilityFactor, adjustments] = await Promise.all([
    buildAvailabilityFactor(hp.id, year, hp.daysPerWeekWorked),
    listCaAdjustments(hp.id, year),
  ]);

  const scenarioAdjustments: CAAdjustment[] = adjustments.map((a) => ({
    kind: a.kind,
    value: a.value,
    startMonth: a.startMonth,
    endMonth: a.endMonth,
    label: a.label ?? undefined,
  }));

  const hasScenario = hasReducedAvailability(availabilityFactor) || scenarioAdjustments.length > 0;

  const forecast = hasScenario
    ? applyScenarioToForecast(baseForecast, { availabilityFactor, adjustments: scenarioAdjustments }, monthsElapsed)
    : baseForecast;

  return { history, forecast, baseForecast, monthsElapsed, hasScenario, adjustments };
}
