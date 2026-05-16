"use server";

import { eq, and, inArray, sql, gte, lte } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners, bankAccounts, bankTransactions } from "@/lib/db/schema";
import { getCotisationsEstimate } from "@/actions/cotisations-estimate";
import { buildCalendar, getUpcomingEvents, DEFAULT_PREFERENCES, type PaymentPreferences } from "@/lib/data/fiscal-calendar";

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export type RecommendationCategory = "tax_optim" | "performance" | "treasury" | "data_quality";
export type RecommendationSeverity = "info" | "opportunity" | "warning" | "critical";

export type Recommendation = {
  key: string;
  title: string;
  message: string;
  category: RecommendationCategory;
  severity: RecommendationSeverity;
  /** Impact estimé en € sur l'année (positif = économie/gain potentiel, négatif = risque). */
  impactEur?: number;
  cta?: { label: string; href: string };
  /** Données factuelles qui justifient la reco, pour transparence côté UI/chat. */
  evidence: string[];
};

// ───────────────────────────────────────────────────────────────────────────
// Constantes (tunables)
// ───────────────────────────────────────────────────────────────────────────

const TMI_PROXY = 0.30;                  // Tranche marginale d'imposition typique IDEL
const URSSAF_PROXY_RATE = 0.32;          // % URSSAF moyen sur revenu net IDEL
const DORMANT_CASH_COVERAGE = 6;         // Au-delà de 6 mois de charges → "dormant"
const DORMANT_YIELD = 0.04;              // Rendement potentiel mix livret + PER
const PAYMENT_DELAY_TARGET = 30;         // Seuil au-delà duquel le délai est "long"
const PAYMENT_DELAY_COST_RATE = 0.03;    // Coût du cash immobilisé (Euribor + spread)
const URSSAF_LATE_PENALTY = 0.075;       // Majoration moyenne URSSAF (5-10%)
const URSSAF_PENALTY_GRACE_DAYS = 15;    // On considère "en retard" au-delà de 15j sans paiement
const MICRO_BNC_THRESHOLD = 77_700;      // Seuil de CA pour micro-BNC (2026)
const MICRO_BNC_ABATTEMENT = 0.34;       // Abattement forfaitaire micro-BNC

// Regex POSIX case-insensitive ; `\y` = word boundary en PostgreSQL.
// On évite ainsi les faux positifs sur "perception", "perfusion", "perpetuité", "perte", etc.
const PER_REGEX = "(\\yper\\y|épargne[[:space:]]+retraite|epargne[[:space:]]+retraite|\\ylinxea\\y|\\yyomoni\\y|\\yperin\\y)";

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

type Practitioner = typeof practitioners.$inferSelect;
type Estimate = NonNullable<Awaited<ReturnType<typeof getCotisationsEstimate>>>;

function clampPositive(n: number): number {
  return Math.max(0, Math.round(n));
}

function annualizeFromYtd(ytdValue: number, monthsActive: number): number {
  if (monthsActive <= 0) return 0;
  return (ytdValue / monthsActive) * 12;
}

function plafondPER(revenuPro: number, pass: number): number {
  const plancher = 0.10 * pass;
  const base = Math.min(0.10 * revenuPro, 0.10 * 8 * pass);
  const supplement = 0.15 * Math.max(0, Math.min(revenuPro, 8 * pass) - pass);
  return Math.round(Math.max(plancher, base) + supplement);
}

function plafondMadelin(revenuPro: number, pass: number): number {
  return Math.round(Math.min(0.0375 * revenuPro + 0.07 * pass, 0.03 * 8 * pass));
}

// ───────────────────────────────────────────────────────────────────────────
// Action principale
// ───────────────────────────────────────────────────────────────────────────

export async function getRecommendationsAction(): Promise<Recommendation[]> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return [];

  const [hp] = await db.select().from(practitioners).where(eq(practitioners.userId, session.id));
  if (!hp) return [];

  return computeRecommendations(hp);
}

