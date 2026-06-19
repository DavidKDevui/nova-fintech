import { test } from "node:test";
import assert from "node:assert/strict";
import {
  forecastCA,
  applyScenarioToForecast,
  type CompletedYear,
  type CAForecast,
} from "./ca-forecast.service";

// Forme saisonnière type IDEL (creux estival), somme = 100.
const SHAPE = [9, 8, 9, 8, 9, 8, 4, 3, 9, 11, 10, 12];
const yr = (year: number, total: number): CompletedYear => ({
  year,
  total,
  months: SHAPE.map((s) => Math.round((total * s) / 100)),
});
const monthsOf = (total: number) => SHAPE.map((s) => Math.round((total * s) / 100));
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const zeros = () => Array<number>(12).fill(0);

// Invariants vérifiés sur tout résultat de forecastCA.
function assertInvariants(f: ReturnType<typeof forecastCA>) {
  assert.ok(f.annualLow <= f.annualProbable, `low(${f.annualLow}) <= probable(${f.annualProbable})`);
  assert.ok(f.annualProbable <= f.annualHigh, `probable(${f.annualProbable}) <= high(${f.annualHigh})`);
  assert.ok(f.annualLow >= 0, "low >= 0");
  assert.ok(f.annualProbable >= 0, "probable >= 0");
  for (const v of [f.annualLow, f.annualProbable, f.annualHigh]) {
    assert.ok(Number.isFinite(v), `valeur finie: ${v}`);
  }
  assert.equal(f.monthly.length, 12, "12 mois");
  for (const m of f.monthly) {
    assert.ok(Number.isFinite(m) && m >= 0, `mois fini >= 0: ${m}`);
  }
  assert.equal(f.seasonality.length, 12, "12 poids saisonniers");
  for (const s of f.seasonality) assert.ok(Number.isFinite(s) && s >= 0, `poids fini >= 0: ${s}`);
  assert.ok(Math.abs(sum(f.seasonality) - 1) < 1e-9, `saisonnalité somme à 1 (got ${sum(f.seasonality)})`);
}

test("saisonnalité reconstruite à partir des années complètes", () => {
  const f = forecastCA({
    completedYears: [yr(2023, 70000), yr(2024, 76000), yr(2025, 82000)],
    targetYear: 2026,
    ytdMonths: zeros(),
    monthsElapsed: 0,
  });
  assertInvariants(f);
  // Les poids doivent retrouver la forme SHAPE (à l'arrondi près).
  f.seasonality.forEach((s, i) => {
    assert.ok(Math.abs(s * 100 - SHAPE[i]) < 0.3, `poids mois ${i + 1}: ${(s * 100).toFixed(2)} ≈ ${SHAPE[i]}`);
  });
});

test("saisonnalité plate quand aucune année complète", () => {
  const f = forecastCA({
    completedYears: [],
    targetYear: 2026,
    ytdMonths: monthsOf(40000).map((v, i) => (i < 6 ? v : 0)),
    monthsElapsed: 6,
  });
  assertInvariants(f);
  f.seasonality.forEach((s) => assert.ok(Math.abs(s - 1 / 12) < 1e-9, "poids = 1/12"));
});

test("tendance croissante extrapolée (monthsElapsed=0 → tendance pure)", () => {
  const f = forecastCA({
    completedYears: [yr(2023, 70000), yr(2024, 76000), yr(2025, 82000)],
    targetYear: 2026,
    ytdMonths: zeros(),
    monthsElapsed: 0,
  });
  assertInvariants(f);
  assert.equal(f.basis, "trend");
  // Pente +6000/an → 2026 ≈ 88000.
  assert.ok(Math.abs(f.annualProbable - 88000) < 500, `probable ≈ 88000 (got ${f.annualProbable})`);
  assert.ok(f.trendGrowthRate! > 0, "croissance positive");
});

