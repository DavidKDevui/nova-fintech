/**
 * Moteur de prévision de chiffre d'affaires (statistique, sans IA).
 *
 * Principe : on ne demande JAMAIS à un LLM de produire le chiffre. La
 * prévision est calculée ici de façon déterministe et explicable :
 *   1. Tendance    — régression linéaire sur les années complètes passées.
 *   2. Saisonnalité — poids mensuels moyens issus de l'historique réel.
 *   3. Blend YTD    — pour l'année en cours, on combine le réalisé (year to
 *                     date) avec la projection du reste de l'année.
 *   4. Fourchette   — intervalle basse / probable / haute via la variance
 *                     observée.
 *
 * La couche IA (tool `forecast_ca`) se contentera d'EXPLIQUER ces chiffres.
 *
 * Module pur : aucune dépendance DB / réseau, entièrement testable.
 */

/** Une année complète d'historique (révolue). */
export type CompletedYear = {
  year: number;
  total: number;
  /** Ventilation mensuelle, 12 valeurs (index 0 = janvier). */
  months: number[];
};

export type CAForecastInput = {
  /** Années complètes passées, ordre indifférent (triées en interne). */
  completedYears: CompletedYear[];
  /** Année cible de la prévision (typiquement l'année en cours). */
  targetYear: number;
  /** CA mensuel déjà réalisé sur l'année cible (12 valeurs, 0 pour le futur). */
  ytdMonths: number[];
  /** Nombre de mois de l'année cible disposant de données réelles. */
  monthsElapsed: number;
};

export type ForecastBasis = "trend" | "ytd_projection" | "insufficient";
export type ForecastConfidence = "low" | "medium" | "high";

export type CAForecast = {
  targetYear: number;
  /** Estimation centrale du CA annuel. */
  annualProbable: number;
  /** Borne basse de la fourchette (~intervalle de confiance 80 %). */
  annualLow: number;
  /** Borne haute de la fourchette. */
  annualHigh: number;
  /** Ventilation mensuelle prévue (réel pour les mois passés, projeté ensuite). */
  monthly: number[];
  /** Croissance annuelle estimée vs dernière année complète (ratio, ex 0.08 = +8 %). null si indéterminable. */
  trendGrowthRate: number | null;
  /** Poids saisonniers utilisés (12 valeurs sommant à 1). */
  seasonality: number[];
  /** Méthode dominante retenue. */
  basis: ForecastBasis;
  confidence: ForecastConfidence;
  /** Nombre de mois d'historique réellement disponibles (toutes années). */
  monthsOfHistory: number;
};

/** Forme minimale d'une année d'historique acceptée par `forecastFromHistory`. */
export type HistoryYear = {
  year: number;
  total: number;
  months: number[];
  isComplete: boolean;
};

/** Quantile normal à 80 % (z ≈ 1.2816), cohérent avec les projections trésorerie. */
const Z80 = 1.2816;
/** Coefficient de variation plancher pour la fourchette (incertitude de base). */
const BASE_CV = 0.08;
/** Jours/mois minimaux avant de faire confiance à la projection YTD seule. */
const MIN_MONTHS_FOR_YTD = 3;