export async function computeRecommendationsById(practitionerId: string): Promise<Recommendation[]> {
  const [hp] = await db.select().from(practitioners).where(eq(practitioners.id, practitionerId));
  if (!hp) return [];
  return computeRecommendations(hp);
}

async function computeRecommendations(hp: Practitioner): Promise<Recommendation[]> {
  const now = new Date();
  const year = now.getFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const yearsOfActivity = year - new Date(hp.activityStartDate).getFullYear();
  const isMicroBNC = hp.taxRegime === "micro_bnc";

  // ── Données de base ──
  const accounts = await db
    .select({ id: bankAccounts.id, balance: bankAccounts.balance })
    .from(bankAccounts)
    .where(eq(bankAccounts.practitionerId, hp.id));
  const accountIds = accounts.map((a) => a.id);
  const totalBalance = accounts.reduce((acc, a) => acc + Number(a.balance ?? 0), 0);

  if (accountIds.length === 0) return []; // pas de banque → aucune reco data-driven

  // CA bordereaux YTD (proxy pour le revenu pro)
  // On utilise les transactions "income" + "royalty" pour plus de fiabilité.
  const [incomeRow, expensesRow] = await Promise.all([
    db
      .select({ total: sql<string>`COALESCE(SUM(${bankTransactions.amount}), 0)` })
      .from(bankTransactions)
      .where(and(
        inArray(bankTransactions.bankAccountId, accountIds),
        inArray(bankTransactions.category, ["income", "royalty", "professional_reimbursement"]),
        gte(bankTransactions.date, yearStart),
        lte(bankTransactions.date, yearEnd),
        sql`${bankTransactions.amount} > 0`,
      )),
    db
      .select({ total: sql<string>`COALESCE(SUM(ABS(${bankTransactions.amount})), 0)` })
      .from(bankTransactions)
      .where(and(
        inArray(bankTransactions.bankAccountId, accountIds),
        gte(bankTransactions.date, yearStart),
        lte(bankTransactions.date, yearEnd),
        sql`${bankTransactions.amount} < 0`,
      )),
  ]);

  const caYtd = Number(incomeRow[0]?.total ?? 0);
  const decaissementYtd = Number(expensesRow[0]?.total ?? 0);

  if (caYtd <= 0) return []; // pas de CA → recos non significatives

  // Estimate complète + facturation (une seule fois, pour éviter les re-fetch
  // dans les détecteurs en aval).
  const { getFacturationData } = await import("@/actions/facturation");
  const [estimate, facturation] = await Promise.all([
    getCotisationsEstimate(caYtd),
    getFacturationData(),
  ]);
  if (!estimate) return [];
  const avgPaymentDelay = "summary" in facturation && facturation.summary
    ? facturation.summary.avgPaymentDelay
    : null;

  const revenuPro = isMicroBNC ? estimate.revenuAnnualise * (1 - MICRO_BNC_ABATTEMENT) : estimate.revenuAnnualise;
  const monthsActive = Math.max(1, now.getMonth() + 1 - (new Date(hp.activityStartDate).getFullYear() === year ? new Date(hp.activityStartDate).getMonth() : 0));
  const monthlyCharges = decaissementYtd / monthsActive;

  // ── Détections (lancées en parallèle quand possible) ──
  const detectors: Promise<Recommendation | null>[] = [
    detectPerUnderused(accountIds, yearStart, yearEnd, revenuPro, estimate.pss, year),
    detectMadelinUnderused(accountIds, isMicroBNC, yearStart, yearEnd, monthsActive, revenuPro, estimate.pss),
    detectUrssafRegularisationRisk(estimate, yearsOfActivity),
    detectUpcomingDeadlinesShortfall(hp, estimate, totalBalance, now),
    detectFiscalRegimeSuboptimal(isMicroBNC, estimate.revenuAnnualise, accountIds, yearStart, yearEnd, monthsActive),
    Promise.resolve(detectLongPaymentDelay(avgPaymentDelay, caYtd)),
    detectDormantCash(totalBalance, monthlyCharges),
    detectLateContributions(accountIds, hp, now),
  ];

  const results = await Promise.all(detectors);
  const recos = results.filter((r): r is Recommendation => r !== null);

  // Tri : critical > warning > opportunity > info, puis par impact € décroissant
  const severityRank: Record<RecommendationSeverity, number> = { critical: 0, warning: 1, opportunity: 2, info: 3 };
  recos.sort((a, b) => {
    const s = severityRank[a.severity] - severityRank[b.severity];
    if (s !== 0) return s;
    return (b.impactEur ?? 0) - (a.impactEur ?? 0);
  });

  return recos;
}