test("tendance décroissante donne une croissance négative", () => {
  const f = forecastCA({
    completedYears: [yr(2023, 90000), yr(2024, 82000), yr(2025, 74000)],
    targetYear: 2026,
    ytdMonths: zeros(),
    monthsElapsed: 0,
  });
  assertInvariants(f);
  assert.ok(f.trendGrowthRate! < 0, `croissance négative (got ${f.trendGrowthRate})`);
  assert.ok(f.annualProbable < 74000, "probable sous la dernière année");
});

test("une seule année complète → reconduction du dernier total", () => {
  const f = forecastCA({
    completedYears: [yr(2025, 80000)],
    targetYear: 2026,
    ytdMonths: zeros(),
    monthsElapsed: 0,
  });
  assertInvariants(f);
  assert.equal(f.annualProbable, 80000, "reconduit 80000");
  assert.equal(f.basis, "ytd_projection", "1 an → pas assez pour 'trend'");
});

test("ventilation mensuelle : somme ≈ probable et mois réalisés préservés", () => {
  const ytd = monthsOf(88000).map((v, i) => (i < 5 ? v : 0));
  const f = forecastCA({
    completedYears: [yr(2023, 70000), yr(2024, 76000), yr(2025, 82000)],
    targetYear: 2026,
    ytdMonths: ytd,
    monthsElapsed: 5,
  });
  assertInvariants(f);
  // Les 5 premiers mois doivent être EXACTEMENT le réalisé.
  for (let i = 0; i < 5; i++) assert.equal(f.monthly[i], ytd[i], `mois ${i + 1} = réalisé`);
  // La somme des 12 mois doit coller à l'estimation centrale (à l'arrondi près).
  assert.ok(Math.abs(sum(f.monthly) - f.annualProbable) <= 12, `somme(${sum(f.monthly)}) ≈ probable(${f.annualProbable})`);
});

test("blend : en fin d'année le réalisé domine la tendance", () => {
  // Tendance ~88k, mais le praticien explose son année (réalisé bien au-dessus).
  const realized = monthsOf(110000);
  const ytd = realized.map((v, i) => (i < 11 ? v : 0)); // 11 mois réalisés
  const f = forecastCA({
    completedYears: [yr(2023, 70000), yr(2024, 76000), yr(2025, 82000)],
    targetYear: 2026,
    ytdMonths: ytd,
    monthsElapsed: 11,
  });
  assertInvariants(f);
  const realizedYtd = sum(ytd.slice(0, 11));
  // La prévision doit être tirée vers le haut, bien au-dessus de la tendance 88k.
  assert.ok(f.annualProbable > 100000, `fin d'année suit le réalisé (got ${f.annualProbable})`);
  assert.ok(f.annualProbable >= realizedYtd, "probable >= réalisé YTD");
});

test("blend : début d'année, le réalisé d'un seul mois ne fait pas exploser la prévision", () => {
  // 1 mois énorme ne doit pas annualiser naïvement ×12.
  const ytd = zeros();
  ytd[0] = 30000; // janvier exceptionnel
  const f = forecastCA({
    completedYears: [yr(2023, 70000), yr(2024, 76000), yr(2025, 82000)],
    targetYear: 2026,
    ytdMonths: ytd,
    monthsElapsed: 1,
  });
  assertInvariants(f);
  // Sans garde-fou, run-rate naïf = 30000/0.09 ≈ 333k. Le blend pondère par
  // alpha (tendance) en début d'année → doit rester raisonnable.
  assert.ok(f.annualProbable < 200000, `pas d'explosion début d'année (got ${f.annualProbable})`);
  assert.ok(f.annualProbable >= 30000, "au moins le réalisé");
});

test("dégradé : aucun historique + 1 mois → insufficient, aucun chiffre inventé", () => {
  const ytd = zeros();
  ytd[0] = 7000;
  const f = forecastCA({ completedYears: [], targetYear: 2026, ytdMonths: ytd, monthsElapsed: 1 });
  assertInvariants(f);
  assert.equal(f.basis, "insufficient");
  assert.equal(f.confidence, "low");
  assert.equal(f.annualProbable, 7000, "ne renvoie que le réalisé, pas d'extrapolation");
});