function round(n: number): number {
  return Math.round(n);
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

/**
 * Calcule les poids saisonniers (12 valeurs sommant à 1) à partir des années
 * complètes. Chaque année est normalisée par son total puis on moyenne, afin
 * qu'une grosse année ne pèse pas plus qu'une petite dans la *forme* saisonnière.
 * Repli sur une saisonnalité plate (1/12) si aucune donnée exploitable.
 */
function computeSeasonality(completedYears: CompletedYear[]): number[] {
  const flat = Array<number>(12).fill(1 / 12);
  const usable = completedYears.filter((y) => y.total > 0 && y.months.length === 12);
  if (usable.length === 0) return flat;

  const acc = Array<number>(12).fill(0);
  for (const y of usable) {
    const t = sum(y.months);
    if (t <= 0) continue;
    for (let m = 0; m < 12; m++) acc[m] += y.months[m] / t;
  }
  const total = sum(acc);
  if (total <= 0) return flat;
  return acc.map((v) => v / total);
}

/**
 * Régression linéaire (moindres carrés) du CA annuel en fonction de l'année.
 * Renvoie la valeur prédite pour `targetYear` et la dispersion résiduelle.
 */
function linearTrend(
  completedYears: CompletedYear[],
  targetYear: number,
): { predicted: number | null; residualStd: number; lastTotal: number | null } {
  const pts = completedYears
    .filter((y) => y.total > 0)
    .sort((a, b) => a.year - b.year);

  if (pts.length === 0) return { predicted: null, residualStd: 0, lastTotal: null };
  const lastTotal = pts[pts.length - 1].total;

  if (pts.length === 1) {
    // Une seule année : pas de pente, on reconduit le dernier total.
    return { predicted: lastTotal, residualStd: 0, lastTotal };
  }

  const n = pts.length;
  const xs = pts.map((p) => p.year);
  const ys = pts.map((p) => p.total);
  const meanX = sum(xs) / n;
  const meanY = sum(ys) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  const predicted = Math.max(0, slope * targetYear + intercept);

  // Écart-type des résidus (qualité d'ajustement) → sert à la fourchette.
  let ssr = 0;
  for (let i = 0; i < n; i++) {
    const fit = slope * xs[i] + intercept;
    ssr += (ys[i] - fit) ** 2;
  }
  const residualStd = n > 2 ? Math.sqrt(ssr / (n - 2)) : 0;

  return { predicted, residualStd, lastTotal };
}

/**
 * Produit la prévision de CA pour `targetYear`.
 *
 * Stratégie de blend : plus l'année avance, plus on fait confiance au réalisé
 * (run-rate ajusté de la saisonnalité) plutôt qu'à la tendance historique.
 */
export function forecastCA(input: CAForecastInput): CAForecast {
  const { completedYears, targetYear, ytdMonths, monthsElapsed } = input;

  const seasonality = computeSeasonality(completedYears);
  const { predicted: trendAnnual, residualStd, lastTotal } = linearTrend(
    completedYears,
    targetYear,
  );

  const monthsOfHistory =
    completedYears.reduce((acc, y) => acc + y.months.filter((v) => v > 0).length, 0) +
    monthsElapsed;

  const ytdTotal = sum(ytdMonths.slice(0, Math.max(0, monthsElapsed)));

  // Fraction du CA annuel typiquement acquise sur les mois déjà écoulés.
  const fractionElapsed = sum(seasonality.slice(0, Math.max(0, monthsElapsed)));
  const remainingFraction = Math.max(0, 1 - fractionElapsed);

  // Projection plein-année à partir du seul réalisé (annualisation saisonnière).
  const ytdProjection =
    fractionElapsed > 0 ? ytdTotal / fractionElapsed : null;

  // ── Choix de la base et estimation centrale ──
  let annualProbable: number;
  let basis: ForecastBasis;

  if (trendAnnual != null && ytdProjection != null && monthsElapsed > 0) {
    // Blend : alpha (poids de la tendance) décroît à mesure que l'année avance.
    const alpha = remainingFraction; // début d'année → tendance ; fin → réalisé
    const expectedRemaining =
      remainingFraction * (alpha * trendAnnual + (1 - alpha) * ytdProjection);
    annualProbable = ytdTotal + expectedRemaining;
    basis = completedYears.filter((y) => y.total > 0).length >= 2 ? "trend" : "ytd_projection";
  } else if (trendAnnual != null) {
    // Pas encore de réalisé sur l'année cible : tendance pure.
    annualProbable = trendAnnual;
    basis = completedYears.filter((y) => y.total > 0).length >= 2 ? "trend" : "ytd_projection";
  } else if (ytdProjection != null && monthsElapsed >= MIN_MONTHS_FOR_YTD) {
    // Aucun historique annuel, mais assez de mois cette année pour projeter.
    annualProbable = ytdProjection;
    basis = "ytd_projection";
  } else {
    // Données insuffisantes : on renvoie le peu qu'on a, marqué comme tel.
    annualProbable = ytdTotal;
    basis = "insufficient";
  }

  annualProbable = Math.max(0, annualProbable);

  // ── Ventilation mensuelle (réel + projeté) ──
  const expectedRemainingTotal = Math.max(0, annualProbable - ytdTotal);
  const monthly = Array<number>(12).fill(0);
  for (let m = 0; m < 12; m++) {
    if (m < monthsElapsed) {
      monthly[m] = round(ytdMonths[m] ?? 0);
    } else if (remainingFraction > 0) {
      // Répartit le CA restant selon la forme saisonnière des mois à venir.
      monthly[m] = round(expectedRemainingTotal * (seasonality[m] / remainingFraction));
    } else {
      monthly[m] = 0;
    }
  }

  // ── Fourchette (≈ IC 80 %) ──
  // Incertitude = max(dispersion résiduelle de la tendance, CV plancher),
  // pondérée par la part de l'année encore à prévoir (le réalisé est certain).
  const baseSigma = Math.max(residualStd, annualProbable * BASE_CV);
  const sigma = baseSigma * Math.max(remainingFraction, monthsElapsed === 0 ? 1 : 0.25);
  const annualLow = Math.max(0, round(annualProbable - Z80 * sigma));
  const annualHigh = round(annualProbable + Z80 * sigma);

  // ── Croissance vs dernière année complète ──
  const trendGrowthRate =
    lastTotal && lastTotal > 0 ? annualProbable / lastTotal - 1 : null;

  // ── Niveau de confiance ──
  let confidence: ForecastConfidence;
  const completeCount = completedYears.filter((y) => y.total > 0).length;
  if (basis === "insufficient" || monthsOfHistory < 6) {
    confidence = "low";
  } else if (completeCount >= 2 && monthsOfHistory >= 18) {
    confidence = "high";
  } else {
    confidence = "medium";
  }

  return {
    targetYear,
    annualProbable: round(annualProbable),
    annualLow,
    annualHigh,
    monthly,
    trendGrowthRate,
    seasonality,
    basis,
    confidence,
    monthsOfHistory,
  };
}

/**
 * Adapte un historique de CA (sortie de `getCAHistoryForPractitioner`) en
 * entrée du moteur et renvoie la prévision pour l'année courante.
 *
 * @param years        Années de l'historique (complètes + année courante).
 * @param currentYear  Année cible de la prévision.
 * @param monthsElapsed Nombre de mois RÉVOLUS de l'année courante (mois en
 *                      cours exclu : run-rate sur mois complets uniquement).
 */
export function forecastFromHistory(
  years: HistoryYear[],
  currentYear: number,
  monthsElapsed: number,
): CAForecast {
  const completedYears: CompletedYear[] = years
    .filter((y) => y.isComplete && y.total > 0)
    .map((y) => ({ year: y.year, total: y.total, months: y.months }));

  const current = years.find((y) => y.year === currentYear);
  const ytdMonths = current ? current.months.slice() : Array<number>(12).fill(0);

  return forecastCA({ completedYears, targetYear: currentYear, ytdMonths, monthsElapsed });
}

// ── Scénarios : disponibilité + leviers de C.A. ────────────────────────────

export type CAAdjustmentKind =
  | "rate_pct"
  | "volume_pct"
  | "fixed_monthly"
  | "fixed_oneoff"
  | "month_override"; // impose la valeur d'un mois (ex: estimation par actes prévus)

export type CAAdjustment = {
  kind: CAAdjustmentKind;
  /** rate_pct / volume_pct : ratio (0.1 = +10 %). fixed_* : montant en euros. */
  value: number;
  /** Mois de début, 1..12 (inclus). */
  startMonth: number;
  /** Mois de fin, 1..12 (inclus). Pour fixed_oneoff : = startMonth. */
  endMonth: number;
  label?: string;
};

export type ForecastScenario = {
  /** Facteur de disponibilité par mois (12 valeurs, 0..1 ; 1 = normal, 0 = off). */
  availabilityFactor?: number[];
  adjustments?: CAAdjustment[];
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

function coversMonth(a: CAAdjustment, month1to12: number): boolean {
  return month1to12 >= a.startMonth && month1to12 <= a.endMonth;
}

/**
 * Applique un scénario (disponibilité + leviers) à une prévision de base.
 *
 * - Seuls les mois **futurs** (index ≥ monthsElapsed) sont modifiés : le passé
 *   est réalisé, donc certain et intouchable.
 * - La disponibilité retire le C.A. des mois indisponibles **sans report** :
 *   un IDEL qui ne travaille pas en juin perd le C.A. de juin (cohérent avec
 *   le calcul des cotisations basé sur les jours réellement travaillés).
 * - Les leviers `rate_pct`/`volume_pct` sont multiplicatifs, `fixed_monthly`
 *   s'ajoute à chaque mois couvert, `fixed_oneoff` au seul mois de début.
 *
 * La fourchette est remise à l'échelle du nouveau futur prévu (toute
 * l'incertitude porte sur les mois restants).
 */
export function applyScenarioToForecast(
  base: CAForecast,
  scenario: ForecastScenario,
  monthsElapsed: number,
): CAForecast {
  const monthly = base.monthly.slice();
  const avail = scenario.availabilityFactor;
  const adjustments = scenario.adjustments ?? [];

  // Valeurs imposées par mois (dernière gagne) — prioritaires sur dispo/leviers.
  const overrides = new Map<number, number>();
  for (const a of adjustments) {
    if (a.kind === "month_override") overrides.set(a.startMonth, a.value);
  }

  for (let m = 0; m < 12; m++) {
    if (m < monthsElapsed) continue; // passé réalisé → intouchable
    const month1 = m + 1;

    // 0. Valeur imposée pour ce mois : remplace tout, on ne touche plus.
    if (overrides.has(month1)) {
      monthly[m] = Math.max(0, round(overrides.get(month1)!));
      continue;
    }

    let v = monthly[m];

    // 1. Disponibilité (perte sèche).
    if (avail) v *= clamp01(avail[m]);

    // 2. Leviers multiplicatifs (tarif, volume de patientèle).
    for (const a of adjustments) {
      if ((a.kind === "rate_pct" || a.kind === "volume_pct") && coversMonth(a, month1)) {
        v *= 1 + a.value;
      }
    }
    // 3. Leviers additifs (nouveau contrat, prime ponctuelle).
    for (const a of adjustments) {
      if (a.kind === "fixed_monthly" && coversMonth(a, month1)) v += a.value;
      if (a.kind === "fixed_oneoff" && a.startMonth === month1) v += a.value;
    }

    monthly[m] = Math.max(0, round(v));
  }

  const annualProbable = Math.max(0, sum(monthly));

  // Fourchette : remise à l'échelle du nouveau futur (le réalisé reste certain).
  const realizedTotal = sum(base.monthly.slice(0, Math.max(0, monthsElapsed)));
  const baseFuture = base.annualProbable - realizedTotal;
  const newFuture = annualProbable - realizedTotal;
  const scale = baseFuture > 0 ? Math.max(0, newFuture / baseFuture) : 1;
  const upWidth = (base.annualHigh - base.annualProbable) * scale;
  const downWidth = (base.annualProbable - base.annualLow) * scale;
  const annualHigh = round(annualProbable + upWidth);
  const annualLow = Math.max(0, round(annualProbable - downWidth));

  // Croissance recalculée vs dernière année complète (déduite de la base).
  let trendGrowthRate = base.trendGrowthRate;
  if (base.trendGrowthRate != null && base.annualProbable > 0) {
    const lastTotal = base.annualProbable / (1 + base.trendGrowthRate);
    trendGrowthRate = lastTotal > 0 ? annualProbable / lastTotal - 1 : null;
  }

  return { ...base, annualProbable, annualLow, annualHigh, monthly, trendGrowthRate };
}