// ───────────────────────────────────────────────────────────────────────────
// Détecteurs (1 par recommandation)
// ───────────────────────────────────────────────────────────────────────────

// #1 — PER sous-utilisé : détecte les versements PER par libellé et compare au plafond.
async function detectPerUnderused(
  accountIds: string[],
  yearStart: string,
  yearEnd: string,
  revenuPro: number,
  pass: number,
  year: number,
): Promise<Recommendation | null> {
  if (revenuPro <= 0) return null;

  const [perRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(ABS(${bankTransactions.amount})), 0)` })
    .from(bankTransactions)
    .where(and(
      inArray(bankTransactions.bankAccountId, accountIds),
      gte(bankTransactions.date, yearStart),
      lte(bankTransactions.date, yearEnd),
      sql`${bankTransactions.amount} < 0`,
      sql`(${bankTransactions.description} ~* ${PER_REGEX} OR COALESCE(${bankTransactions.cleanDescription}, '') ~* ${PER_REGEX})`,
    ));

  const perVerse = Number(perRow?.total ?? 0);
  const plafond = plafondPER(revenuPro, pass);
  const utilise = Math.min(perVerse, plafond);
  const reste = Math.max(0, plafond - utilise);

  // Si déjà bien utilisé (>80 %) ou plafond trivial → rien à signaler
  if (plafond < 500 || utilise / plafond > 0.80) return null;

  const economie = clampPositive(reste * TMI_PROXY);

  return {
    key: "per_underused",
    title: "Plan Épargne Retraite sous-utilisé",
    message: `Tu as versé ${formatEur(utilise)} sur ton PER en ${year} alors que ton plafond est de ${formatEur(plafond)}. En versant les ${formatEur(reste)} restants, tu déduirais autant de ton revenu imposable.`,
    category: "tax_optim",
    severity: "opportunity",
    impactEur: economie,
    cta: { label: "Activer le PER", href: "/optimization" },
    evidence: [
      `Versements PER détectés YTD : ${formatEur(perVerse)}`,
      `Plafond annuel : ${formatEur(plafond)}`,
      `Économie d'impôt estimée (TMI ${Math.round(TMI_PROXY * 100)} %) : ${formatEur(economie)}`,
    ],
  };
}