test("aucun historique mais assez de mois → ytd_projection", () => {
  const ytd = monthsOf(60000).map((v, i) => (i < 6 ? v : 0));
  const f = forecastCA({ completedYears: [], targetYear: 2026, ytdMonths: ytd, monthsElapsed: 6 });
  assertInvariants(f);
  assert.equal(f.basis, "ytd_projection");
  // Saisonnalité plate (pas d'historique) : 6 mois = 50 % → projection ≈ 2× réalisé.
  const realized = sum(ytd.slice(0, 6));
  assert.ok(Math.abs(f.annualProbable - realized * 2) < 5, `≈ 2× réalisé (got ${f.annualProbable})`);
});

test("tout à zéro → insufficient, probable 0, pas de NaN", () => {
  const f = forecastCA({ completedYears: [], targetYear: 2026, ytdMonths: zeros(), monthsElapsed: 0 });
  assertInvariants(f);
  assert.equal(f.annualProbable, 0);
  assert.equal(f.basis, "insufficient");
  assert.equal(f.trendGrowthRate, null, "pas de croissance calculable sans base");
});

test("année cible entièrement réalisée (12 mois) → probable ≈ réalisé", () => {
  const realized = monthsOf(95000);
  const f = forecastCA({
    completedYears: [yr(2024, 80000), yr(2025, 88000)],
    targetYear: 2026,
    ytdMonths: realized,
    monthsElapsed: 12,
  });
  assertInvariants(f);
  assert.ok(Math.abs(f.annualProbable - sum(realized)) <= 12, `probable ≈ réalisé complet (got ${f.annualProbable})`);
  // Année finie → quasiment plus d'incertitude.
  assert.ok(f.annualHigh - f.annualLow < f.annualProbable * 0.1, "fourchette resserrée en fin d'année");
});

test("niveaux de confiance", () => {
  const high = forecastCA({
    completedYears: [yr(2023, 70000), yr(2024, 76000), yr(2025, 82000)],
    targetYear: 2026,
    ytdMonths: monthsOf(88000).map((v, i) => (i < 5 ? v : 0)),
    monthsElapsed: 5,
  });
  assert.equal(high.confidence, "high", "3 ans + assez de mois → high");

  const low = forecastCA({
    completedYears: [],
    targetYear: 2026,
    ytdMonths: (() => { const z = zeros(); z[0] = 5000; return z; })(),
    monthsElapsed: 1,
  });
  assert.equal(low.confidence, "low", "quasi rien → low");
});

test("fourchette : plus large en début d'année qu'en fin d'année", () => {
  const base = [yr(2023, 70000), yr(2024, 76000), yr(2025, 82000)];
  const early = forecastCA({ completedYears: base, targetYear: 2026, ytdMonths: zeros(), monthsElapsed: 0 });
  const lateYtd = monthsOf(88000).map((v, i) => (i < 10 ? v : 0));
  const late = forecastCA({ completedYears: base, targetYear: 2026, ytdMonths: lateYtd, monthsElapsed: 10 });
  const earlyWidth = early.annualHigh - early.annualLow;
  const lateWidth = late.annualHigh - late.annualLow;
  assert.ok(lateWidth < earlyWidth, `fin (${lateWidth}) < début (${earlyWidth})`);
});

test("robustesse : mois manquants / années dans le désordre", () => {
  const f = forecastCA({
    completedYears: [yr(2025, 82000), yr(2023, 70000), yr(2024, 76000)], // désordre
    targetYear: 2026,
    ytdMonths: zeros(),
    monthsElapsed: 0,
  });
  assertInvariants(f);
  // Le tri interne doit donner la même tendance que l'ordre croissant.
  assert.ok(Math.abs(f.annualProbable - 88000) < 500, `tri interne OK (got ${f.annualProbable})`);
});