// #2 — Madelin sous-utilisé (BNC réel uniquement) : détecte les versements via la catégorie.
async function detectMadelinUnderused(
  accountIds: string[],
  isMicroBNC: boolean,
  yearStart: string,
  yearEnd: string,
  monthsActive: number,
  revenuPro: number,
  pass: number,
): Promise<Recommendation | null> {
  if (isMicroBNC) return null; // Pas déductible en plus de l'abattement
  if (revenuPro <= 0) return null;

  const [madelinRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(ABS(${bankTransactions.amount})), 0)` })
    .from(bankTransactions)
    .where(and(
      inArray(bankTransactions.bankAccountId, accountIds),
      eq(bankTransactions.category, "madelin"),
      gte(bankTransactions.date, yearStart),
      lte(bankTransactions.date, yearEnd),
      sql`${bankTransactions.amount} < 0`,
    ));

  const madelinYtd = Number(madelinRow?.total ?? 0);
  // Annualise pour comparer à un plafond annuel
  const madelinProjete = annualizeFromYtd(madelinYtd, monthsActive);
  const plafond = plafondMadelin(revenuPro, pass);

  if (plafond < 500 || madelinProjete / plafond > 0.80) return null;

  const reste = Math.max(0, plafond - madelinProjete);
  // Madelin = double déduction : IR (TMI ~30 %) + URSSAF (~22 %)
  const economie = clampPositive(reste * (TMI_PROXY + 0.22));

  return {
    key: "madelin_underused",
    title: "Contrat Madelin sous-utilisé",
    message: `Tu cotises ${formatEur(madelinProjete)} annualisés en Madelin (prévoyance) alors que ton plafond est de ${formatEur(plafond)}. Cette cotisation est déductible à la fois de ton revenu imposable et de tes cotisations URSSAF.`,
    category: "tax_optim",
    severity: "opportunity",
    impactEur: economie,
    cta: { label: "Configurer Madelin", href: "/optimization" },
    evidence: [
      `Versements Madelin projetés : ${formatEur(madelinProjete)}`,
      `Plafond annuel : ${formatEur(plafond)}`,
      `Économie estimée (IR + URSSAF) : ${formatEur(economie)}`,
    ],
  };
}

// #3 — Risque de régularisation URSSAF : début d'activité avec revenu réel > forfait.
async function detectUrssafRegularisationRisk(
  estimate: Estimate,
  yearsOfActivity: number,
): Promise<Recommendation | null> {
  if (estimate.urssafBase !== "forfaitaire") return null;
  if (yearsOfActivity < 1) return null; // Régularisation N+2 → pas de risque en année 1
  if (estimate.revenuAnnualise <= 0) return null;

  const urssafReel = estimate.revenuAnnualise * URSSAF_PROXY_RATE;
  const ecart = urssafReel - estimate.urssafAnnuel;
  if (ecart < 1000) return null; // Marge négligeable

  return {
    key: "urssaf_regularisation",
    title: "Régularisation URSSAF à provisionner",
    message: `Tu cotises actuellement sur la base forfaitaire (~${formatEur(estimate.urssafAnnuel)}) mais ton revenu réel projeté est de ${formatEur(estimate.revenuAnnualise)}. À la régularisation N+2, tu devras payer la différence — provisionne ~${formatEur(ecart)} pour éviter le choc.`,
    category: "treasury",
    severity: "warning",
    impactEur: -clampPositive(ecart),
    cta: { label: "Voir les échéances", href: "/deadlines" },
    evidence: [
      `URSSAF forfaitaire actuel : ${formatEur(estimate.urssafAnnuel)}`,
      `URSSAF estimé sur revenu réel : ${formatEur(urssafReel)}`,
      `Provision recommandée : ${formatEur(ecart)}`,
    ],
  };
}

// #4 — Échéances supérieures au solde : prochaines échéances 3 mois vs solde.
async function detectUpcomingDeadlinesShortfall(
  hp: Practitioner,
  estimate: Estimate,
  totalBalance: number,
  now: Date,
): Promise<Recommendation | null> {
  const prefs: PaymentPreferences = {
    urssafFrequency: hp.urssafFrequency,
    urssafPayDay: hp.urssafPayDay,
    pasFrequency: hp.pasFrequency,
    carpimkoFrequency: hp.carpimkoFrequency,
    carpimkoPayDay: hp.carpimkoPayDay ?? DEFAULT_PREFERENCES.carpimkoPayDay,
    activityStartDate: hp.activityStartDate,
  };

  const calendar = buildCalendar(prefs);
  // On enrichit les estimatedAmount manquants à partir de l'estimate.
  const enriched = Object.fromEntries(
    Object.entries(calendar).map(([m, events]) => [m, events.map((e) => ({
      ...e,
      estimatedAmount: e.estimatedAmount ?? defaultAmountForType(e.type, estimate),
    }))]),
  ) as typeof calendar;

  const upcoming = getUpcomingEvents(now.getMonth(), now.getDate(), 20, enriched, { maxDays: 90 });
  const total = upcoming.reduce((s, e) => s + (e.estimatedAmount ?? 0), 0);
  if (total <= 0) return null;
  if (totalBalance >= total) return null;

  const deficit = total - totalBalance;
  return {
    key: "deadlines_shortfall",
    title: "Échéances supérieures à ton solde",
    message: `Les ${upcoming.length} prochaines échéances totalisent ${formatEur(total)} sur les 3 prochains mois, mais ton solde actuel est de ${formatEur(totalBalance)}. Il manque ${formatEur(deficit)}.`,
    category: "treasury",
    severity: "critical",
    impactEur: -clampPositive(deficit),
    cta: { label: "Voir le calendrier fiscal", href: "/deadlines" },
    evidence: [
      `Total échéances 3 mois : ${formatEur(total)}`,
      `Solde actuel : ${formatEur(totalBalance)}`,
      `Découvert prévisionnel : ${formatEur(deficit)}`,
    ],
  };
}

function defaultAmountForType(type: string, e: Estimate): number {
  switch (type) {
    case "urssaf": return e.urssafParEcheance;
    case "carpimko": return e.carpimkoParEcheance;
    case "ir": return e.pasParEcheance;
    default: return 0;
  }
}

// #5 — Régime fiscal sous-optimal : compare l'abattement micro vs frais réels.
async function detectFiscalRegimeSuboptimal(
  isMicroBNC: boolean,
  revenuAnnualise: number,
  accountIds: string[],
  yearStart: string,
  yearEnd: string,
  monthsActive: number,
): Promise<Recommendation | null> {
  if (revenuAnnualise <= 0) return null;

  // Frais pro réels = toutes les charges déductibles YTD, annualisées.
  const [fraisRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(ABS(${bankTransactions.amount})), 0)` })
    .from(bankTransactions)
    .where(and(
      inArray(bankTransactions.bankAccountId, accountIds),
      inArray(bankTransactions.category, [
        "urssaf", "carpimko", "professional_expenses", "retrocession", "madelin", "reprocessing",
      ]),
      gte(bankTransactions.date, yearStart),
      lte(bankTransactions.date, yearEnd),
      sql`${bankTransactions.amount} < 0`,
    ));

  const fraisYtd = Number(fraisRow?.total ?? 0);
  const fraisAnnualises = annualizeFromYtd(fraisYtd, monthsActive);
  const abattementMicro = revenuAnnualise * MICRO_BNC_ABATTEMENT;
  const ecart = Math.abs(fraisAnnualises - abattementMicro);
  if (ecart < 2000) return null; // pas significatif

  const economieIR = clampPositive(ecart * TMI_PROXY);

  if (isMicroBNC && fraisAnnualises > abattementMicro) {
    return {
      key: "regime_switch_to_reel",
      title: "Le régime BNC réel serait plus avantageux",
      message: `Tes frais professionnels réels (~${formatEur(fraisAnnualises)}) dépassent l'abattement micro-BNC de 34 % (~${formatEur(abattementMicro)}). Passer au régime réel te ferait déduire ${formatEur(ecart)} supplémentaires.`,
      category: "tax_optim",
      severity: "opportunity",
      impactEur: economieIR,
      cta: { label: "Modifier mon régime", href: "/profile" },
      evidence: [
        `Frais réels annualisés : ${formatEur(fraisAnnualises)}`,
        `Abattement micro 34 % : ${formatEur(abattementMicro)}`,
        `Économie d'impôt estimée : ${formatEur(economieIR)}`,
      ],
    };
  }

  if (!isMicroBNC && fraisAnnualises < abattementMicro && revenuAnnualise < MICRO_BNC_THRESHOLD) {
    return {
      key: "regime_switch_to_micro",
      title: "Le régime micro-BNC serait plus avantageux",
      message: `Tes frais professionnels réels (~${formatEur(fraisAnnualises)}) sont inférieurs à l'abattement micro-BNC de 34 % (~${formatEur(abattementMicro)}). Le régime micro te ferait gagner ${formatEur(ecart)} de déduction sans tenue de compta détaillée.`,
      category: "tax_optim",
      severity: "opportunity",
      impactEur: economieIR,
      cta: { label: "Modifier mon régime", href: "/profile" },
      evidence: [
        `Frais réels annualisés : ${formatEur(fraisAnnualises)}`,
        `Abattement micro 34 % : ${formatEur(abattementMicro)}`,
        `CA < seuil ${formatEur(MICRO_BNC_THRESHOLD)} : éligible`,
        `Économie d'impôt estimée : ${formatEur(economieIR)}`,
      ],
    };
  }

  return null;
}