// ── Scénarios (dispo + leviers) ──

// Prévision de base réutilisée : 3 ans en croissance, 0 mois réalisé.
function baseForecast(): CAForecast {
  return forecastCA({
    completedYears: [yr(2023, 70000), yr(2024, 76000), yr(2025, 82000)],
    targetYear: 2026,
    ytdMonths: zeros(),
    monthsElapsed: 0,
  });
}

test("scénario vide → prévision inchangée", () => {
  const base = baseForecast();
  const out = applyScenarioToForecast(base, {}, 0);
  assertInvariants(out);
  assert.equal(out.annualProbable, base.annualProbable);
  assert.deepEqual(out.monthly, base.monthly);
});

test("mois off (dispo 0) → perte ≈ le CA de ce mois, pas de report", () => {
  const base = baseForecast();
  const avail = Array<number>(12).fill(1);
  avail[5] = 0; // juin off
  const out = applyScenarioToForecast(base, { availabilityFactor: avail }, 0);
  assertInvariants(out);
  // Juin = 0 dans la ventilation.
  assert.equal(out.monthly[5], 0, "juin à 0");
  // Les autres mois sont inchangés (pas de report).
  for (let i = 0; i < 12; i++) {
    if (i === 5) continue;
    assert.equal(out.monthly[i], base.monthly[i], `mois ${i + 1} inchangé`);
  }
  // L'annuel baisse d'environ le CA de juin.
  assert.ok(Math.abs((base.annualProbable - out.annualProbable) - base.monthly[5]) <= 2, "perte ≈ CA juin");
});

test("demi-disponibilité (3 semaines off) réduit proportionnellement", () => {
  const base = baseForecast();
  const avail = Array<number>(12).fill(1);
  avail[7] = 0.3; // août à 30 % de capacité
  const out = applyScenarioToForecast(base, { availabilityFactor: avail }, 0);
  assertInvariants(out);
  assert.ok(Math.abs(out.monthly[7] - base.monthly[7] * 0.3) <= 1, "août ≈ 30 %");
});

test("levier rate_pct (+10 % toute l'année) augmente l'annuel d'environ 10 %", () => {
  const base = baseForecast();
  const out = applyScenarioToForecast(
    base,
    { adjustments: [{ kind: "rate_pct", value: 0.1, startMonth: 1, endMonth: 12, label: "+10% tarif" }] },
    0,
  );
  assertInvariants(out);
  assert.ok(Math.abs(out.annualProbable - base.annualProbable * 1.1) <= 12, `≈ +10 % (got ${out.annualProbable})`);
});

test("levier fixed_oneoff n'affecte qu'un seul mois", () => {
  const base = baseForecast();
  const out = applyScenarioToForecast(
    base,
    { adjustments: [{ kind: "fixed_oneoff", value: 5000, startMonth: 9, endMonth: 9, label: "prime" }] },
    0,
  );
  assertInvariants(out);
  assert.equal(out.monthly[8], base.monthly[8] + 5000, "septembre +5000");
  assert.equal(out.annualProbable, base.annualProbable + 5000, "annuel +5000");
});

test("levier fixed_monthly s'ajoute sur la période couverte", () => {
  const base = baseForecast();
  const out = applyScenarioToForecast(
    base,
    { adjustments: [{ kind: "fixed_monthly", value: 500, startMonth: 10, endMonth: 12, label: "contrat" }] },
    0,
  );
  assertInvariants(out);
  for (let i = 9; i <= 11; i++) assert.equal(out.monthly[i], base.monthly[i] + 500, `mois ${i + 1} +500`);
  assert.equal(out.annualProbable, base.annualProbable + 1500, "annuel +1500 (3 mois)");
});