// #6 — Délai de paiement long : avgPaymentDelay > 30j.
// Synchrone : la donnée vient déjà du fetch facturation hissé en amont.
function detectLongPaymentDelay(
  avgDelay: number | null,
  caYtd: number,
): Recommendation | null {
  if (avgDelay == null || avgDelay <= PAYMENT_DELAY_TARGET) return null;

  const extraDays = avgDelay - PAYMENT_DELAY_TARGET;
  const coutAnnuel = clampPositive((caYtd * extraDays / 365) * PAYMENT_DELAY_COST_RATE);

  return {
    key: "long_payment_delay",
    title: "Délai de paiement long",
    message: `Tes paiements arrivent en moyenne après ${Math.round(avgDelay)} jours (cible : ${PAYMENT_DELAY_TARGET}). Ce délai immobilise de la trésorerie — relancer plus tôt ou identifier les cabinets/payers en retard améliorerait ton cash flow.`,
    category: "performance",
    severity: avgDelay > 60 ? "warning" : "info",
    impactEur: coutAnnuel,
    cta: { label: "Voir la facturation", href: "/facturation" },
    evidence: [
      `Délai moyen : ${Math.round(avgDelay)} jours`,
      `Cible : ${PAYMENT_DELAY_TARGET} jours`,
      `Trésorerie immobilisée estimée : ${formatEur(coutAnnuel)}/an`,
    ],
  };
}

// #7 — Trésorerie dormante : solde > 6 mois de charges.
async function detectDormantCash(
  totalBalance: number,
  monthlyCharges: number,
): Promise<Recommendation | null> {
  if (monthlyCharges <= 0) return null;
  const coverage = totalBalance / monthlyCharges;
  if (coverage < DORMANT_CASH_COVERAGE) return null;

  const excess = totalBalance - DORMANT_CASH_COVERAGE * monthlyCharges;
  const yieldPotential = clampPositive(excess * DORMANT_YIELD);
  if (yieldPotential < 200) return null;

  return {
    key: "dormant_cash",
    title: "Trésorerie excédentaire à faire fructifier",
    message: `Tu as ${formatEur(totalBalance)} sur tes comptes, soit ${coverage.toFixed(1)} mois de charges. L'excédent (~${formatEur(excess)}) pourrait être placé sur un PER ou un livret pour générer du rendement.`,
    category: "treasury",
    severity: "opportunity",
    impactEur: yieldPotential,
    cta: { label: "Voir les placements", href: "/optimization" },
    evidence: [
      `Solde total : ${formatEur(totalBalance)}`,
      `Couverture : ${coverage.toFixed(1)} mois`,
      `Excédent au-delà de ${DORMANT_CASH_COVERAGE} mois : ${formatEur(excess)}`,
      `Rendement annuel estimé (${Math.round(DORMANT_YIELD * 100)} %) : ${formatEur(yieldPotential)}`,
    ],
  };
}