test("scénario n'affecte jamais les mois réalisés (monthsElapsed)", () => {
  const realized = monthsOf(88000).map((v, i) => (i < 6 ? v : 0));
  const base = forecastCA({
    completedYears: [yr(2023, 70000), yr(2024, 76000), yr(2025, 82000)],
    targetYear: 2026,
    ytdMonths: realized,
    monthsElapsed: 6,
  });
  // Tente de tout mettre à 0 et d'ajouter des leviers : seuls les mois ≥ 6 bougent.
  const out = applyScenarioToForecast(
    base,
    {
      availabilityFactor: Array<number>(12).fill(0),
      adjustments: [{ kind: "fixed_oneoff", value: 9999, startMonth: 3, endMonth: 3 }],
    },
    6,
  );
  assertInvariants(out);
  for (let i = 0; i < 6; i++) assert.equal(out.monthly[i], base.monthly[i], `mois réalisé ${i + 1} intact`);
  for (let i = 6; i < 12; i++) assert.equal(out.monthly[i], 0, `mois futur ${i + 1} mis à 0`);
  // L'annuel = somme du réalisé uniquement.
  assert.equal(out.annualProbable, sum(realized.slice(0, 6)));
});

test("month_override : impose la valeur d'un mois futur", () => {
  const base = baseForecast();
  const out = applyScenarioToForecast(
    base,
    { adjustments: [{ kind: "month_override", value: 9000, startMonth: 7, endMonth: 7, label: "estim. actes" }] },
    0,
  );
  assertInvariants(out);
  assert.equal(out.monthly[6], 9000, "juillet imposé à 9000");
  // L'annuel = base sans juillet + 9000.
  assert.equal(out.annualProbable, base.annualProbable - base.monthly[6] + 9000);
});

test("month_override prioritaire sur dispo et leviers du même mois", () => {
  const base = baseForecast();
  const avail = Array<number>(12).fill(1);
  avail[7] = 0; // août off
  const out = applyScenarioToForecast(
    base,
    {
      availabilityFactor: avail,
      adjustments: [
        { kind: "month_override", value: 5000, startMonth: 8, endMonth: 8 },
        { kind: "rate_pct", value: 0.5, startMonth: 8, endMonth: 8 },
        { kind: "fixed_monthly", value: 1000, startMonth: 8, endMonth: 8 },
      ],
    },
    0,
  );
  assertInvariants(out);
  // L'override gagne : ni la dispo 0, ni le +50 %, ni le +1000 ne s'appliquent.
  assert.equal(out.monthly[7], 5000, "août = override pur");
});

test("month_override sur un mois passé est ignoré", () => {
  const realized = monthsOf(88000).map((v, i) => (i < 6 ? v : 0));
  const base = forecastCA({
    completedYears: [yr(2023, 70000), yr(2024, 76000), yr(2025, 82000)],
    targetYear: 2026,
    ytdMonths: realized,
    monthsElapsed: 6,
  });
  const out = applyScenarioToForecast(
    base,
    { adjustments: [{ kind: "month_override", value: 99999, startMonth: 3, endMonth: 3 }] },
    6,
  );
  assertInvariants(out);
  assert.equal(out.monthly[2], base.monthly[2], "mars (réalisé) inchangé malgré l'override");
});

test("combinaison dispo + leviers : ordre multiplicatif puis additif", () => {
  const base = baseForecast();
  const out = applyScenarioToForecast(
    base,
    {
      availabilityFactor: (() => { const a = Array<number>(12).fill(1); a[2] = 0.5; return a; })(),
      adjustments: [
        { kind: "rate_pct", value: 0.2, startMonth: 3, endMonth: 3 },
        { kind: "fixed_monthly", value: 100, startMonth: 3, endMonth: 3 },
      ],
    },
    0,
  );
  assertInvariants(out);
  // mars : base × 0.5 × 1.2 + 100
  const expected = Math.round(base.monthly[2] * 0.5 * 1.2) + 100;
  // tolérance d'arrondi (l'implémentation arrondit une seule fois en fin)
  assert.ok(Math.abs(out.monthly[2] - expected) <= 2, `mars ≈ ${expected} (got ${out.monthly[2]})`);
});