// #8 — Cotisations en retard : échéance URSSAF/CARPIMKO passée sans paiement détecté.
async function detectLateContributions(
  accountIds: string[],
  hp: Practitioner,
  now: Date,
): Promise<Recommendation | null> {
  const prefs: PaymentPreferences = {
    urssafFrequency: hp.urssafFrequency,
    urssafPayDay: hp.urssafPayDay,
    pasFrequency: hp.pasFrequency,
    carpimkoFrequency: hp.carpimkoFrequency,
    carpimkoPayDay: hp.carpimkoPayDay ?? DEFAULT_PREFERENCES.carpimkoPayDay,
    activityStartDate: hp.activityStartDate,
  };
  const calendar = buildCalendar(prefs);

  // Échéances passées dans les 60 derniers jours (mais au-delà de la grâce)
  const today = new Date(now);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const past: { date: Date; type: "urssaf" | "carpimko"; amount: number }[] = [];
  for (let m = 0; m < 12; m++) {
    for (const e of calendar[m] ?? []) {
      if (e.type !== "urssaf" && e.type !== "carpimko") continue;
      // Construit la date dans l'année courante, puis rétropède d'1 an si elle
      // tombe dans le futur (cas typique : on est en janvier, on regarde
      // l'échéance de décembre, qui appartient à l'année précédente).
      const d = new Date(today.getFullYear(), m, e.day);
      if (d > today) d.setFullYear(d.getFullYear() - 1);
      const daysAgo = (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      if (daysAgo > URSSAF_PENALTY_GRACE_DAYS && d >= sixtyDaysAgo) {
        past.push({ date: d, type: e.type, amount: e.estimatedAmount ?? 0 });
      }
    }
  }
  if (past.length === 0) return null;

  // Pour chaque échéance passée, on cherche une tx de paiement (catégorie + fenêtre ±10j)
  const missing: typeof past = [];
  for (const ech of past) {
    const windowStart = new Date(ech.date); windowStart.setDate(windowStart.getDate() - 10);
    const windowEnd = new Date(ech.date); windowEnd.setDate(windowEnd.getDate() + 10);
    const [row] = await db
      .select({ found: sql<string>`COUNT(*)` })
      .from(bankTransactions)
      .where(and(
        inArray(bankTransactions.bankAccountId, accountIds),
        eq(bankTransactions.category, ech.type),
        gte(bankTransactions.date, windowStart.toISOString().slice(0, 10)),
        lte(bankTransactions.date, windowEnd.toISOString().slice(0, 10)),
        sql`${bankTransactions.amount} < 0`,
      ));
    if (Number(row?.found ?? 0) === 0) missing.push(ech);
  }
  if (missing.length === 0) return null;

  const totalDue = missing.reduce((s, e) => s + e.amount, 0);
  const majoration = clampPositive(totalDue * URSSAF_LATE_PENALTY);

  return {
    key: "late_contributions",
    title: `${missing.length} cotisation${missing.length > 1 ? "s" : ""} potentiellement en retard`,
    message: `Aucun paiement détecté pour ${missing.length} échéance${missing.length > 1 ? "s" : ""} URSSAF/CARPIMKO récente${missing.length > 1 ? "s" : ""}. Si le paiement n'a pas été effectué, des majorations s'appliquent (~${Math.round(URSSAF_LATE_PENALTY * 100)} %).`,
    category: "treasury",
    severity: "critical",
    impactEur: -majoration,
    cta: { label: "Vérifier mes paiements", href: "/transactions" },
    evidence: missing.map((m) => `${m.type.toUpperCase()} échue le ${m.date.toLocaleDateString("fr-FR")} (~${formatEur(m.amount)})`),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers format
// ───────────────────────────────────────────────────────────────────────────

function formatEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n));
}
