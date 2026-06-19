"use client";

import Link from "next/link";
import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, useActionState, type ReactNode } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, ReferenceLine, LabelList } from "recharts";
import { getMonthlyActivityAction, getTransactionKpisAction, getCategoryTransactionsAction, type MonthlyActivityMonth, type CategoryTransaction } from "@/actions/transaction";
import { getCotisationsEstimate, type CotisationsEstimate } from "@/actions/cotisations-estimate";
import { simulateCotisations, type SimulationResult } from "@/actions/simulate-cotisations";
import { getCAForecastAction, type CAForecastResult } from "@/actions/ca-history";
import { getFiscalSituationAction, upsertFiscalSituationAction } from "@/actions/fiscal-situation";
import { getVacationsAction, upsertVacationDayAction } from "@/actions/vacations";
import { useData } from "@/providers/data-provider";
import { usePractitioner } from "@/providers/practitioner-provider";
import { useAssistant } from "@/providers/assistant-provider";
import { getEffectiveCAAction, type EffectiveCA } from "@/actions/effective-ca";
import { getMonthlyActivityFromBordereauxAction } from "@/actions/monthly-activity-bordereaux";
import { DataMissingOverlay } from "@/components/data-missing-overlay";
import { CASourceIndicator } from "@/components/ca-source-indicator";
import { EstimationBadge } from "@/components/estimation-badge";
import { buildCalendar, type PaymentPreferences, DEFAULT_PREFERENCES } from "@/lib/data/fiscal-calendar";
import { countWorkingDays, countRemainingWorkingDays } from "@/lib/data/fr-holidays";
import { computeIR, computeParts, getBareme } from "@/lib/data/fr-tax";
import { downloadCSV, downloadPDF, getChartImage } from "@/lib/export";
import { ExportButtons } from "@/components/export-buttons";
import { Button } from "@/components/button";

const TABS = [
  { key: "activity", label: "Mon activité" },
  { key: "contributions", label: "Mes cotisations sociales" },
  { key: "taxes", label: "Mes impôts" },
  { key: "summary", label: "Ma synthèse" },
  { key: "remainder", label: "Reste à vivre" },
  { key: "simulation", label: "Simulation" },
] as const;

type Tab = (typeof TABS)[number]["key"];

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
}

// ── Cache de données partagé entre les onglets ──
// Les onglets se montent un par un et refetchaient chacun le même cœur de
// données (CA effectif "transactions" + activité mensuelle + estimation cotis.)
// à chaque visite. Ces données sont read-only et stables pendant la session de
// page (rien dans /management ne mute les transactions/bordereaux), donc on les
// met en cache par année. Le cache est réinitialisé si la connexion bancaire
// change (les montants en dépendent) : les Maps sont recréées au render, donc
// avant que les effets des onglets ne tournent — pas de lecture périmée.

type YearCore = {
  effectiveCA: EffectiveCA;
  months: MonthlyActivityMonth[];
  totalCA: number;
  /** true = fallback bordereaux (CA réel issu des passages, cotisations estimées). */
  isEstimated: boolean;
};

type ManagementDataValue = {
  /** Cœur partagé pour une année : CA effectif + activité mensuelle (avec fallback). */
  loadYearCore: (year: number) => Promise<YearCore>;
  /** Estimation cotisations pour une année (null si CA nul). */
  loadEstimate: (year: number) => Promise<CotisationsEstimate | null>;
};

const ManagementDataContext = createContext<ManagementDataValue | null>(null);

function useManagementData(): ManagementDataValue {
  const ctx = useContext(ManagementDataContext);
  if (!ctx) throw new Error("useManagementData doit être utilisé dans ManagementDataProvider");
  return ctx;
}

// Le provider est remonté (via `key`) quand la connexion bancaire change, donc
// les caches repartent vides automatiquement — pas de logique d'invalidation ici.
function ManagementDataProvider({ children }: { children: ReactNode }) {
  const coreCacheRef = useRef(new Map<number, Promise<YearCore>>());
  const estimateCacheRef = useRef(new Map<number, Promise<CotisationsEstimate | null>>());

  const loadYearCore = useCallback((year: number) => {
    const cache = coreCacheRef.current;
    const cached = cache.get(year);
    if (cached) return cached;
    const p = (async (): Promise<YearCore> => {
      const effectiveCA = await getEffectiveCAAction(year, "transactions");
      const useFallback = effectiveCA.source === "bordereaux";
      const monthly = useFallback
        ? await getMonthlyActivityFromBordereauxAction(year)
        : await getMonthlyActivityAction(year);
      const months = monthly.months ?? [];
      const totalCA = months.reduce((s, m) => s + m.income, 0);
      return { effectiveCA, months, totalCA, isEstimated: useFallback };
    })().catch((err) => {
      // Échec : on retire l'entrée pour permettre une nouvelle tentative.
      coreCacheRef.current.delete(year);
      throw err;
    });
    cache.set(year, p);
    return p;
  }, []);

  const loadEstimate = useCallback((year: number) => {
    const cache = estimateCacheRef.current;
    const cached = cache.get(year);
    if (cached) return cached;
    const p = (async (): Promise<CotisationsEstimate | null> => {
      const { totalCA } = await loadYearCore(year);
      if (totalCA <= 0) return null;
      return getCotisationsEstimate(totalCA, 0, year);
    })().catch((err) => {
      estimateCacheRef.current.delete(year);
      throw err;
    });
    cache.set(year, p);
    return p;
  }, [loadYearCore]);

  const value = useMemo(() => ({ loadYearCore, loadEstimate }), [loadYearCore, loadEstimate]);
  return <ManagementDataContext.Provider value={value}>{children}</ManagementDataContext.Provider>;
}

export function ManagementClient() {
  const hp = usePractitioner();
  const [tab, setTab] = useState<Tab>("activity");

  return (
    // key = connexion bancaire : un changement remonte tout le sous-arbre et
    // vide le cache de données partagé (les montants CA/cotisations en dépendent).
    <ManagementDataProvider key={hp?.bridgeUserUuid ?? "none"}><div>
      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-ardoise-100 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-1.5 pb-2.5 text-sm font-medium border-b-2 transition-all ${
              tab === t.key ? "border-brand-600 text-brand-600" : "border-transparent text-ardoise-400 hover:text-ardoise-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "activity" && <ActivityTab />}

      {tab === "contributions" && <ContributionsTab />}

      {tab === "taxes" && <TaxesTab />}

      {tab === "summary" && <SummaryTab />}

      {tab === "remainder" && <RemainderTab />}

      {tab === "simulation" && <SimulationTab />}
    </div></ManagementDataProvider>
  );
}

// ── Activity Tab ──

function ActivityTab() {
  const hp = usePractitioner();
  const { loadYearCore } = useManagementData();
  const bankConnected = !!hp?.bridgeUserUuid;
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({ encaissement: 0, decaissement: 0, cotisations: 0, remuneration: 0 });
  const [effectiveCA, setEffectiveCA] = useState<EffectiveCA>({ ca: 0, source: "none" });
  type MonthData = { name: string; revenus: number; cotisations: number; autresDepenses: number; urssaf: number; carpimko: number; chargesPro: number; retrocession: number; madelin: number; impots: number; remuneration: number };
  const [chartData, setChartData] = useState<MonthData[]>([]);
  const [vacations, setVacations] = useState<number[]>(Array(12).fill(0));
  const [depensesOpen, setDepensesOpen] = useState(false);
  const [remOpen, setRemOpen] = useState(false);
  // `isEstimated` = on est en mode fallback bordereaux : CA réel issu des passages
  // mais URSSAF/CARPIMKO/PAS estimés via getCotisationsEstimate. Sert à afficher
  // les badges "estim." et le bandeau d'incitation à connecter la banque.
  const [isEstimated, setIsEstimated] = useState(false);

  const fetchData = useCallback(async (y: number) => {
    setLoading(true);
    const [vacationsResult, core] = await Promise.all([
      getVacationsAction(y),
      loadYearCore(y),
    ]);
    const { effectiveCA: effectiveCAResult, months, totalCA, isEstimated: useFallback } = core;

    const toChartData = (ms: MonthlyActivityMonth[]) =>
      ms.map((m) => ({
        name: MONTH_LABELS[m.month - 1]!,
        revenus: m.income,
        cotisations: m.cotisations,
        autresDepenses: m.autresDepenses,
        urssaf: m.urssaf,
        carpimko: m.carpimko,
        chargesPro: m.chargesPro,
        retrocession: m.retrocession,
        madelin: m.madelin,
        impots: m.impots,
        remuneration: m.remuneration,
      }));

    // Fallback dès que le CA effectif provient des bordereaux : CA mensuel dérivé
    // des passages, et on n'estime *rien d'autre* — dépenses, cotisations sociales
    // et provision d'impôt restent à 0 (affichées "—"). Le forfaitaire
    // URSSAF/CARPIMKO début d'activité produisait des montants disproportionnés
    // par rapport au CA réel des bordereaux, donc on les masque ici. Les autres
    // tabs (Cotisations, Impôts, Synthèse) gardent l'estimation car elle a du sens
    // en projection annuelle complète.
    if (useFallback) {
      setKpis({ encaissement: totalCA, decaissement: 0, cotisations: 0, remuneration: 0 });
      setEffectiveCA(effectiveCAResult);
      setChartData(toChartData(months));
      setVacations(vacationsResult);
      setIsEstimated(true);
      setLoading(false);
      return;
    }

    // Flux normal : transactions bancaires. Les KPIs encaissement/décaissement
    // proviennent d'une agrégation dédiée (distincte de l'activité mensuelle).
    const kpiResult = await getTransactionKpisAction(null, y);
    setKpis({ encaissement: kpiResult.encaissement, decaissement: kpiResult.decaissement, cotisations: kpiResult.cotisations ?? 0, remuneration: kpiResult.remuneration ?? 0 });
    setEffectiveCA(effectiveCAResult);
    setChartData(toChartData(months));
    setVacations(vacationsResult);
    setIsEstimated(false);
    setLoading(false);
  }, [loadYearCore]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    fetchData(year);
  }, [year, fetchData]);

  const daysPerWeek = hp?.daysPerWeekWorked ?? 5;
  const chartRef = useRef<HTMLDivElement>(null);

  // Tableau des en-têtes et lignes pour l'export du détail mensuel.
  const exportData = useMemo(() => {
    const headers = ["Mois", "CA encaissé", "Total dépenses", "URSSAF", "CARPIMKO", "Charges pro", "Rétrocession", "Madelin", "Impôts versés", "Rémunération versée", "Rém. avant impôt", "Vacances (jours)"];
    const rows = chartData.map((m, i) => {
      const totalDepenses = m.cotisations + m.autresDepenses;
      const remAvantImpot = m.revenus - m.urssaf - m.carpimko - m.chargesPro - m.retrocession - m.madelin;
      return [
        m.name,
        Math.round(m.revenus),
        Math.round(totalDepenses),
        Math.round(m.urssaf),
        Math.round(m.carpimko),
        Math.round(m.chargesPro),
        Math.round(m.retrocession),
        Math.round(m.madelin),
        Math.round(m.impots),
        Math.round(m.remuneration),
        Math.round(remAvantImpot),
        vacations[i] ?? 0,
      ];
    });
    return { headers, rows };
  }, [chartData, vacations]);

  const handleExportCsv = useCallback(() => {
    downloadCSV(`activite_${year}`, exportData.headers, exportData.rows);
  }, [exportData, year]);

  const handleExportPdf = useCallback(async () => {
    const totalCA = chartData.reduce((s, m) => s + m.revenus, 0);
    const totalDepenses = chartData.reduce((s, m) => s + m.cotisations + m.autresDepenses, 0);
    const totalRem = chartData.reduce((s, m) => s + (m.revenus - m.urssaf - m.carpimko - m.chargesPro - m.retrocession - m.madelin), 0);
    // Formate les colonnes monétaires en € pour le PDF (le CSV garde des nombres bruts).
    const rowsForPdf = exportData.rows.map((r) =>
      r.map((cell, i) => (i > 0 && i < r.length - 1 && typeof cell === "number" ? formatCurrency(cell) : cell)),
    );
    const chartImage = (await getChartImage(chartRef.current)) ?? undefined;
    downloadPDF(`activite_${year}`, `Mon activité ${year}`, exportData.headers, rowsForPdf, {
      subtitle: `Détail mensuel ${year}`,
      chartImage,
      summary: [
        { label: "Chiffre d'affaires", value: formatCurrency(Math.round(totalCA)) },
        { label: "Dépenses", value: formatCurrency(Math.round(totalDepenses)) },
        { label: "Rém. avant impôt", value: formatCurrency(Math.round(totalRem)) },
      ],
      footnote: isEstimated
        ? "Chiffre d'affaires issu de vos bordereaux. Connectez votre banque pour voir vos dépenses, cotisations et rémunération."
        : undefined,
    });
  }, [exportData, chartData, year, isEstimated]);

  // Daily rate computed from past months with CA > 0, neutralized of saved vacation days.
  // Used to simulate CA for current/future months in the selected year.
  const dailyRate = useMemo(() => {
    if (!chartData.length) return 0;
    const now = new Date();
    const isPastYear = year < now.getFullYear();
    const currentMonthIdx = now.getMonth();
    let totalCA = 0;
    let totalDays = 0;
    chartData.forEach((m, i) => {
      const isPast = isPastYear || (year === now.getFullYear() && i < currentMonthIdx);
      if (!isPast || m.revenus <= 0) return;
      const wd = countWorkingDays(year, i + 1, daysPerWeek);
      const worked = Math.max(0, wd - (vacations[i] || 0));
      if (worked > 0) {
        totalCA += m.revenus;
        totalDays += worked;
      }
    });
    return totalDays > 0 ? totalCA / totalDays : 0;
  }, [chartData, vacations, year, daysPerWeek]);

  // CA mensuel projeté (mois passé = réel ; mois courant = réel + projection sur
  // les jours restants ; mois futur = dailyRate × jours travaillables). Sert à
  // afficher la ligne "Rém. avant impôt" en miroir du CA en mode fallback —
  // les charges étant inconnues, rem = CA, projeté comme le CA.
  const projectedCAByMonth = useMemo<number[]>(() => {
    if (!chartData.length) return [];
    const now = new Date();
    const isPastYear = year < now.getFullYear();
    const isFutureYear = year > now.getFullYear();
    const currentMonthIdx = now.getMonth();
    return chartData.map((m, i) => {
      const isPastMonth = isPastYear || (year === now.getFullYear() && i < currentMonthIdx);
      const isCurrentMonth = year === now.getFullYear() && i === currentMonthIdx;
      const isFutureMonth = isFutureYear || (year === now.getFullYear() && i > currentMonthIdx);
      if (isPastMonth) return Math.round(m.revenus);
      if (dailyRate <= 0) return Math.round(m.revenus);
      if (isFutureMonth) {
        const wd = countWorkingDays(year, i + 1, daysPerWeek);
        const worked = Math.max(0, wd - (vacations[i] || 0));
        return Math.round(dailyRate * worked);
      }
      if (isCurrentMonth) {
        const totalWd = countWorkingDays(year, i + 1, daysPerWeek);
        const remainingWd = countRemainingWorkingDays(year, i + 1, now.getDate() + 1, daysPerWeek);
        const ratioRemaining = totalWd > 0 ? remainingWd / totalWd : 0;
        const remainingVac = (vacations[i] || 0) * ratioRemaining;
        const workedRemaining = Math.max(0, remainingWd - remainingVac);
        return Math.round(m.revenus) + Math.round(dailyRate * workedRemaining);
      }
      return 0;
    });
  }, [chartData, dailyRate, year, daysPerWeek, vacations]);

  const projectedAnnualCA = useMemo(
    () => projectedCAByMonth.reduce((s, v) => s + v, 0),
    [projectedCAByMonth],
  );

  return (
    <div className="space-y-6">
      {/* Sélecteur d'année global du tab (au-dessus, comme dans "Mes cotisations sociales") */}
      <div className="flex items-center justify-end gap-2">
        <ExportButtons
          onCsv={handleExportCsv}
          onPdf={handleExportPdf}
          disabled={loading || chartData.length === 0}
        />
        <YearSelector year={year} setYear={setYear} maxYear={currentYear} />
      </div>

      {/* Chart + monthly breakdown (aligned) */}
      <div className="relative bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 overflow-hidden">
        {/* Overlay uniquement si pas de banque ET pas de bordereaux exploitables.
            Pendant le chargement initial on l'inhibe pour éviter un flash : les
            skeletons en dessous suffisent à indiquer l'attente. */}
        <DataMissingOverlay bankConnected={bankConnected || isEstimated || loading} />
        {isEstimated && (
          <div className="px-4 py-1.5 text-[11px] text-ardoise-400 border-b border-ardoise-100/80 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <span>
              CA issu de vos bordereaux.{" "}
              <Link href="/transactions" className="underline decoration-ardoise-300 underline-offset-2 hover:text-ardoise-600">
                Connecter ma banque
              </Link>{" "}
              pour voir vos dépenses et votre rémunération.
            </span>
          </div>
        )}
        <div className="pb-2 flex">
          {/* KPI cards stacked vertically */}
          <div style={{ width: 260 }} className="flex flex-col items-center px-2 py-1 shrink-0">
            <div className="w-[80%] mx-3 my-2 bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[10px] p-2.5">
              <div className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-menthe-600 shrink-0">
                  <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.3" />
                  <path d="M12 16V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
                  <path d="M8 12l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                </svg>
                <p className="text-[11px] font-mono uppercase tracking-wide text-ardoise-500 truncate inline-flex items-center gap-1.5">
                  Chiffre d&apos;affaires
                  <CASourceIndicator source={effectiveCA.source} primary="transactions" />
                </p>
              </div>
              {loading ? (
                <div className="h-5 bg-ardoise-200 rounded w-20 animate-pulse mt-1" />
              ) : (
                <p className="text-lg font-bold text-ardoise-900 mt-0.5 font-mono">{formatCurrency(effectiveCA.ca)}</p>
              )}
            </div>

            <div className="w-[80%] mx-3 my-2 bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[10px] p-2.5">
              <div>
                <div className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-red-500 shrink-0">
                    <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.3" />
                    <path d="M12 8v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
                    <path d="M16 12l-4 4-4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                  </svg>
                  <p className="text-[11px] font-mono uppercase tracking-wide text-ardoise-500 truncate">Dépenses</p>
                </div>
                {loading ? (
                  <div className="h-5 bg-ardoise-200 rounded w-20 animate-pulse mt-1" />
                ) : (
                  <p className="text-lg font-bold text-ardoise-900 mt-0.5 font-mono">
                    {isEstimated ? "—" : formatCurrency(kpis.decaissement)}
                  </p>
                )}
              </div>
              <div className="border-t border-ardoise-100 my-2" />
              <div>
                <div className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-orange-500 shrink-0">
                    <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.3" />
                    <path d="M12 8v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
                    <path d="M16 12l-4 4-4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                  </svg>
                  <p className="text-[11px] font-mono uppercase tracking-wide text-ardoise-500 truncate">Dont cotisations sociales</p>
                </div>
                {loading ? (
                  <div className="h-5 bg-ardoise-200 rounded w-20 animate-pulse mt-1" />
                ) : (
                  <p className="text-lg font-bold text-ardoise-900 mt-0.5 font-mono">
                    {isEstimated ? "—" : formatCurrency(kpis.cotisations)}
                  </p>
                )}
              </div>
            </div>

            <div className="w-[80%] mx-3 my-2 bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[10px] p-2.5">
              <div className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-brand-600 shrink-0">
                  <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3" />
                  <path d="M12 7v4l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                  <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.5" />
                </svg>
                <p className="text-[11px] font-mono uppercase tracking-wide text-ardoise-500 truncate inline-flex items-center gap-1.5">
                  Rém. avant impôt
                  {isEstimated && <EstimationBadge tooltip="En l'absence de données bancaires, la rémunération avant impôt est affichée en miroir du CA (charges inconnues)." />}
                </p>
              </div>
              {loading ? (
                <div className="h-5 bg-ardoise-200 rounded w-20 animate-pulse mt-1" />
              ) : isEstimated ? (
                <p className="text-lg font-bold text-ardoise-400 italic mt-0.5 font-mono">
                  {projectedAnnualCA > 0 ? `~${formatCurrency(projectedAnnualCA)}` : "—"}
                </p>
              ) : (
                <p className="text-lg font-bold text-ardoise-900 mt-0.5 font-mono">
                  {formatCurrency(
                    chartData.reduce((s, m) => s + m.revenus - m.urssaf - m.carpimko - m.chargesPro - m.retrocession - m.madelin, 0)
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0" ref={chartRef}>
            {loading ? (
              <div className="h-60 bg-ardoise-100 rounded animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} barGap={2} barCategoryGap="20%" margin={{ left: 0, right: 0, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#A79EB5" }} tickLine={false} axisLine={false} hide />
                  <YAxis tick={{ fontSize: 11, fill: "#A79EB5" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={0} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E1DBEC", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                    formatter={(value, name) => {
                      const labels: Record<string, string> = {
                        revenus: isEstimated ? "Revenus (bordereaux)" : "Revenus",
                        cotisations: "Cotisations sociales",
                        autresDepenses: "Autres dépenses",
                      };
                      const num = typeof value === "number" ? value : Number(value ?? 0);
                      const key = String(name ?? "");
                      return [formatCurrency(num), labels[key] ?? key];
                    }}
                    labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    formatter={(value: string) => {
                      const labels: Record<string, string> = {
                        revenus: isEstimated ? "Revenus (bordereaux)" : "Revenus",
                        cotisations: "Cotisations sociales",
                        autresDepenses: "Autres dépenses",
                      };
                      return labels[value] ?? value;
                    }}
                  />
                  <Bar dataKey="revenus" fill="#3DB87A" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="autresDepenses" stackId="depenses" fill="#ef4444" />
                  <Bar dataKey="cotisations" stackId="depenses" fill="#f97316" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {!loading && (
          <div className="border-t border-ardoise-100 text-xs overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Header */}
              <div className="grid border-b border-ardoise-100" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                <div className="px-3 py-3.5" />
                {chartData.map((m) => (
                  <div key={m.name} className="py-3.5 text-center font-semibold text-ardoise-500">{m.name}</div>
                ))}
              </div>
              {/* CA */}
              <div className="grid border-b border-ardoise-50" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                <div className="px-3 py-3.5 text-sm font-semibold text-ardoise-700">Chiffre d&apos;affaires</div>
                {chartData.map((m, i) => {
                  const now = new Date();
                  const isPastYear = year < now.getFullYear();
                  const isFutureYear = year > now.getFullYear();
                  const isCurrentMonth = year === now.getFullYear() && i === now.getMonth();
                  const isPastMonth = isPastYear || (year === now.getFullYear() && i < now.getMonth());
                  const isFutureMonth = isFutureYear || (year === now.getFullYear() && i > now.getMonth());

                  // Past months: real CA from bank_transactions, intact.
                  if (isPastMonth) {
                    return (
                      <div key={m.name} className="py-3.5 text-center font-medium text-ardoise-700 font-mono">
                        {m.revenus > 0 ? formatCurrency(m.revenus) : "—"}
                      </div>
                    );
                  }

                  // No daily rate yet → no simulation possible.
                  if (dailyRate <= 0) {
                    return (
                      <div key={m.name} className="py-3.5 text-center font-medium text-ardoise-700 font-mono">
                        {m.revenus > 0 ? formatCurrency(m.revenus) : "—"}
                      </div>
                    );
                  }

                  // Future month: simulated CA = daily_rate × (working_days − vacances).
                  if (isFutureMonth) {
                    const wd = countWorkingDays(year, i + 1, daysPerWeek);
                    const worked = Math.max(0, wd - (vacations[i] || 0));
                    const simulated = Math.round(dailyRate * worked);
                    return (
                      <div key={m.name} className="py-3.5 text-center font-medium text-ardoise-400 italic font-mono">
                        {simulated > 0 ? `~${formatCurrency(simulated)}` : formatCurrency(0)}
                      </div>
                    );
                  }

                  // Current month: real to date + projection on remaining working days,
                  // minus a pro-rata share of saved vacations (uniform distribution assumption).
                  if (isCurrentMonth) {
                    const totalWd = countWorkingDays(year, i + 1, daysPerWeek);
                    const remainingWd = countRemainingWorkingDays(year, i + 1, now.getDate() + 1, daysPerWeek);
                    const ratioRemaining = totalWd > 0 ? remainingWd / totalWd : 0;
                    const remainingVac = (vacations[i] || 0) * ratioRemaining;
                    const workedRemaining = Math.max(0, remainingWd - remainingVac);
                    const projection = Math.round(dailyRate * workedRemaining);
                    const total = Math.round(m.revenus) + projection;
                    return (
                      <div key={m.name} className="py-3.5 text-center font-medium text-ardoise-700 font-mono">
                        {total > 0 ? <>~{formatCurrency(total)}</> : formatCurrency(0)}
                      </div>
                    );
                  }

                  return <div key={m.name} className="py-3.5 text-center font-medium text-ardoise-300">—</div>;
                })}
              </div>
              {/* Dépenses */}
              <div
                className="grid border-b border-ardoise-50 cursor-pointer hover:bg-ardoise-50/50 transition-colors"
                style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}
                onClick={() => setDepensesOpen((v) => !v)}
              >
                <div className="px-3 py-3.5 text-sm font-semibold text-ardoise-700 flex items-center gap-1.5">
                  Dépenses
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`text-ardoise-400 transition-transform ${depensesOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
                </div>
                {chartData.map((m) => {
                  const dep = m.cotisations + m.autresDepenses;
                  return (
                    <div key={m.name} className="py-3.5 text-center font-medium text-ardoise-700 font-mono">
                      {dep > 0 ? formatCurrency(dep) : "—"}
                    </div>
                  );
                })}
              </div>
              {/* Sub-rows dépenses */}
              {depensesOpen && (
                <>
                  {([
                    { key: "urssaf", label: "URSSAF" },
                    { key: "carpimko", label: "CARPIMKO" },
                    { key: "chargesPro", label: "Charges pro" },
                    { key: "retrocession", label: "Rétrocession" },
                    { key: "madelin", label: "Madelin" },
                  ] as const).map((sub) => (
                    <div key={sub.key} className="grid border-b border-ardoise-50 bg-ardoise-50/30" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                      <div className="pl-7 pr-3 py-2.5 text-xs font-medium text-ardoise-500">{sub.label}</div>
                      {chartData.map((m) => {
                        const val = m[sub.key];
                        return (
                          <div key={m.name} className="py-2.5 text-center text-xs font-medium text-ardoise-500 font-mono">
                            {val > 0 ? formatCurrency(val) : "—"}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
              {/* Rém. avant impôt */}
              <div
                className="grid border-b border-ardoise-50 cursor-pointer hover:bg-ardoise-50/50 transition-colors"
                style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}
                onClick={() => setRemOpen((v) => !v)}
              >
                <div className="px-3 py-3.5 text-sm font-semibold text-ardoise-700 flex items-center gap-1.5">
                  Rém. avant impôt
                  {isEstimated && <EstimationBadge tooltip="En l'absence de données bancaires, la rémunération avant impôt est affichée en miroir du CA (charges inconnues). Connectez votre banque pour les charges réelles." />}
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`text-ardoise-400 transition-transform ${remOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
                </div>
                {chartData.map((m, i) => {
                  // Fallback : rem = CA projeté (mêmes valeurs que la ligne CA),
                  // affichées en italique gris + ~ pour signaler l'estimation.
                  if (isEstimated) {
                    const projected = projectedCAByMonth[i] ?? 0;
                    return (
                      <div key={m.name} className="py-3.5 text-center font-medium text-ardoise-400 italic font-mono">
                        {projected > 0 ? `~${formatCurrency(projected)}` : "—"}
                      </div>
                    );
                  }
                  const charges = m.urssaf + m.carpimko + m.chargesPro + m.retrocession + m.madelin;
                  const res = m.revenus - charges;
                  const empty = m.revenus === 0 && charges === 0;
                  return (
                    <div key={m.name} className={`py-3.5 text-center font-medium font-mono ${empty ? "text-ardoise-300" : res >= 0 ? "text-ardoise-900" : "text-red-500"}`}>
                      {empty ? "—" : formatCurrency(res)}
                    </div>
                  );
                })}
              </div>
              {/* Sub-rows rém. avant impôt */}
              {remOpen && (
                <>
                  <div className="grid border-b border-ardoise-50 bg-ardoise-50/30" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                    <div className="pl-7 pr-3 py-2.5 text-xs font-medium text-ardoise-500">Rémunération versée</div>
                    {chartData.map((m) => (
                      <div key={m.name} className="py-2.5 text-center text-xs font-medium text-ardoise-500 font-mono">
                        {m.remuneration > 0 ? formatCurrency(m.remuneration) : "—"}
                      </div>
                    ))}
                  </div>
                  <div className="grid border-b border-ardoise-50 bg-ardoise-50/30" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                    <div className="pl-7 pr-3 py-2.5 text-xs font-medium text-ardoise-500">Provision d&apos;impôt estimée</div>
                    {chartData.map((m, i) => {
                      const isFuture = year > currentYear || (year === currentYear && i >= currentMonth);
                      // En fallback bordereaux : on n'estime rien dans Mon activité,
                      // les charges déductibles ne sont pas connues → tiret partout.
                      if (isEstimated) {
                        return <div key={m.name} className="py-2.5 text-center text-xs font-medium text-ardoise-300">—</div>;
                      }
                      // Past months: show real tax transactions
                      if (!isFuture) {
                        return (
                          <div key={m.name} className="py-2.5 text-center text-xs font-medium text-ardoise-500 font-mono">
                            {m.impots > 0 ? formatCurrency(m.impots) : "—"}
                          </div>
                        );
                      }
                      // Current/future months: estimate = rém. avant impôt × taux PAS
                      const pasRate = hp ? parseFloat(hp.pasRate) / 100 : 0;
                      const charges = m.urssaf + m.carpimko + m.chargesPro + m.retrocession + m.madelin;
                      const remAvantImpot = m.revenus - charges;
                      const estimated = remAvantImpot > 0 ? Math.round(remAvantImpot * pasRate) : 0;
                      return (
                        <div key={m.name} className="py-2.5 text-center text-xs font-medium text-ardoise-400 italic font-mono">
                          {estimated > 0 ? `~${formatCurrency(estimated)}` : "—"}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {/* Vacances */}
              <div className="grid" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                <div className="px-3 py-3.5 text-sm font-semibold text-ardoise-700">Vacances (jours)</div>
                {chartData.map((m, i) => {
                  const now = new Date();
                  const isPastMonth = year < now.getFullYear() || (year === now.getFullYear() && i < now.getMonth());
                  const daysInMonth = new Date(year, i + 1, 0).getDate();
                  return (
                    <div key={m.name} className="py-2.5 flex items-center justify-center">
                      <input
                        type="number"
                        min="0"
                        max={daysInMonth}
                        value={vacations[i] || 0}
                        disabled={isPastMonth}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(daysInMonth, parseInt(e.target.value) || 0));
                          setVacations((prev) => { const next = [...prev]; next[i] = v; return next; });
                        }}
                        onBlur={(e) => {
                          const v = Math.max(0, Math.min(daysInMonth, parseInt(e.target.value) || 0));
                          void upsertVacationDayAction(year, i + 1, v);
                        }}
                        className="w-10 text-center text-xs font-medium text-ardoise-700 border border-ardoise-200 rounded hover:border-ardoise-300 focus:border-brand-500 focus:outline-none bg-transparent transition-colors py-1 disabled:bg-ardoise-50 disabled:text-ardoise-300 disabled:cursor-not-allowed disabled:hover:border-ardoise-200 font-mono"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Contributions Tab ──

function ContributionsTab() {
  const hp = usePractitioner();
  const { loadYearCore, loadEstimate } = useManagementData();
  const bankConnected = !!hp?.bridgeUserUuid;
  const [estimate, setEstimate] = useState<CotisationsEstimate | null>(null);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState<{ urssaf: number; carpimko: number }[]>(Array(12).fill({ urssaf: 0, carpimko: 0 }));
  // Fallback bordereaux activé quand pas de banque connectée mais des
  // bordereaux exploitables. Tous les montants affichés deviennent estimés.
  const [isEstimated, setIsEstimated] = useState(false);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  // Build calendar to know which months have payments
  const prefs: PaymentPreferences = useMemo(() => {
    if (!hp) return DEFAULT_PREFERENCES;
    return {
      urssafFrequency: hp.urssafFrequency,
      urssafPayDay: hp.urssafPayDay,
      pasFrequency: hp.pasFrequency,
      carpimkoFrequency: hp.carpimkoFrequency,
      carpimkoPayDay: hp.carpimkoPayDay,
      activityStartDate: hp.activityStartDate,
    };
  }, [hp]);

  const calendar = useMemo(() => buildCalendar(prefs), [prefs]);

  // Load monthly data + estimate.
  // Source primaire = bank_transactions (cohérent avec Mon activité). Si le
  // praticien n'a pas connecté sa banque mais a des bordereaux, on bascule sur
  // un fallback : monthly data depuis les passages (urssaf/carpimko réels = 0)
  // et estimation forcée pour l'année courante.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setTableLoading(true);
    setCardsLoading(true);
    setEstimate(null);
    (async () => {
      const core = await loadYearCore(year);
      setIsEstimated(core.isEstimated);
      setMonthlyData(core.months.map((m) => ({ urssaf: m.urssaf, carpimko: m.carpimko })));
      setTableLoading(false);

      // Estimation calée sur l'année sélectionnée : getCotisationsEstimate
      // utilise le paramètre `year` pour PASS, annualisation, début d'activité
      // et N-2 — fonctionne donc aussi sur les années passées (où le CA passé est
      // déjà la valeur annuelle complète, pas d'extrapolation).
      const est = await loadEstimate(year);
      if (est) setEstimate(est);
      setCardsLoading(false);
    })().catch(() => { setTableLoading(false); setCardsLoading(false); });
  }, [year, loadYearCore, loadEstimate, bankConnected]);

  // Totals réels (déjà versés) pour l'année sélectionnée
  const { totalUrssafReel, totalCarpimkoReel } = useMemo(() => {
    const u = monthlyData.reduce((s, m) => s + m.urssaf, 0);
    const c = monthlyData.reduce((s, m) => s + m.carpimko, 0);
    return { totalUrssafReel: u, totalCarpimkoReel: c };
  }, [monthlyData]);

  const isPastYear = year < currentYear;
  // En fallback bordereaux, aucun "réel" n'est observable même sur années passées.
  const showReel = isPastYear && !isEstimated;

  // Estimated amounts per month based on calendar events
  const estimatedMonths = useMemo(() => {
    if (!estimate) return Array(12).fill({ urssaf: 0, carpimko: 0 });
    return Array.from({ length: 12 }, (_, i) => {
      const events = calendar[i] || [];
      const hasUrssaf = events.some((e) => e.type === "urssaf");
      const hasCarpimko = events.some((e) => e.type === "carpimko");
      return {
        urssaf: hasUrssaf ? estimate.urssafParEcheance : 0,
        carpimko: hasCarpimko ? estimate.carpimkoParEcheance : 0,
      };
    });
  }, [estimate, calendar]);

  const handleExportCotisationsCsv = useCallback(() => {
    const headers = ["Mois", "URSSAF", "CARPIMKO", "Total", "Type"];
    const rows = MONTH_LABELS.map((m, i) => {
      const reelUrssaf = monthlyData[i]?.urssaf ?? 0;
      const reelCarpimko = monthlyData[i]?.carpimko ?? 0;
      const canEstimate = isEstimated || year > currentYear || (year === currentYear && i >= new Date().getMonth());
      const estUrssaf = canEstimate ? (estimatedMonths[i]?.urssaf ?? 0) : 0;
      const estCarpimko = canEstimate ? (estimatedMonths[i]?.carpimko ?? 0) : 0;
      const urssaf = reelUrssaf > 0 ? reelUrssaf : estUrssaf;
      const carpimko = reelCarpimko > 0 ? reelCarpimko : estCarpimko;
      const isReel = reelUrssaf > 0 || reelCarpimko > 0;
      return [m, Math.round(urssaf), Math.round(carpimko), Math.round(urssaf + carpimko), isReel ? "Réel" : (urssaf + carpimko > 0 ? "Estimé" : "—")];
    });
    downloadCSV(`cotisations_${year}`, headers, rows);
  }, [monthlyData, estimatedMonths, year, currentYear, isEstimated]);

  const handleExportCotisationsPdf = useCallback(() => {
    const headers = ["Mois", "URSSAF", "CARPIMKO", "Total", "Type"];
    const rows = MONTH_LABELS.map((m, i) => {
      const reelUrssaf = monthlyData[i]?.urssaf ?? 0;
      const reelCarpimko = monthlyData[i]?.carpimko ?? 0;
      const canEstimate = isEstimated || year > currentYear || (year === currentYear && i >= new Date().getMonth());
      const estUrssaf = canEstimate ? (estimatedMonths[i]?.urssaf ?? 0) : 0;
      const estCarpimko = canEstimate ? (estimatedMonths[i]?.carpimko ?? 0) : 0;
      const urssaf = reelUrssaf > 0 ? reelUrssaf : estUrssaf;
      const carpimko = reelCarpimko > 0 ? reelCarpimko : estCarpimko;
      const isReel = reelUrssaf > 0 || reelCarpimko > 0;
      return [
        m,
        urssaf > 0 ? formatCurrency(Math.round(urssaf)) : "—",
        carpimko > 0 ? formatCurrency(Math.round(carpimko)) : "—",
        urssaf + carpimko > 0 ? formatCurrency(Math.round(urssaf + carpimko)) : "—",
        isReel ? "Réel" : (urssaf + carpimko > 0 ? "Estimé" : "—"),
      ];
    });
    const totalUrssaf = showReel ? totalUrssafReel : (estimate?.urssafAnnuel ?? 0);
    const totalCarpimko = showReel ? totalCarpimkoReel : (estimate?.carpimkoAnnuel ?? 0);
    downloadPDF(`cotisations_${year}`, `Mes cotisations sociales ${year}`, headers, rows, {
      subtitle: showReel ? `Cotisations versées en ${year}` : `Estimation des cotisations ${year}`,
      summary: [
        { label: "URSSAF", value: `${showReel ? "" : "~"}${formatCurrency(Math.round(totalUrssaf))}` },
        { label: "CARPIMKO", value: `${showReel ? "" : "~"}${formatCurrency(Math.round(totalCarpimko))}` },
        { label: "Total", value: `${showReel ? "" : "~"}${formatCurrency(Math.round(totalUrssaf + totalCarpimko))}` },
      ],
      footnote: isEstimated
        ? "Cotisations URSSAF et CARPIMKO estimées à partir du chiffre d'affaires issu de vos bordereaux. Connectez votre banque pour obtenir les montants réellement prélevés."
        : undefined,
    });
  }, [monthlyData, estimatedMonths, year, currentYear, showReel, totalUrssafReel, totalCarpimkoReel, estimate, isEstimated]);

  return (
    <div className="space-y-6">
      {/* Sélecteur d'année global du tab — pilote les cartes, le détail mensuel et l'historique */}
      <div className="flex items-center justify-end gap-2">
        <ExportButtons
          onCsv={handleExportCotisationsCsv}
          onPdf={handleExportCotisationsPdf}
          disabled={tableLoading || cardsLoading}
        />
        <YearSelector year={year} setYear={setYear} maxYear={currentYear} />
      </div>
      {isEstimated && (
        <div className="px-4 py-1.5 text-[11px] text-ardoise-400 flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <span>
            Cotisations estimées à partir de vos bordereaux.{" "}
            <Link href="/transactions" className="underline decoration-ardoise-300 underline-offset-2 hover:text-ardoise-600">
              Connecter ma banque
            </Link>{" "}
            pour les montants réels.
          </span>
        </div>
      )}
      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* URSSAF */}
        <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-6">
          <div className="flex items-center gap-4 mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-urssaf.svg" alt="URSSAF" className="h-8" />
            {isEstimated && <EstimationBadge tooltip="Cotisations URSSAF estimées à partir du CA issu de vos bordereaux. Connectez votre banque pour les montants réellement prélevés." />}
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs text-ardoise-400">
              {showReel ? `Cotisations versées en ${year}` : `Montant total estimé des cotisations ${year}`}
            </p>
            <InfoTooltip text={showReel
              ? `Somme des prélèvements Urssaf effectivement débités sur vos comptes en ${year}.`
              : `Montant total estimé de vos cotisations Urssaf à payer en ${year}, réduit du remboursement estimé (régularisation négative) au titre de ${year - 1}.`}
            />
          </div>
          {(showReel ? tableLoading : cardsLoading) ? (
            <div className="h-8 bg-ardoise-200 rounded w-28 animate-pulse mb-4" />
          ) : (
            <p className="text-2xl font-bold text-ardoise-900 mb-4 font-mono">
              {showReel
                ? (totalUrssafReel > 0 ? formatCurrency(totalUrssafReel) : "—")
                : (estimate ? `~${formatCurrency(estimate.urssafAnnuel)}` : "—")}
            </p>
          )}
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs text-ardoise-400">{showReel ? "Nombre de prélèvements" : "Montant par échéance"}</p>
            <InfoTooltip text={showReel
              ? `Nombre de prélèvements Urssaf passés sur vos comptes en ${year}.`
              : `Estimation du montant prélevé à chaque échéance Urssaf en ${year}.`}
            />
          </div>
          {(showReel ? tableLoading : cardsLoading) ? (
            <div className="h-8 bg-ardoise-200 rounded w-28 animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-ardoise-900">
              {showReel
                ? (monthlyData.filter((m) => m.urssaf > 0).length > 0
                    ? `${monthlyData.filter((m) => m.urssaf > 0).length} prélèvements`
                    : "—")
                : (estimate ? `~${formatCurrency(estimate.urssafParEcheance)}` : "—")}
            </p>
          )}
        </div>

        {/* CARPIMKO */}
        <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-6">
          <div className="flex items-center gap-4 mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-carpimko.png" alt="CARPIMKO" className="h-8" />
            {isEstimated && <EstimationBadge tooltip="Cotisations CARPIMKO estimées à partir du CA issu de vos bordereaux. Connectez votre banque pour les montants réellement prélevés." />}
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs text-ardoise-400">
              {showReel ? `Cotisations versées en ${year}` : `Montant total estimé des cotisations ${year}`}
            </p>
            <InfoTooltip text={showReel
              ? `Somme des prélèvements Carpimko effectivement débités sur vos comptes en ${year}.`
              : `Montant total estimé de vos cotisations Carpimko à payer en ${year}, intégrant la régularisation estimée au titre de ${year - 1}.`}
            />
          </div>
          {(showReel ? tableLoading : cardsLoading) ? (
            <div className="h-8 bg-ardoise-200 rounded w-28 animate-pulse mb-4" />
          ) : (
            <p className="text-2xl font-bold text-ardoise-900 mb-4 font-mono">
              {showReel
                ? (totalCarpimkoReel > 0 ? formatCurrency(totalCarpimkoReel) : "—")
                : (estimate ? `~${formatCurrency(estimate.carpimkoAnnuel)}` : "—")}
            </p>
          )}
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs text-ardoise-400">{showReel ? "Nombre de prélèvements" : "Montant par échéance"}</p>
            <InfoTooltip text={showReel
              ? `Nombre de prélèvements Carpimko passés sur vos comptes en ${year}.`
              : `Estimation du montant prélevé à chaque échéance Carpimko en ${year}.`}
            />
          </div>
          {(showReel ? tableLoading : cardsLoading) ? (
            <div className="h-8 bg-ardoise-200 rounded w-28 animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-ardoise-900">
              {showReel
                ? (monthlyData.filter((m) => m.carpimko > 0).length > 0
                    ? `${monthlyData.filter((m) => m.carpimko > 0).length} prélèvements`
                    : "—")
                : (estimate ? `~${formatCurrency(estimate.carpimkoParEcheance)}` : "—")}
            </p>
          )}
        </div>
      </div>

      {/* Monthly table */}
      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-base font-bold text-ardoise-900">Détail mensuel</h2>
        </div>
        {tableLoading ? (
          <div className="px-5 pb-5">
            <div className="h-32 bg-ardoise-100 rounded animate-pulse" />
          </div>
        ) : (
          <div className="border-t border-ardoise-100 text-xs overflow-x-auto">
            <div className="min-w-[900px]">
            {/* Header */}
            <div className="grid border-b border-ardoise-100" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
              <div className="px-3 py-3.5" />
              {MONTH_LABELS.map((m) => (
                <div key={m} className="py-3.5 text-center font-semibold text-ardoise-500">{m}</div>
              ))}
            </div>
            {/* URSSAF */}
            <div className="grid border-b border-ardoise-50" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
              <div className="px-3 py-3.5 flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-urssaf.svg" alt="URSSAF" className="h-5" />
                {isEstimated && <EstimationBadge />}
              </div>
              {monthlyData.map((m, i) => {
                const reel = m.urssaf;
                // En fallback bordereaux : aucun réel n'existe sur les mois écoulés,
                // donc on autorise l'estimation pour tous les mois de l'année.
                const canEstimate = isEstimated || year > currentYear || (year === currentYear && i >= new Date().getMonth());
                const est = canEstimate ? (estimatedMonths[i]?.urssaf ?? 0) : 0;
                if (reel > 0) {
                  return <div key={i} className="py-3.5 text-center font-medium text-ardoise-700 font-mono">{formatCurrency(reel)}</div>;
                }
                if (est > 0) {
                  return <div key={i} className="py-3.5 text-center font-medium text-ardoise-400 italic font-mono">~{formatCurrency(est)}</div>;
                }
                return <div key={i} className="py-3.5 text-center font-medium text-ardoise-300">—</div>;
              })}
            </div>
            {/* CARPIMKO */}
            <div className="grid border-b border-ardoise-50" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
              <div className="px-3 py-3.5 flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-carpimko.png" alt="CARPIMKO" className="h-5" />
                {isEstimated && <EstimationBadge />}
              </div>
              {monthlyData.map((m, i) => {
                const reel = m.carpimko;
                const canEstimate = isEstimated || year > currentYear || (year === currentYear && i >= new Date().getMonth());
                const est = canEstimate ? (estimatedMonths[i]?.carpimko ?? 0) : 0;
                if (reel > 0) {
                  return <div key={i} className="py-3.5 text-center font-medium text-ardoise-700 font-mono">{formatCurrency(reel)}</div>;
                }
                if (canEstimate) {
                  return <div key={i} className="py-3.5 text-center font-medium text-ardoise-400 italic font-mono">{est > 0 ? `~${formatCurrency(est)}` : "0 €"}</div>;
                }
                return <div key={i} className="py-3.5 text-center font-medium text-ardoise-300">—</div>;
              })}
            </div>
            {/* Total */}
            <div className="grid" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
              <div className="px-3 py-3.5 text-sm font-semibold text-ardoise-900">Total</div>
              {monthlyData.map((m, i) => {
                const reelTotal = m.urssaf + m.carpimko;
                const canEstimate = isEstimated || year > currentYear || (year === currentYear && i >= new Date().getMonth());
                const estTotal = canEstimate ? ((estimatedMonths[i]?.urssaf ?? 0) + (estimatedMonths[i]?.carpimko ?? 0)) : 0;
                const hasReel = reelTotal > 0;
                const value = hasReel ? reelTotal : estTotal;
                if (value > 0) {
                  return (
                    <div key={i} className={`py-3.5 text-center font-semibold font-mono ${hasReel ? "text-ardoise-900" : "text-ardoise-400 italic"}`}>
                      {hasReel ? formatCurrency(value) : `~${formatCurrency(value)}`}
                    </div>
                  );
                }
                return <div key={i} className="py-3.5 text-center font-semibold text-ardoise-300">—</div>;
              })}
            </div>
            </div>
          </div>
        )}
      </div>

      {/* Historique des prélèvements URSSAF + CARPIMKO sur l'année sélectionnée */}
      <TransactionsList
        title="Historique des cotisations"
        description={`Prélèvements URSSAF et CARPIMKO réellement débités en ${year}.`}
        year={year}
        categories={CONTRIBUTIONS_CATEGORIES}
        exportFilename="historique_cotisations"
      />
    </div>
  );
}

// ── Transactions History (réutilisée par Mes impôts et Mes cotisations) ──

const CONTRIBUTIONS_CATEGORIES: string[] = ["urssaf", "carpimko"];
const TAXES_CATEGORIES: string[] = ["taxes", "cfe"];

const CATEGORY_LABELS: Record<string, string> = {
  urssaf: "URSSAF",
  carpimko: "CARPIMKO",
  taxes: "Impôts (PAS / régul.)",
  cfe: "CFE",
};

function formatTransactionDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function TransactionsList({
  title,
  description,
  year,
  categories,
  exportFilename,
}: {
  title: string;
  description: string;
  year: number;
  categories: string[];
  /** Préfixe du fichier CSV (ex: "impots", "cotisations"). */
  exportFilename: string;
}) {
  const [transactions, setTransactions] = useState<CategoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setLoading(true);
    getCategoryTransactionsAction(year, categories)
      .then((rows) => {
        setTransactions(rows);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // categories is a stable list of strings; serialize to avoid extra renders if parent re-creates the array
  }, [year, categories]);

  const total = useMemo(
    () => transactions.reduce((s, t) => s + Math.abs(t.amount), 0),
    [transactions],
  );

  const handleExportCsv = useCallback(() => {
    const headers = ["Date", "Libellé", "Catégorie", "Montant"];
    const rows = transactions.map((t) => [
      t.date,
      t.cleanDescription ?? t.description,
      CATEGORY_LABELS[t.category] ?? t.category,
      Math.abs(t.amount),
    ]);
    downloadCSV(`${exportFilename}_${year}`, headers, rows);
  }, [transactions, year, exportFilename]);

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div>
          <h3 className="text-base font-semibold text-ardoise-900">{title}</h3>
          <p className="text-xs text-ardoise-400 mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && transactions.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-ardoise-400">Total {year}</p>
              <p className="text-base font-bold text-ardoise-900 font-mono">{formatCurrency(total)}</p>
            </div>
          )}
          <ExportButtons
            onCsv={handleExportCsv}
            disabled={loading || transactions.length === 0}
          />
        </div>
      </div>
      {loading ? (
        <div className="px-6 pb-6">
          <div className="h-32 bg-ardoise-100 rounded animate-pulse" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="px-6 pb-6 text-sm text-ardoise-400">
          Aucune transaction enregistrée en {year} pour les catégories concernées.
        </div>
      ) : (
        <div className="border-t border-ardoise-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ardoise-100 text-xs font-semibold text-ardoise-500">
                <th className="text-left px-6 py-3">Date</th>
                <th className="text-left px-3 py-3">Libellé</th>
                <th className="text-left px-3 py-3">Catégorie</th>
                <th className="text-right px-6 py-3">Montant</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-ardoise-50 hover:bg-ardoise-50/50 transition-colors">
                  <td className="px-6 py-3 text-ardoise-700 whitespace-nowrap font-mono">{formatTransactionDate(t.date)}</td>
                  <td className="px-3 py-3 text-ardoise-900 truncate max-w-[420px]" title={t.cleanDescription ?? t.description}>
                    {t.cleanDescription ?? t.description}
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-ardoise-100 text-ardoise-700">
                      {CATEGORY_LABELS[t.category] ?? t.category}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-ardoise-900 whitespace-nowrap font-mono">
                    {formatCurrency(Math.abs(t.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Taxes Tab ──

function TaxesTab() {
  const hp = usePractitioner();
  const { loadYearCore, loadEstimate } = useManagementData();
  const bankConnected = !!hp?.bridgeUserUuid;
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const [situation, setSituation] = useState<"celibataire" | "marie" | "pacse">("celibataire");
  const [enfants, setEnfants] = useState(0);
  const [isSingleParent, setIsSingleParent] = useState(false);
  const [autresRevenus, setAutresRevenus] = useState(0);
  const [declaredIr, setDeclaredIr] = useState<string>("");
  const [dbLoaded, setDbLoaded] = useState(false);
  const [saveState, saveAction, saving] = useActionState(upsertFiscalSituationAction, null);

  // Monthly activity for the selected year (CA + charges)
  const [monthly, setMonthly] = useState<MonthlyActivityMonth[] | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(true);
  // Vacations for projection (future months / future years)
  const [vacations, setVacations] = useState<number[]>(Array(12).fill(0));
  // Past-year monthly used as a fallback to derive a daily rate for future-year projection
  const [pastReference, setPastReference] = useState<MonthlyActivityMonth[] | null>(null);
  // Fallback bordereaux : revenuBNC dérivé du CA des passages + cotisations estimées.
  const [isEstimated, setIsEstimated] = useState(false);

  // Load fiscal situation from DB when year changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setDbLoaded(false);
    getFiscalSituationAction(year).then((res) => {
      if (res) {
        setSituation(res.maritalStatus as "celibataire" | "marie" | "pacse");
        setEnfants(res.dependentChildren);
        setIsSingleParent(res.isSingleParent ?? false);
        setAutresRevenus(Number(res.otherIncome));
        setDeclaredIr(res.declaredIr !== null && res.declaredIr !== undefined ? String(res.declaredIr) : "");
      } else {
        setSituation("celibataire");
        setEnfants(0);
        setIsSingleParent(false);
        setAutresRevenus(0);
        setDeclaredIr("");
      }
      setDbLoaded(true);
    }).catch(() => {
      setDbLoaded(true);
    });
  }, [year]);

  // Load monthly activity + vacations for the selected year.
  // En fallback (pas de banque, bordereaux présents) : on lit les passages et on
  // injecte URSSAF/CARPIMKO estimés au prorata du CA mensuel pour que le calcul
  // BNC réel reste correct (BNC = CA − charges déductibles).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setMonthlyLoading(true);
    (async () => {
      const [core, v] = await Promise.all([
        loadYearCore(year),
        getVacationsAction(year),
      ]);
      const useFallback = core.isEstimated;
      setIsEstimated(useFallback);

      let months = core.months;

      // Enrichit avec URSSAF/CARPIMKO estimés en fallback, au prorata du CA
      // mensuel (calage sur le sélecteur d'année — getCotisationsEstimate est
      // year-aware).
      if (useFallback && core.totalCA > 0) {
        const est = await loadEstimate(year);
        if (est) {
          months = months.map((mm) => {
            const ratio = mm.income / core.totalCA;
            const urssaf = Math.round(est.urssafAnnuel * ratio);
            const carpimko = Math.round(est.carpimkoAnnuel * ratio);
            return { ...mm, urssaf, carpimko };
          });
        }
      }

      setMonthly(months);
      setVacations(v);
      setMonthlyLoading(false);
    })().catch(() => setMonthlyLoading(false));
  }, [year, loadYearCore, loadEstimate, bankConnected]);

  // For future years with no data yet, fall back on the current year as reference for daily rate.
  // Source alignée sur effectiveCA pour rester cohérent avec le flux principal.
  useEffect(() => {
    if (year <= currentYear) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when no projection is needed
      setPastReference(null);
      return;
    }
    (async () => {
      const core = await loadYearCore(currentYear);
      setPastReference(core.months);
    })().catch(() => {});
  }, [year, currentYear, loadYearCore]);

  const { parts, partsDeReference } = useMemo(
    () => computeParts({ maritalStatus: situation, dependentChildren: enfants, isSingleParent }),
    [situation, enfants, isSingleParent],
  );

  const pasRate = hp ? parseFloat(hp.pasRate) / 100 : 0;
  const daysPerWeek = hp?.daysPerWeekWorked ?? 5;

  // Revenu BNC annuel + PAS effectif sur le BNC.
  // BNC :
  //   - Année passée : total réel des mois 1-12.
  //   - Année courante : réel YTD + projection sur le reste (taux journalier).
  //   - Année future : projection 12 mois sur la base de l'année courante.
  // PAS BNC :
  //   - Mois passés/écoulés : somme des transactions catégorisées 'taxes' (acomptes réellement prélevés).
  //   - Mois futurs : projection = bénéfice projeté × taux PAS personnalisé.
  const { revenuBNC, pasBnc, isProjected, pasYtdReel } = useMemo(() => {
    if (!hp) return { revenuBNC: 0, pasBnc: 0, isProjected: false, pasYtdReel: 0 };

    const computeBNC = (m: MonthlyActivityMonth) => {
      if (hp.taxRegime === "micro_bnc") return m.income * 0.66;
      const chargesDeductibles = m.urssaf + m.carpimko + m.chargesPro + m.retrocession + m.madelin;
      return Math.max(0, m.income - chargesDeductibles);
    };

    const now = new Date();

    const dailyRateFrom = (months: MonthlyActivityMonth[], y: number) => {
      let totalBNC = 0;
      let totalDays = 0;
      const isPastYear = y < now.getFullYear();
      const currentMonthIdx = now.getMonth();
      months.forEach((m, i) => {
        const isPast = isPastYear || (y === now.getFullYear() && i < currentMonthIdx);
        if (!isPast || m.income <= 0) return;
        const wd = countWorkingDays(y, i + 1, daysPerWeek);
        const worked = Math.max(0, wd - (vacations[i] || 0));
        if (worked > 0) {
          totalBNC += computeBNC(m);
          totalDays += worked;
        }
      });
      return totalDays > 0 ? totalBNC / totalDays : 0;
    };

    // Année passée — tout est réel
    if (year < currentYear) {
      if (!monthly) return { revenuBNC: 0, pasBnc: 0, isProjected: false, pasYtdReel: 0 };
      const totalBnc = monthly.reduce((s, m) => s + computeBNC(m), 0);
      const totalPas = monthly.reduce((s, m) => s + m.impots, 0);
      return { revenuBNC: Math.round(totalBnc), pasBnc: Math.round(totalPas), isProjected: false, pasYtdReel: Math.round(totalPas) };
    }

    // Année courante — réel YTD + projection
    if (year === currentYear) {
      if (!monthly) return { revenuBNC: 0, pasBnc: 0, isProjected: false, pasYtdReel: 0 };
      const currentMonthIdx = now.getMonth();
      const realBncYtd = monthly.slice(0, currentMonthIdx + 1).reduce((s, m) => s + computeBNC(m), 0);
      const realPasYtd = monthly.slice(0, currentMonthIdx + 1).reduce((s, m) => s + m.impots, 0);
      const daily = dailyRateFrom(monthly, year);
      let bncProjection = 0;
      if (daily > 0) {
        const totalWd = countWorkingDays(year, currentMonthIdx + 1, daysPerWeek);
        const remainingWd = countRemainingWorkingDays(year, currentMonthIdx + 1, now.getDate() + 1, daysPerWeek);
        const ratio = totalWd > 0 ? remainingWd / totalWd : 0;
        const remainingVac = (vacations[currentMonthIdx] || 0) * ratio;
        const worked = Math.max(0, remainingWd - remainingVac);
        bncProjection += daily * worked;
        for (let i = currentMonthIdx + 1; i < 12; i++) {
          const wd = countWorkingDays(year, i + 1, daysPerWeek);
          const worked2 = Math.max(0, wd - (vacations[i] || 0));
          bncProjection += daily * worked2;
        }
      }
      const pasProjection = bncProjection * pasRate;
      const anyProjection = daily > 0 && currentMonthIdx < 11;
      return {
        revenuBNC: Math.round(realBncYtd + bncProjection),
        pasBnc: Math.round(realPasYtd + pasProjection),
        isProjected: anyProjection,
        pasYtdReel: Math.round(realPasYtd),
      };
    }

    // Année future — tout projeté
    const reference = pastReference;
    if (!reference) return { revenuBNC: 0, pasBnc: 0, isProjected: true, pasYtdReel: 0 };
    const daily = dailyRateFrom(reference, currentYear);
    if (daily <= 0) return { revenuBNC: 0, pasBnc: 0, isProjected: true, pasYtdReel: 0 };
    let totalBnc = 0;
    for (let i = 0; i < 12; i++) {
      const wd = countWorkingDays(year, i + 1, daysPerWeek);
      const worked = Math.max(0, wd - (vacations[i] || 0));
      totalBnc += daily * worked;
    }
    return {
      revenuBNC: Math.round(totalBnc),
      pasBnc: Math.round(totalBnc * pasRate),
      isProjected: true,
      pasYtdReel: 0,
    };
  }, [hp, monthly, vacations, year, currentYear, pastReference, pasRate, daysPerWeek]);

  const revenuImposable = revenuBNC + autresRevenus;

  const ir = useMemo(
    () => computeIR({ revenuImposable, parts, partsDeReference, incomeYear: year }),
    [revenuImposable, parts, partsDeReference, year],
  );

  // PAS total estimé sur le foyer = PAS BNC effectif (transactions 'taxes' + projection)
  // + approximation PAS conjoint salarié (autresRevenus × pasRate, faute de mieux).
  const pasAutresRevenus = Math.round(autresRevenus * pasRate);
  const pasAnnuel = pasBnc + pasAutresRevenus;
  const regularisation = ir.impot - pasAnnuel;

  const bareme = useMemo(() => getBareme(year), [year]);
  const currentTranche = bareme[ir.currentTrancheIndex]!;
  const showSingleParent = situation === "celibataire" && enfants >= 1;

  const handleExportTaxesPdf = useCallback(() => {
    const situationLabels: Record<string, string> = { celibataire: "Célibataire", marie: "Marié(e)", pacse: "Pacsé(e)" };
    const headers = ["Caractéristique", "Valeur"];
    const rows: (string | number)[][] = [
      ["Situation conjugale", situationLabels[situation] ?? situation],
      ["Enfants à charge", enfants],
      ...(isSingleParent ? [["Parent isolé (case T)", "Oui"] as (string | number)[]] : []),
      ["Autres revenus du foyer", formatCurrency(autresRevenus)],
      ["Nombre de parts fiscales", parts],
      [`${hp?.taxRegime === "micro_bnc" ? "BNC après abattement 34 %" : "Bénéfice BNC estimé"}`, `${isProjected ? "~" : ""}${formatCurrency(revenuBNC)}`],
      ["Revenu imposable du foyer", `${isProjected ? "~" : ""}${formatCurrency(revenuImposable)}`],
      ["Tranche marginale d'imposition", `${currentTranche.rate} %`],
      ["Taux moyen d'imposition", `${ir.tauxMoyen} %`],
      ...(ir.plafonneQf ? [["Quotient familial", "Plafonné"] as (string | number)[]] : []),
    ];
    const declaredParsed = declaredIr.trim() !== "" ? parseFloat(declaredIr.replace(",", ".")) : NaN;
    const summary = [
      { label: `IR estimé sur ${year}`, value: formatCurrency(ir.impot) },
      { label: `Régularisation ${year}`, value: `${regularisation >= 0 ? "+" : ""}${formatCurrency(regularisation)}` },
      { label: "PAS estimé sur l'année", value: formatCurrency(pasAnnuel) },
      ...(!isNaN(declaredParsed) ? [{ label: "IR réellement déclaré", value: formatCurrency(declaredParsed) }] : []),
    ];
    downloadPDF(`imposition_${year}`, `Mon imposition estimée ${year}`, headers, rows, {
      subtitle: `Estimation basée sur le barème ${year} (loi de finances ${year + 1})`,
      summary,
      footnote: isEstimated
        ? "BNC dérivé du CA issu de vos bordereaux ; charges déductibles (URSSAF/CARPIMKO) estimées à partir du CA. Aucun PAS prélevé n'est observable sans connexion bancaire — la régularisation correspond à l'intégralité du PAS estimé."
        : undefined,
    });
  }, [situation, enfants, isSingleParent, autresRevenus, parts, hp, isProjected, revenuBNC, revenuImposable, currentTranche, ir, pasAnnuel, regularisation, year, declaredIr, isEstimated]);

  return (
    <div className="space-y-6">
    {/* Sélecteur d'année global du tab — pilote situation, imposition, transactions */}
    <div className="flex items-center justify-end gap-2">
      <ExportButtons
        onPdf={handleExportTaxesPdf}
        disabled={monthlyLoading || !dbLoaded}
      />
      <YearSelector year={year} setYear={setYear} maxYear={currentYear} />
    </div>
    {isEstimated && (
      <div className="px-4 py-1.5 text-[11px] text-ardoise-400 flex items-center gap-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <span>
          BNC et PAS estimés à partir de vos bordereaux.{" "}
          <Link href="/transactions" className="underline decoration-ardoise-300 underline-offset-2 hover:text-ardoise-600">
            Connecter ma banque
          </Link>{" "}
          pour intégrer vos prélèvements réels.
        </span>
      </div>
    )}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Ma situation fiscale */}
      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-6">
        <div className="mb-5">
          <h3 className="text-base font-semibold text-ardoise-900">Ma situation fiscale</h3>
        </div>
        <form action={saveAction} className="space-y-4">
          <input type="hidden" name="year" value={year} />
          <div>
            <label className="block text-sm text-ardoise-500 mb-1.5">Situation conjugale</label>
            <select
              name="maritalStatus"
              value={situation}
              onChange={(e) => setSituation(e.target.value as "celibataire" | "marie" | "pacse")}
              className="w-full border border-ardoise-200 bg-transparent px-3 py-2 rounded-md text-sm transition-all hover:border-ardoise-400 focus:border-violet-500 focus:outline-none appearance-none cursor-pointer"
            >
              <option value="celibataire">Célibataire</option>
              <option value="marie">Marié(e)</option>
              <option value="pacse">Pacsé(e)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-ardoise-500 mb-1.5">Nombre d&apos;enfants à charge</label>
            <input
              type="number"
              name="dependentChildren"
              min="0"
              max="20"
              value={enfants}
              onChange={(e) => setEnfants(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full border border-ardoise-200 bg-transparent px-3 py-2 rounded-md text-sm transition-all hover:border-ardoise-400 focus:border-violet-500 focus:outline-none font-mono"
            />
          </div>
          {showSingleParent && (
            <div className="flex items-start gap-2">
              <input
                id="isSingleParent"
                type="checkbox"
                name="isSingleParent"
                checked={isSingleParent}
                onChange={(e) => setIsSingleParent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-ardoise-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="isSingleParent" className="text-sm text-ardoise-700 leading-tight">
                Parent isolé (case T)
                <span className="block text-xs text-ardoise-400 mt-0.5">
                  Vous vivez seul(e) et élevez seul(e) votre/vos enfant(s). Donne droit à une demi-part supplémentaire.
                </span>
              </label>
            </div>
          )}
          <div>
            <label className="block text-sm text-ardoise-500 mb-1.5">Autres revenus BNC ou salariés du foyer en {year}</label>
            <div className="relative">
              <input
                type="number"
                name="otherIncome"
                min="0"
                step="100"
                value={autresRevenus || ""}
                onChange={(e) => setAutresRevenus(Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="0"
                className="w-full border border-ardoise-200 bg-transparent px-3 py-2 pr-8 rounded-md text-sm transition-all hover:border-ardoise-400 focus:border-violet-500 focus:outline-none font-mono"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ardoise-400">€</span>
            </div>
            <p className="mt-1 text-xs text-ardoise-400">Revenus nets imposables du conjoint ou autres activités.</p>
          </div>
          {year < currentYear && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <label className="block text-sm text-ardoise-500">IR réel de mon avis d&apos;imposition {year}</label>
                <InfoTooltip text={`Montant exact de l'impôt sur le revenu figurant sur votre avis d'imposition ${year + 1} (revenus ${year}). Optionnel : permet de comparer à l'estimation de l'app et de détecter d'éventuels crédits/réductions non pris en compte.`} />
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  name="declaredIr"
                  value={declaredIr}
                  onChange={(e) => setDeclaredIr(e.target.value)}
                  placeholder="Optionnel"
                  className="w-full border border-ardoise-200 bg-transparent px-3 py-2 pr-8 rounded-md text-sm transition-all hover:border-ardoise-400 focus:border-violet-500 focus:outline-none font-mono"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ardoise-400">€</span>
              </div>
              <p className="mt-1 text-xs text-ardoise-400">À renseigner après réception de votre avis (août {year + 1}).</p>
            </div>
          )}
          <div className="pt-2 border-t border-ardoise-100 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ardoise-500">Nombre de parts fiscales</span>
              <span className="font-semibold text-ardoise-900 font-mono">{parts}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-ardoise-500">{hp?.taxRegime === "micro_bnc" ? "BNC après abattement 34 %" : "Bénéfice BNC estimé"}</span>
                <InfoTooltip text={hp?.taxRegime === "micro_bnc"
                  ? "Régime micro-BNC : les recettes annuelles sont diminuées d'un abattement forfaitaire de 34 %."
                  : "Régime déclaration contrôlée : bénéfice = recettes encaissées - charges déductibles (URSSAF, CARPIMKO, charges pro, rétrocession, Madelin)."} />
                {isEstimated && <EstimationBadge tooltip="Bénéfice BNC dérivé du CA de vos bordereaux. En régime déclaration contrôlée, les charges déductibles (URSSAF/CARPIMKO) sont estimées à partir du CA." />}
              </div>
              <span className={`font-semibold font-mono ${isProjected || isEstimated ? "text-ardoise-500 italic" : "text-ardoise-900"}`}>
                {monthlyLoading ? "…" : `${(isProjected || isEstimated) ? "~" : ""}${formatCurrency(revenuBNC)}`}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ardoise-500">Revenu imposable du foyer</span>
              <span className={`font-semibold font-mono ${isProjected ? "text-ardoise-500 italic" : "text-ardoise-900"}`}>
                {monthlyLoading ? "…" : `${isProjected ? "~" : ""}${formatCurrency(revenuImposable)}`}
              </span>
            </div>
          </div>

          {saveState?.error && (
            <p className="bg-red-50 p-3 rounded-md text-sm text-red-600">{saveState.error}</p>
          )}
          {saveState?.success && (
            <p className="bg-menthe-50 p-3 rounded-md text-sm text-menthe-600">Situation fiscale enregistrée.</p>
          )}

          <Button
            type="submit"
            variant="cta"
            disabled={saving || !dbLoaded}
            className="flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </form>
      </div>

      {/* Mon imposition estimée */}
      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-6">
        <h3 className="text-base font-semibold text-ardoise-900 mb-5">Mon imposition estimée</h3>
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-xs text-ardoise-400">Impôt estimé sur les revenus {year}</p>
              <InfoTooltip text={`Estimation de l'impôt sur le revenu calculée avec le barème progressif applicable aux revenus ${year} (loi de finances ${year + 1}), votre situation familiale et le quotient familial${ir.plafonneQf ? " (plafonné)" : ""}.`} />
              {isEstimated && <EstimationBadge tooltip="IR calculé à partir du BNC dérivé de vos bordereaux. Connectez votre banque pour des charges déductibles réelles." />}
            </div>
            <p className="text-2xl font-bold text-ardoise-900 font-mono">{monthlyLoading ? "…" : formatCurrency(ir.impot)}</p>
            {ir.plafonneQf && (
              <p className="text-xs text-orange-600 mt-1">Quotient familial plafonné — gain limité par demi-part supplémentaire.</p>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-xs text-ardoise-400">Régularisation {year} payée en {year + 1}</p>
              <InfoTooltip text={isEstimated
                ? `Sans connexion bancaire, aucun PAS prélevé n'est observable : la régularisation correspond à l'intégralité du PAS estimé. Connectez votre banque pour retrancher les acomptes déjà débités.`
                : `Différence entre l'impôt estimé et le PAS prélevé. PAS BNC : acomptes réellement prélevés (transactions catégorisées « Impôts » : ${formatCurrency(pasYtdReel)} à date)${year >= currentYear ? ` + projection au taux ${(pasRate * 100).toFixed(1)} % pour les mois restants` : ""}. PAS conjoint : approximation au même taux. Positif = complément à payer (sept-déc ${year + 1}), négatif = remboursement (été ${year + 1}).`} />
              {isEstimated && <EstimationBadge />}
            </div>
            <p className={`text-2xl font-bold font-mono ${regularisation >= 0 ? "text-red-500" : "text-menthe-600"}`}>
              {monthlyLoading ? "…" : `${regularisation >= 0 ? "+" : ""}${formatCurrency(regularisation)}`}
            </p>
            <p className="text-xs text-ardoise-400 mt-1">
              IR estimé {formatCurrency(ir.impot)} − PAS {formatCurrency(pasAnnuel)}
              {pasYtdReel > 0 && ` (dont ${formatCurrency(pasYtdReel)} déjà prélevés)`}
              {isEstimated && " · aucun prélèvement observé"}
            </p>
          </div>

          <div className="pt-4 border-t border-ardoise-100">
            <p className="text-sm font-medium text-ardoise-900 mb-1">Tranche marginale d&apos;imposition</p>
            <p className="text-xs text-ardoise-400 mb-3">
              Vous remplissez {ir.fillPercent} % de cette tranche.
              {ir.distanceToNext > 0 && ` Dans ${formatCurrency(ir.distanceToNext)} de revenus imposables supplémentaires, vous passerez à la tranche supérieure.`}
            </p>

            {/* Tranche bar */}
            <div className="flex rounded-full overflow-hidden h-3 mb-2">
              {bareme.map((t, i) => {
                const isActive = i === ir.currentTrancheIndex;
                const isPast = i < ir.currentTrancheIndex;
                return (
                  <div
                    key={t.rate}
                    className={`relative flex-1 transition-all ${
                      isPast ? "bg-brand-600" : isActive ? "bg-brand-200" : "bg-ardoise-100"
                    }`}
                  >
                    {isActive && (
                      <div
                        className="absolute inset-y-0 left-0 bg-brand-600 rounded-r-full"
                        style={{ width: `${ir.fillPercent}%` }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex text-[10px] font-medium text-ardoise-400">
              {bareme.map((t, i) => (
                <div key={t.rate} className={`flex-1 text-center font-mono ${i === ir.currentTrancheIndex ? "text-brand-600 font-bold" : ""}`}>
                  {t.rate} %
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-ardoise-500">Taux moyen</span>
              <span className="text-sm font-bold text-ardoise-900 font-mono">{ir.tauxMoyen} %</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm text-ardoise-500">Tranche marginale</span>
              <span className="text-sm font-bold text-ardoise-900 font-mono">{currentTranche.rate} %</span>
            </div>
          </div>

          {/* Comparaison estimé vs avis d'imposition réel (uniquement si saisi pour une année passée) */}
          {year < currentYear && declaredIr.trim() !== "" && (() => {
            const declared = parseFloat(declaredIr.replace(",", "."));
            if (isNaN(declared)) return null;
            const ecart = declared - ir.impot;
            return (
              <div className="pt-4 border-t border-ardoise-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <p className="text-sm font-medium text-ardoise-900">IR réel vs estimation</p>
                  <InfoTooltip text="Un écart négatif signifie que votre avis d'imposition est inférieur à l'estimation de l'app — probablement à cause de crédits ou réductions (dons, garde d'enfant, etc.) non pris en compte." />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ardoise-500">IR déclaré</span>
                  <span className="font-semibold text-ardoise-900 font-mono">{formatCurrency(declared)}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-ardoise-500">Écart estimé / réel</span>
                  <span className={`font-semibold font-mono ${ecart >= 0 ? "text-red-500" : "text-menthe-600"}`}>
                    {ecart >= 0 ? "+" : ""}{formatCurrency(ecart)}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
    {/* Historique des prélèvements PAS + CFE sur l'année sélectionnée */}
    <TransactionsList
      title="Historique des impôts"
      description={`Prélèvements à la source, régularisations et CFE débités en ${year}.`}
      year={year}
      categories={TAXES_CATEGORIES}
      exportFilename="historique_impots"
    />
    </div>
  );
}

// ── Summary Tab ──

function SummaryTab() {
  const hp = usePractitioner();
  const { loadYearCore, loadEstimate } = useManagementData();
  const bankConnected = !!hp?.bridgeUserUuid;
  const { accounts, transactionsLoading } = useData();
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;
  const irYear = prevYear; // IR de N (déclaré et soldé en N+1)
  const irPrevYear = irYear - 1;

  const [loading, setLoading] = useState(true);
  const [estimate, setEstimate] = useState<CotisationsEstimate | null>(null);
  const [monthlyData, setMonthlyData] = useState<{
    income: number;
    urssaf: number; carpimko: number; autresDepenses: number; chargesPro: number;
    retrocession: number; madelin: number;
  }[]>([]);
  const [prevYearCA, setPrevYearCA] = useState(0);
  const [prevYearFiscal, setPrevYearFiscal] = useState<{
    maritalStatus: string;
    dependentChildren: number;
    isSingleParent?: boolean;
    otherIncome: string;
  } | null>(null);
  const [includeRegul, setIncludeRegul] = useState(true);
  // Fallback bordereaux : CA mensuel + CA N-1 issus des passages, cotisations
  // estimées via getCotisationsEstimate. La carte "Trésorerie prévisionnelle"
  // reste indisponible (besoin du solde bancaire).
  const [isEstimated, setIsEstimated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setLoading(true);
    (async () => {
      const core = await loadYearCore(currentYear);
      setIsEstimated(core.isEstimated);

      // prevYear : même source/loader que l'année courante pour rester cohérent.
      const monthlyLoader = core.isEstimated ? getMonthlyActivityFromBordereauxAction : getMonthlyActivityAction;
      const [prevMonthly, prevFiscal, est] = await Promise.all([
        monthlyLoader(prevYear),
        getFiscalSituationAction(prevYear),
        loadEstimate(currentYear),
      ]);
      const monthly = core.months.map((m) => ({
        income: m.income,
        urssaf: m.urssaf,
        carpimko: m.carpimko,
        autresDepenses: m.autresDepenses,
        chargesPro: m.chargesPro,
        retrocession: m.retrocession,
        madelin: m.madelin,
      }));
      setMonthlyData(monthly);
      setEstimate(est);
      setPrevYearCA(prevMonthly.months.reduce((s, m) => s + m.income, 0));
      if (prevFiscal) {
        setPrevYearFiscal({
          maritalStatus: prevFiscal.maritalStatus,
          dependentChildren: prevFiscal.dependentChildren,
          isSingleParent: (prevFiscal as { isSingleParent?: boolean }).isSingleParent,
          otherIncome: prevFiscal.otherIncome,
        });
      }
      setLoading(false);
    })().catch(() => setLoading(false));
  }, [currentYear, prevYear, loadYearCore, loadEstimate, bankConnected]);

  // 1. Trésorerie actuelle = balance du compte par défaut
  const defaultBalance = useMemo(() => {
    if (!hp?.defaultBankAccountId) return 0;
    const acc = accounts.find((a) => a.id === hp.defaultBankAccountId);
    return acc ? parseFloat(acc.balance) : 0;
  }, [accounts, hp]);

  // 2. Régularisation : (estimé annuel − payé à date) pour URSSAF + CARPIMKO.
  // Convention : à payer (positif) → impact négatif sur la tréso.
  const regulImpact = useMemo(() => {
    if (!estimate) return 0;
    const paidUrssaf = monthlyData.reduce((s, m) => s + m.urssaf, 0);
    const paidCarpimko = monthlyData.reduce((s, m) => s + m.carpimko, 0);
    const due = (estimate.urssafAnnuel - paidUrssaf) + (estimate.carpimkoAnnuel - paidCarpimko);
    return -due;
  }, [estimate, monthlyData]);

  // 3. Anticipation 3 mois = moyenne des 3 derniers mois passés de (autresDepenses + chargesPro) × 3.
  const anticipation = useMemo(() => {
    if (!monthlyData.length) return 0;
    const currentMonth = new Date().getMonth();
    let sum = 0;
    let count = 0;
    for (let i = currentMonth - 1; i >= Math.max(0, currentMonth - 3); i--) {
      const m = monthlyData[i];
      if (!m) continue;
      sum += m.autresDepenses + m.chargesPro;
      count++;
    }
    const avg = count > 0 ? sum / count : 0;
    return -avg * 3;
  }, [monthlyData]);

  const solde = defaultBalance + (includeRegul ? regulImpact : 0) + anticipation;

  // ── Annual projections (year-end) ──
  const monthsElapsed = new Date().getMonth() + 1;
  const annualize = (ytd: number) => monthsElapsed > 0 ? Math.round((ytd / monthsElapsed) * 12) : 0;

  const annualCA = estimate?.revenuAnnualise ?? 0;
  const ytdChargesPro = monthlyData.reduce((s, m) => s + m.chargesPro, 0);
  const annualChargesPro = annualize(ytdChargesPro);
  // Cotisations sociales : 2 modes selon le toggle.
  //   ON  : estimation annuelle ajustée OpenFisca/Carpimko (anticipe la régularisation)
  //   OFF : extrapolation linéaire des paiements provisionnels YTD (sans anticipation)
  const annualCotisationsAjustees = (estimate?.urssafAnnuel ?? 0) + (estimate?.carpimkoAnnuel ?? 0);
  const ytdCotisationsPayees = monthlyData.reduce((s, m) => s + m.urssaf + m.carpimko, 0);
  const annualCotisationsProvisionnelles = annualize(ytdCotisationsPayees);
  const annualCotisations = includeRegul ? annualCotisationsAjustees : annualCotisationsProvisionnelles;
  const ytdRetroMadelin = monthlyData.reduce((s, m) => s + m.retrocession + m.madelin, 0);
  const annualRetroMadelin = annualize(ytdRetroMadelin);
  // Même formule que la ligne "Rém. avant impôt" de l'onglet Mon activité :
  //   CA − (urssaf + carpimko + chargesPro + retrocession + madelin)
  // Clamp à 0 — pas de rémunération négative affichée.
  const annualRemAvantImpot = Math.max(0, annualCA - annualCotisations - annualChargesPro - annualRetroMadelin);

  // IR sur revenus N (payé en N+1).
  const irPrev = useMemo(() => {
    if (!hp) return 0;
    const taxRegime = hp.taxRegime;
    const revenuNet = taxRegime === "micro_bnc" ? prevYearCA * 0.66 : prevYearCA;
    const otherIncome = prevYearFiscal ? Number(prevYearFiscal.otherIncome) : 0;
    const revenuImposable = Math.round(revenuNet + otherIncome);
    if (revenuImposable <= 0) return 0;
    const { parts, partsDeReference } = computeParts({
      maritalStatus: (prevYearFiscal?.maritalStatus as "celibataire" | "marie" | "pacse") ?? "celibataire",
      dependentChildren: prevYearFiscal?.dependentChildren ?? 0,
      isSingleParent: prevYearFiscal?.isSingleParent ?? false,
    });
    return computeIR({ revenuImposable, parts, partsDeReference, incomeYear: irYear }).impot;
  }, [hp, prevYearCA, prevYearFiscal, irYear]);

  const metrics: {
    key: string;
    title: string;
    icon: ReactNode;
    year: number;
    value: number;
    prevYear: number;
    prevValue: number | null;
  }[] = [
    {
      key: "ca", title: "Chiffre d'affaires", year: currentYear, value: annualCA, prevYear, prevValue: null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
        </svg>
      ),
    },
    {
      key: "ch", title: "Charges pro.", year: currentYear, value: annualChargesPro, prevYear, prevValue: null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>
        </svg>
      ),
    },
    {
      key: "cot", title: "Cotisations sociales", year: currentYear, value: annualCotisations, prevYear, prevValue: null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ),
    },
    {
      key: "rem", title: "Rémunération avant impôt", year: currentYear, value: annualRemAvantImpot, prevYear, prevValue: null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4z"/>
        </svg>
      ),
    },
    {
      key: "ir", title: "Impôt sur le revenu", year: irYear, value: irPrev, prevYear: irPrevYear, prevValue: null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
        </svg>
      ),
    },
  ];

  // En fallback bordereaux : pas de solde bancaire réel → on ne rend aucune
  // donnée dans le chart pour ne pas afficher des bars trompeuses sous l'overlay.
  const chartData = isEstimated ? [] : [
    { key: "treso", name: "Trésorerie actuelle", value: Math.round(defaultBalance) },
    ...(includeRegul ? [{ key: "regul", name: `Régularisation ${currentYear}`, value: Math.round(regulImpact) }] : []),
    { key: "antic", name: "Anticipation 3 mois", value: Math.round(anticipation) },
  ];

  const formatSigned = (v: number) => `${v > 0 ? "+" : ""}${formatCurrency(v)}`;
  const isLoading = loading || transactionsLoading;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Trésorerie prévisionnelle — nécessite des vraies transactions bancaires
          (pas juste un bridgeUserUuid posé). En fallback bordereaux on n'a pas
          de solde de compte exploitable → on garde l'overlay affiché. */}
      <div className="relative bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-6">
        <DataMissingOverlay bankConnected={(bankConnected && !isEstimated) || isLoading} />
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="text-base font-semibold text-ardoise-900">Trésorerie prévisionnelle</h3>
          <div className="inline-flex rounded-full bg-ardoise-100 p-0.5 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setIncludeRegul(true)}
              className={`px-3 py-1.5 rounded-full transition-colors ${includeRegul ? "bg-white text-ardoise-900 shadow-sm" : "text-ardoise-500 hover:text-ardoise-700"}`}
            >
              Prévoir la régularisation
            </button>
            <button
              type="button"
              onClick={() => setIncludeRegul(false)}
              className={`px-3 py-1.5 rounded-full transition-colors ${!includeRegul ? "bg-white text-ardoise-900 shadow-sm" : "text-ardoise-500 hover:text-ardoise-700"}`}
            >
              Ne pas prévoir
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="h-64 bg-ardoise-100 rounded animate-pulse" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 24, right: 12, bottom: 40, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#847A95" }}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={20}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#A79EB5" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${(v / 1000).toFixed(1)}k`}
                  width={40}
                />
                <ReferenceLine y={0} stroke="#2E2440" strokeWidth={1.5} />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E1DBEC", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                  formatter={(value) => {
                    const num = typeof value === "number" ? value : Number(value ?? 0);
                    return [formatSigned(num), "Montant"];
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 4, 4]} maxBarSize={64}>
                  <LabelList
                    dataKey="value"
                    position="top"
                    formatter={(value) => {
                      const num = typeof value === "number" ? value : Number(value ?? 0);
                      return formatSigned(num);
                    }}
                    style={{ fontSize: 11, fontWeight: 600, fill: "#2E2440" }}
                  />
                  {chartData.map((d) => (
                    <Cell key={d.key} fill={d.value >= 0 ? "#3DB87A" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-6 pt-4 border-t border-ardoise-100">
              <div className="flex items-center gap-1.5 mb-1">
                <p className="text-xs text-ardoise-400">Solde de trésorerie prévisionnelle</p>
                <InfoTooltip text={includeRegul
                  ? `Solde hypothétique après avoir anticipé votre régularisation d'Urssaf et de Carpimko ${currentYear} (ajustée en ${currentYear + 1}) ainsi que 3 mois de vos frais professionnels.`
                  : `Solde hypothétique après avoir anticipé 3 mois de vos frais professionnels (sans tenir compte de la régularisation ${currentYear}).`} />
              </div>
              <p className={`text-3xl font-bold font-mono ${isEstimated ? "text-ardoise-300" : solde >= 0 ? "text-ardoise-900" : "text-red-500"}`}>
                {isEstimated ? "—" : formatSigned(solde)}
              </p>
            </div>

            <p className="mt-4 text-xs text-ardoise-500 leading-relaxed">
              {includeRegul
                ? <>Solde de trésorerie hypothétique après avoir anticipé votre régularisation d&apos;Urssaf et de Carpimko {currentYear} (ajustée en {currentYear + 1}) ainsi que 3 mois de vos frais professionnels.</>
                : <>Solde de trésorerie hypothétique après avoir anticipé 3 mois de vos frais professionnels. La régularisation {currentYear} n&apos;est pas prise en compte.</>}
            </p>
            <p className="mt-2 text-xs text-ardoise-500 leading-relaxed">
              Un montant positif indique une trésorerie suffisante pour couvrir ces dépenses à venir.
            </p>
          </>
        )}
      </div>

      {/* Métriques annuelles N vs N-1 */}
      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-6">
        {isEstimated && (
          <div className="mb-3 text-[11px] text-ardoise-400 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <span>
              Estimations à partir de vos bordereaux.{" "}
              <Link href="/transactions" className="underline decoration-ardoise-300 underline-offset-2 hover:text-ardoise-600">
                Connecter ma banque
              </Link>
              .
            </span>
          </div>
        )}
        {isLoading ? (
          <div className="h-96 bg-ardoise-100 rounded animate-pulse" />
        ) : (
          <div className="divide-y divide-ardoise-100">
            {metrics.map((m, idx) => {
              const scale = Math.max(m.value, m.prevValue ?? 0);
              const pctN = scale > 0 ? Math.min(100, (m.value / scale) * 100) : 0;
              const pctNm1 = scale > 0 && m.prevValue != null ? Math.min(100, (m.prevValue / scale) * 100) : 0;
              return (
                <div key={m.key} className={`flex items-center gap-4 ${idx === 0 ? "pb-4" : idx === metrics.length - 1 ? "pt-4" : "py-4"}`}>
                  {/* Icon */}
                  <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                    {m.icon}
                  </div>
                  {/* Title */}
                  <p className="text-sm font-medium text-ardoise-900 flex-1 min-w-0">{m.title}</p>
                  {/* Years + bars stacked */}
                  <div className="flex flex-col gap-2 w-[55%] shrink-0">
                    {/* Year N */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-ardoise-500 w-10 shrink-0 font-mono">{m.year}</span>
                      <div className="flex-1 h-1.5 bg-ardoise-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-600 rounded-full transition-all" style={{ width: `${pctN}%` }} />
                      </div>
                      <div className="w-20 text-right shrink-0 leading-tight">
                        <p className="text-[10px] text-ardoise-400 italic">Prévision</p>
                        <p className="text-[12px] font-semibold text-ardoise-900 font-mono">{formatCurrency(m.value)}</p>
                      </div>
                    </div>
                    {/* Year N-1 */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-ardoise-400 w-10 shrink-0 font-mono">{m.prevYear}</span>
                      <div className="flex-1 h-1.5 bg-ardoise-100 rounded-full overflow-hidden">
                        <div className="h-full bg-ardoise-300 rounded-full transition-all" style={{ width: `${pctNm1}%` }} />
                      </div>
                      <div className="w-20 text-right shrink-0 leading-tight">
                        <p className="text-[10px] italic">&nbsp;</p>
                        <p className="text-[12px] font-semibold text-ardoise-300 font-mono">{m.prevValue != null ? formatCurrency(m.prevValue) : "—"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Remainder Tab ──
//
// "Reste à vivre" : trésorerie projetée à 3 horizons (fin du mois, fin du
// trimestre, fin de l'année). Part du solde du compte par défaut, ajoute les
// encaissements estimés (moyenne mensuelle des mois écoulés × mois restants
// jusqu'à l'horizon), soustrait les échéances fiscales/sociales lues dans le
// calendrier × montant par échéance issu de getCotisationsEstimate, et
// soustrait les charges pro projetées (moyenne YTD × mois restants). Vue
// purement indicative — pas de prise en compte de régul ou dépenses ponctuelles.

function RemainderTab() {
  const hp = usePractitioner();
  const { loadYearCore, loadEstimate } = useManagementData();
  const bankConnected = !!hp?.bridgeUserUuid;
  const { accounts, transactionsLoading, defaultBankAccountMissing } = useData();
  const currentYear = new Date().getFullYear();
  // "Solde disponible" = banque liée + compte par défaut choisi + compte
  // effectivement présent dans la liste synchronisée. Sans ça, defaultBalance
  // retombait à 0 et on affichait "0 €" au lieu d'un message explicite.
  const hasBalance = bankConnected && !!hp?.defaultBankAccountId && !defaultBankAccountMissing;

  const [loading, setLoading] = useState(true);
  const [estimate, setEstimate] = useState<CotisationsEstimate | null>(null);
  const [monthlyData, setMonthlyData] = useState<{
    income: number;
    urssaf: number;
    carpimko: number;
    autresDepenses: number;
    chargesPro: number;
    retrocession: number;
    madelin: number;
  }[]>([]);
  const [isEstimated, setIsEstimated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setLoading(true);
    (async () => {
      const core = await loadYearCore(currentYear);
      setIsEstimated(core.isEstimated);
      const months = core.months.map((m) => ({
        income: m.income,
        urssaf: m.urssaf,
        carpimko: m.carpimko,
        autresDepenses: m.autresDepenses,
        chargesPro: m.chargesPro,
        retrocession: m.retrocession,
        madelin: m.madelin,
      }));
      const est = await loadEstimate(currentYear);
      setMonthlyData(months);
      setEstimate(est);
      setLoading(false);
    })().catch(() => setLoading(false));
  }, [currentYear, loadYearCore, loadEstimate, bankConnected]);

  const prefs: PaymentPreferences = useMemo(() => {
    if (!hp) return DEFAULT_PREFERENCES;
    return {
      urssafFrequency: hp.urssafFrequency,
      urssafPayDay: hp.urssafPayDay,
      pasFrequency: hp.pasFrequency,
      carpimkoFrequency: hp.carpimkoFrequency,
      carpimkoPayDay: hp.carpimkoPayDay,
      activityStartDate: hp.activityStartDate,
    };
  }, [hp]);
  const calendar = useMemo(() => buildCalendar(prefs), [prefs]);

  const defaultBalance = useMemo(() => {
    if (!hp?.defaultBankAccountId) return 0;
    const acc = accounts.find((a) => a.id === hp.defaultBankAccountId);
    return acc ? parseFloat(acc.balance) : 0;
  }, [accounts, hp]);

  type Breakdown = {
    key: string;
    label: string;
    horizonDate: string;
    projIncome: number;
    urssafDue: number;
    carpimkoDue: number;
    pasDue: number;
    projChargesPro: number;
    projAutres: number;
    projRetroMadelin: number;
    totalCharges: number;
    remainder: number;
  };

  const MONTHS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  const breakdowns = useMemo<Breakdown[]>(() => {
    const now = new Date();
    const currentMonthIdx = now.getMonth();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(currentYear, currentMonthIdx + 1, 0).getDate();
    const fractionRemainingCurrentMonth = Math.max(0, (daysInMonth - dayOfMonth) / daysInMonth);

    // Moyennes sur les mois écoulés (hors mois courant). Si on est en janvier
    // ou qu'on n'a aucun historique, on prend le mois courant comme proxy.
    const pastMonths = monthlyData.slice(0, currentMonthIdx);
    const sample = pastMonths.length > 0 ? pastMonths : monthlyData.slice(0, 1);
    const avg = (sel: (m: typeof monthlyData[number]) => number) =>
      sample.length ? sample.reduce((s, m) => s + sel(m), 0) / sample.length : 0;
    const avgIncome = avg((m) => m.income);
    const avgChargesPro = avg((m) => m.chargesPro);
    const avgAutres = avg((m) => m.autresDepenses);
    const avgRetroMadelin = avg((m) => m.retrocession + m.madelin);

    const eomIdx = currentMonthIdx;
    const eoqIdx = Math.min(11, Math.floor(currentMonthIdx / 3) * 3 + 2);
    const eoyIdx = 11;

    const compute = (key: string, label: string, targetIdx: number): Breakdown => {
      const lastDay = new Date(currentYear, targetIdx + 1, 0).getDate();
      const horizonDate = `${lastDay} ${MONTHS_LONG[targetIdx]} ${currentYear}`;

      const monthsBetween = targetIdx > currentMonthIdx
        ? fractionRemainingCurrentMonth + (targetIdx - currentMonthIdx)
        : fractionRemainingCurrentMonth;

      const projIncome = avgIncome * monthsBetween;
      const projChargesPro = avgChargesPro * monthsBetween;
      const projAutres = avgAutres * monthsBetween;
      const projRetroMadelin = avgRetroMadelin * monthsBetween;

      let urssafDue = 0;
      let carpimkoDue = 0;
      let pasDue = 0;
      for (let m = currentMonthIdx; m <= targetIdx; m++) {
        for (const e of calendar[m] || []) {
          // Échéance du mois en cours déjà passée → on ne la compte pas
          // (elle apparaîtra dans monthlyData une fois prélevée).
          if (m === currentMonthIdx && e.day < dayOfMonth) continue;
          if (e.type === "urssaf") urssafDue += estimate?.urssafParEcheance ?? 0;
          else if (e.type === "carpimko") carpimkoDue += estimate?.carpimkoParEcheance ?? 0;
          else if (e.type === "ir") pasDue += estimate?.pasParEcheance ?? 0;
        }
      }

      const totalCharges = urssafDue + carpimkoDue + pasDue + projChargesPro + projAutres + projRetroMadelin;
      const remainder = defaultBalance + projIncome - totalCharges;

      return {
        key, label, horizonDate,
        projIncome, urssafDue, carpimkoDue, pasDue,
        projChargesPro, projAutres, projRetroMadelin,
        totalCharges, remainder,
      };
    };

    const out: Breakdown[] = [];
    out.push(compute("eom", "Fin du mois", eomIdx));
    if (eoqIdx !== eomIdx) out.push(compute("eoq", "Fin du trimestre", eoqIdx));
    if (eoyIdx !== eoqIdx && eoyIdx !== eomIdx) out.push(compute("eoy", "Fin de l'année", eoyIdx));
    return out;
  }, [calendar, estimate, monthlyData, defaultBalance, currentYear]);

  const isLoading = loading || transactionsLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-ardoise-900">Reste à vivre</h2>
        <InfoTooltip text="Trésorerie projetée à différents horizons : on part de votre solde bancaire, on y ajoute vos encaissements estimés (moyenne mensuelle des mois écoulés) et on déduit les échéances fiscales/sociales à venir ainsi qu'une moyenne de vos charges pro. Indicatif — ne tient pas compte de régularisations ou de dépenses ponctuelles." />
      </div>

      {isEstimated && (
        <div className="text-[11px] text-ardoise-400 flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <span>
            Estimations à partir de vos bordereaux.{" "}
            <Link href="/transactions" className="underline decoration-ardoise-300 underline-offset-2 hover:text-ardoise-600">
              Connecter ma banque
            </Link>
            .
          </span>
        </div>
      )}

      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-5">
        <p className="text-xs text-ardoise-400 mb-1">Trésorerie actuelle (compte par défaut)</p>
        {isLoading ? (
          <div className="h-8 w-32 bg-ardoise-100 rounded animate-pulse" />
        ) : (
          <div className="flex items-baseline gap-3 flex-wrap">
            <p className={`text-3xl font-bold font-mono ${!hasBalance ? "text-ardoise-300" : defaultBalance >= 0 ? "text-ardoise-900" : "text-alerte-600"}`}>
              {formatCurrency(hasBalance ? defaultBalance : 0)}
            </p>
            {!hasBalance && (
              <p className="text-xs text-ardoise-500">
                {!bankConnected ? "Banque non connectée" : !hp?.defaultBankAccountId ? "Aucun compte par défaut configuré" : "Compte par défaut introuvable"}
                {" — "}
                <Link href="/transactions" className="underline decoration-ardoise-300 underline-offset-2 hover:text-ardoise-700">
                  {!bankConnected ? "connecter ma banque" : "configurer un compte par défaut"}
                </Link>{" "}
                pour afficher le solde.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {breakdowns.map((b) => {
          const rows: { label: string; value: number; isCredit?: boolean }[] = [
            { label: "Encaissements estimés", value: b.projIncome, isCredit: true },
            { label: "URSSAF", value: b.urssafDue },
            { label: "CARPIMKO", value: b.carpimkoDue },
            { label: "Impôt sur le revenu (PAS)", value: b.pasDue },
            { label: "Charges pro.", value: b.projChargesPro },
            { label: "Autres dépenses pro.", value: b.projAutres },
            { label: "Rétrocession + Madelin", value: b.projRetroMadelin },
          ].filter((r) => Math.abs(r.value) > 0.5);
          return (
            <div key={b.key} className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-5">
              <div className="mb-4">
                <p className="text-sm font-semibold text-ardoise-900">{b.label}</p>
                <p className="text-[11px] text-ardoise-400">au {b.horizonDate}</p>
              </div>
              {isLoading ? (
                <div className="h-48 bg-ardoise-100 rounded animate-pulse" />
              ) : (
                <>
                  <div className="flex items-baseline justify-between pb-3 border-b border-ardoise-100">
                    <p className="text-xs text-ardoise-500">Trésorerie de départ</p>
                    <p className={`text-sm font-medium tabular-nums font-mono ${hasBalance ? "text-ardoise-900" : "text-ardoise-300"}`}>
                      {formatCurrency(hasBalance ? defaultBalance : 0)}
                    </p>
                  </div>
                  {rows.length === 0 ? (
                    <p className="py-4 text-xs text-ardoise-400 italic">Aucune charge ni encaissement projeté sur la période.</p>
                  ) : (
                    <div className="py-3 space-y-1.5">
                      {rows.map((r) => (
                        <div key={r.label} className="flex items-baseline justify-between text-xs">
                          <span className="text-ardoise-600">{r.label}</span>
                          <span className={`tabular-nums font-mono ${r.isCredit ? "text-menthe-600" : "text-ardoise-700"}`}>
                            {r.isCredit ? "+" : "−"}{formatCurrency(r.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pt-3 border-t border-ardoise-100">
                    <p className="text-[11px] text-ardoise-400 mb-0.5">Reste à vivre estimé</p>
                    <p className={`text-2xl font-bold tabular-nums font-mono ${b.remainder >= 0 ? "text-ardoise-900" : "text-alerte-600"}`}>
                      {formatCurrency(b.remainder)}
                    </p>
                    {!hasBalance && (
                      <p className="text-[11px] text-ardoise-500 mt-1 leading-relaxed">
                        Calcul partant d&apos;une trésorerie à 0 € : {!bankConnected ? "banque non connectée" : !hp?.defaultBankAccountId ? "aucun compte par défaut configuré" : "compte par défaut introuvable"}.{" "}
                        <Link href="/transactions" className="underline decoration-ardoise-300 underline-offset-2 hover:text-ardoise-700">
                          {!bankConnected ? "Connecter ma banque" : "Configurer un compte"}
                        </Link>{" "}
                        pour partir d&apos;un solde réel.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-ardoise-400 leading-relaxed">
        Estimation indicative. Encaissements et charges pro. extrapolés à partir de la moyenne mensuelle des mois écoulés ; cotisations sociales et impôts pris sur le calendrier d&apos;échéances avec votre estimation annualisée. Ne tient pas compte d&apos;éventuelles régularisations URSSAF/CARPIMKO ni de dépenses ponctuelles.
      </p>
    </div>
  );
}

// ── Simulation Tab ──

function SimulationTab() {
  const hp = usePractitioner();
  const { loadYearCore, loadEstimate } = useManagementData();
  const bankConnected = !!hp?.bridgeUserUuid;
  const currentYear = new Date().getFullYear();
  const chartRef = useRef<HTMLDivElement>(null);

  const [baselineCA, setBaselineCA] = useState(0);
  const [baseline, setBaseline] = useState<SimulationResult | null>(null);
  const [simulatedCA, setSimulatedCA] = useState(0);
  const [simulated, setSimulated] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [simLoading, setSimLoading] = useState(false);
  // Fallback bordereaux : la baseline est issue des passages, pas des transactions
  // bancaires. Sert à signaler la provenance de la simulation.
  const [isEstimated, setIsEstimated] = useState(false);

  // Baseline = CA annualisé courant simulé via la même fonction que la valeur
  // "Simulé". Évite la confusion N-2/forfaitaire — comparaison apples-to-apples.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setLoading(true);
    (async () => {
      const core = await loadYearCore(currentYear);
      setIsEstimated(core.isEstimated);
      const est = await loadEstimate(currentYear);
      const annualCA = est?.revenuAnnualise ?? 0;
      const baseSim = annualCA > 0 ? await simulateCotisations(annualCA) : null;
      setBaselineCA(annualCA);
      setBaseline(baseSim);
      setSimulatedCA(annualCA);
      setSimulated(baseSim);
      setLoading(false);
    })().catch(() => setLoading(false));
  }, [currentYear, loadYearCore, loadEstimate, bankConnected]);

  // Recalcul simulé (debounced sur 300 ms)
  useEffect(() => {
    if (simulatedCA <= 0) return;
    if (simulatedCA === baselineCA && baseline) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- évite un appel OpenFisca quand le slider revient sur le CA actuel
      setSimulated(baseline);
      return;
    }
    setSimLoading(true);
    const handle = setTimeout(() => {
      simulateCotisations(simulatedCA)
        .then((res) => { if (res) setSimulated(res); })
        .catch(() => {})
        .finally(() => setSimLoading(false));
    }, 300);
    return () => { clearTimeout(handle); setSimLoading(false); };
  }, [simulatedCA, baselineCA, baseline]);

  const sliderMax = useMemo(() => Math.max(150_000, Math.round(baselineCA * 1.5 / 10_000) * 10_000), [baselineCA]);

  const setPreset = useCallback((mult: number) => {
    if (baselineCA <= 0) return;
    setSimulatedCA(Math.round(baselineCA * mult / 1000) * 1000);
  }, [baselineCA]);

  const chartData = useMemo(() => {
    if (!baseline || !simulated) return [];
    return [
      { name: "URSSAF", actuel: baseline.urssafAnnuel, simule: simulated.urssafAnnuel },
      { name: "CARPIMKO", actuel: baseline.carpimkoAnnuel, simule: simulated.carpimkoAnnuel },
      { name: "PAS", actuel: baseline.pasAnnuel, simule: simulated.pasAnnuel },
      { name: "Solde", actuel: baseline.remunerationNette, simule: simulated.remunerationNette },
    ];
  }, [baseline, simulated]);

  const handleExportCsv = useCallback(() => {
    if (!baseline || !simulated) return;
    const headers = ["Catégorie", "Actuel (€)", "Simulé (€)", "Différence (€)"];
    const rows: (string | number)[][] = [
      ["URSSAF", baseline.urssafAnnuel, simulated.urssafAnnuel, simulated.urssafAnnuel - baseline.urssafAnnuel],
      ["CARPIMKO", baseline.carpimkoAnnuel, simulated.carpimkoAnnuel, simulated.carpimkoAnnuel - baseline.carpimkoAnnuel],
      ["PAS (impôt sur le revenu)", baseline.pasAnnuel, simulated.pasAnnuel, simulated.pasAnnuel - baseline.pasAnnuel],
      ["Total cotisations + impôt", baseline.totalCotisations, simulated.totalCotisations, simulated.totalCotisations - baseline.totalCotisations],
      ["Solde avant charges pro", baseline.remunerationNette, simulated.remunerationNette, simulated.remunerationNette - baseline.remunerationNette],
      ["CA annuel", baseline.revenuAnnuel, simulated.revenuAnnuel, simulated.revenuAnnuel - baseline.revenuAnnuel],
    ];
    downloadCSV(`simulation_cotisations_${currentYear}`, headers, rows);
  }, [baseline, simulated, currentYear]);

  const handleExportPdf = useCallback(async () => {
    if (!baseline || !simulated) return;
    const fmt = (n: number) => formatCurrency(n);
    const fmtSigned = (n: number) => `${n > 0 ? "+" : ""}${formatCurrency(n)}`;
    const headers = ["Catégorie", "Actuel", "Simulé", "Différence"];
    const rows: (string | number)[][] = [
      ["URSSAF", fmt(baseline.urssafAnnuel), fmt(simulated.urssafAnnuel), fmtSigned(simulated.urssafAnnuel - baseline.urssafAnnuel)],
      ["CARPIMKO", fmt(baseline.carpimkoAnnuel), fmt(simulated.carpimkoAnnuel), fmtSigned(simulated.carpimkoAnnuel - baseline.carpimkoAnnuel)],
      ["PAS (impôt sur le revenu)", fmt(baseline.pasAnnuel), fmt(simulated.pasAnnuel), fmtSigned(simulated.pasAnnuel - baseline.pasAnnuel)],
      ["Total cotisations + impôt", fmt(baseline.totalCotisations), fmt(simulated.totalCotisations), fmtSigned(simulated.totalCotisations - baseline.totalCotisations)],
      ["Solde avant charges pro", fmt(baseline.remunerationNette), fmt(simulated.remunerationNette), fmtSigned(simulated.remunerationNette - baseline.remunerationNette)],
    ];
    const chartImage = (await getChartImage(chartRef.current)) ?? undefined;
    downloadPDF(`simulation_cotisations_${currentYear}`, `Simulation de cotisations ${currentYear}`, headers, rows, {
      subtitle: `CA actuel ${formatCurrency(baselineCA)} → CA simulé ${formatCurrency(simulatedCA)}`,
      chartImage,
      summary: [
        { label: "CA simulé", value: formatCurrency(simulatedCA) },
        { label: "Total à régler", value: formatCurrency(simulated.totalCotisations) },
        { label: "Solde avant charges pro", value: formatCurrency(simulated.remunerationNette) },
      ],
      footnote: isEstimated
        ? "Baseline calculée à partir du chiffre d'affaires issu de vos bordereaux. Connectez votre banque pour caler la simulation sur vos encaissements réels."
        : undefined,
    });
  }, [baseline, simulated, baselineCA, simulatedCA, currentYear, isEstimated]);

  const diffPct = baselineCA > 0 && simulatedCA !== baselineCA
    ? Math.round((simulatedCA - baselineCA) / baselineCA * 100)
    : 0;

  const cards: { label: string; before: number; after: number; isReward?: boolean }[] = [
    { label: "URSSAF", before: baseline?.urssafAnnuel ?? 0, after: simulated?.urssafAnnuel ?? 0 },
    { label: "CARPIMKO", before: baseline?.carpimkoAnnuel ?? 0, after: simulated?.carpimkoAnnuel ?? 0 },
    { label: "PAS (impôt)", before: baseline?.pasAnnuel ?? 0, after: simulated?.pasAnnuel ?? 0 },
    { label: "Total à régler", before: baseline?.totalCotisations ?? 0, after: simulated?.totalCotisations ?? 0 },
    { label: "Solde avant charges pro", before: baseline?.remunerationNette ?? 0, after: simulated?.remunerationNette ?? 0, isReward: true },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* ── Section 1 : Estimation du C.A. ── */}
      <CAForecastSection
        onApply={(ca) => setSimulatedCA(Math.round(ca / 1000) * 1000)}
        appliedCA={simulatedCA}
      />

      {/* ── Section 2 : Estimation du reste à régler ── */}
      <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-ardoise-900">Estimation du reste à régler</h3>
          <InfoTooltip text="Calcul via OpenFisca (régime PAMC IDEL) + barème CARPIMKO. À titre indicatif : en pratique, l'URSSAF est calculée sur le revenu N-2 ; cette simulation suppose que le revenu indiqué est celui de l'année en cours." />
        </div>
        <ExportButtons onCsv={handleExportCsv} onPdf={handleExportPdf} disabled={!baseline || !simulated} />
      </div>
      {isEstimated && (
        <div className="text-[11px] text-ardoise-400 flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <span>
            CA actuel calculé à partir de vos bordereaux.{" "}
            <Link href="/transactions" className="underline decoration-ardoise-300 underline-offset-2 hover:text-ardoise-600">
              Connecter ma banque
            </Link>{" "}
            pour caler la simulation sur vos encaissements réels.
          </span>
        </div>
      )}

      {/* Slider compact */}
      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-4 space-y-3">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-baseline gap-3 flex-wrap">
            <p className="text-2xl font-bold text-ardoise-900 font-mono">{formatCurrency(simulatedCA)}</p>
            {baselineCA > 0 && simulatedCA !== baselineCA && (
              <p className={`text-xs font-medium ${simulatedCA > baselineCA ? "text-menthe-600" : "text-alerte-600"}`}>
                {simulatedCA > baselineCA ? "+" : ""}{diffPct} % vs actuel ({formatCurrency(baselineCA)})
              </p>
            )}
            {baselineCA > 0 && simulatedCA === baselineCA && (
              <p className="text-xs text-ardoise-500">CA actuel projeté</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {[0.8, 0.9, 1, 1.1, 1.2].map((m) => {
              const isActive = baselineCA > 0 && Math.abs(simulatedCA - baselineCA * m) < 600;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPreset(m)}
                  disabled={baselineCA <= 0}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors disabled:opacity-30 ${
                    isActive
                      ? "bg-brand-600 text-white"
                      : "bg-ardoise-100 text-ardoise-700 hover:bg-ardoise-200"
                  }`}
                >
                  {m === 1 ? "Actuel" : `${m > 1 ? "+" : ""}${Math.round((m - 1) * 100)} %`}
                </button>
              );
            })}
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={1000}
          value={simulatedCA}
          onChange={(e) => setSimulatedCA(Number(e.target.value))}
          disabled={baselineCA <= 0}
          className="w-full accent-brand-600 disabled:opacity-30"
        />
      </div>

      {/* KPI list + chart (empilés dans la colonne) */}
      <div className="space-y-3">
        <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 divide-y divide-ardoise-100">
          {cards.map((c) => {
            const diff = c.after - c.before;
            const isUp = diff > 0;
            const isGood = c.isReward ? isUp : !isUp;
            return (
              <div key={c.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <p className="text-xs uppercase tracking-wide text-ardoise-500">{c.label}</p>
                <div className="flex items-baseline gap-2 text-right">
                  <p className="text-sm font-bold text-ardoise-900 font-mono">{formatCurrency(c.after)}</p>
                  {Math.abs(diff) >= 1 ? (
                    <p className={`text-xs font-medium tabular-nums font-mono ${isGood ? "text-menthe-600" : "text-alerte-600"}`}>
                      {diff > 0 ? "+" : ""}{formatCurrency(diff)}
                    </p>
                  ) : (
                    <p className="text-xs text-ardoise-400">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-4">
          <div ref={chartRef} className="w-full h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E1DBEC" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${Math.round(v / 1000)} k`} tick={{ fontSize: 11 }} width={36} />
                <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="actuel" name="Actuel" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="simule" name="Simulé" fill="#9060B6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {(loading || (baseline === null && !loading)) && (
        <p className="text-xs text-ardoise-500 text-center">
          {loading ? "Chargement…" : "Pas encore de CA encaissé cette année — aucune base de comparaison."}
        </p>
      )}
      {simLoading && <p className="text-sm text-ardoise-400 text-center">Recalcul…</p>}
      {hp?.taxRegime === "micro_bnc" && (
        <p className="text-xs text-ardoise-500 text-center">
          Régime micro-BNC : abattement forfaitaire de 34 % appliqué automatiquement sur le CA pour le calcul des cotisations.
        </p>
      )}
      </div>
    </div>
  );
}

// ── Prévision de C.A. ──

// Outils chat qui modifient le scénario → on rafraîchit le graphe quand l'un
// d'eux est exécuté depuis l'encart IA.
const MUTATING_FORECAST_TOOLS = new Set([
  "set_availability",
  "set_days_per_week",
  "add_ca_adjustment",
  "clear_ca_adjustments",
  "estimate_month_from_acts",
]);

type AiMessage = { role: "user" | "assistant"; content: string };

const CONFIDENCE_LABEL: Record<"low" | "medium" | "high", { text: string; cls: string }> = {
  high: { text: "Fiabilité élevée", cls: "bg-menthe-100 text-menthe-700" },
  medium: { text: "Fiabilité moyenne", cls: "bg-ardoise-100 text-ardoise-700" },
  low: { text: "Fiabilité faible", cls: "bg-alerte-100 text-alerte-700" },
};

function CAForecastSection({
  onApply,
  appliedCA,
}: {
  onApply: (ca: number) => void;
  appliedCA: number;
}) {
  const { dataVersion } = useAssistant();
  const [data, setData] = useState<CAForecastResult | null>(null);
  const [loading, setLoading] = useState(true);

  // Encart IA — vraie conversation (avec mémoire), pas un one-shot.
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [question, setQuestion] = useState("");

  const refetch = useCallback(() => {
    setLoading(true);
    return getCAForecastAction()
      .then((res) => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  // Recharge au montage ET quand l'assistant global a modifié le scénario.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCAForecastAction()
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dataVersion]);

  const forecast = data?.forecast ?? null;
  const baseForecast = data?.baseForecast ?? null;
  const hasScenario = data?.hasScenario ?? false;
  const monthsElapsed = data?.monthsElapsed ?? 0;
  const scenarioDelta = hasScenario && forecast && baseForecast
    ? forecast.annualProbable - baseForecast.annualProbable
    : 0;

  // Graphe mensuel : réalisé (mois révolus) vs projeté (mois à venir).
  const monthlyChart = useMemo(() => {
    if (!forecast) return [];
    return forecast.monthly.map((v, i) => ({
      name: MONTH_LABELS[i],
      ca: v,
      projete: i >= monthsElapsed,
    }));
  }, [forecast, monthsElapsed]);

  // Met à jour le contenu du dernier message (l'assistant en cours de stream).
  const setLastAssistant = useCallback((updater: (prev: string) => string) => {
    setAiMessages((prev) => prev.map((m, i) =>
      i === prev.length - 1 ? { ...m, content: updater(m.content) } : m,
    ));
  }, []);

  // Conversation en streaming (réutilise /api/chat : forecast_ca + outils scénario).
  // Envoie TOUT l'historique → Nova peut enchaîner (confirmations, suites).
  const askAI = useCallback(async (content: string) => {
    if (aiLoading) return;
    setAiLoading(true);
    const history: AiMessage[] = [...aiMessages, { role: "user", content }];
    setAiMessages([...history, { role: "assistant", content: "" }]);
    let usedMutating = false;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!response.ok || !response.body) {
        setLastAssistant(() => "Impossible de récupérer la réponse pour le moment.");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload);
            if (Array.isArray(parsed.tools) && parsed.tools.some((t: string) => MUTATING_FORECAST_TOOLS.has(t))) {
              usedMutating = true;
            }
            if (parsed.content) setLastAssistant((prev) => prev + parsed.content);
          } catch {
            // ignore
          }
        }
      }
    } catch {
      setLastAssistant(() => "Une erreur est survenue. Réessayez.");
    } finally {
      setAiLoading(false);
      // Un outil a modifié le scénario → le graphe se met à jour.
      if (usedMutating) refetch();
    }
  }, [aiLoading, aiMessages, setLastAssistant, refetch]);

  if (loading) {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-4">
        <p className="text-sm text-ardoise-400 text-center">Chargement de la prévision…</p>
      </div>
    );
  }

  // Pas assez de données : message clair, pas de faux chiffre.
  if (!forecast || forecast.basis === "insufficient") {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-4 space-y-1">
        <h3 className="text-sm font-bold text-ardoise-900">Estimation du C.A.</h3>
        <p className="text-xs text-ardoise-500">
          Historique insuffisant pour une prévision fiable. Il faut au moins une douzaine de mois
          d&apos;activité (encaissements bancaires ou bordereaux payés) pour projeter votre chiffre d&apos;affaires.
        </p>
      </div>
    );
  }

  const conf = CONFIDENCE_LABEL[forecast.confidence];
  const growth = forecast.trendGrowthRate;
  const applied = Math.abs(appliedCA - forecast.annualProbable) < 600;

  return (
    <div className="space-y-3">
      {/* Header au-dessus de la section */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-ardoise-900">Estimation du C.A. {forecast.targetYear}</h3>
          <InfoTooltip text="Estimation calculée à partir de la tendance de vos années précédentes, de la saisonnalité de votre activité et de votre chiffre d'affaires déjà réalisé cette année. Indicatif." />
        </div>
        <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${conf.cls}`}>{conf.text}</span>
      </div>

      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-4 space-y-4">
      {/* Cartes fourchette */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[12px] bg-ardoise-50 border border-ardoise-100 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-ardoise-500">Basse</p>
          <p className="text-base font-bold text-ardoise-700 font-mono">{formatCurrency(forecast.annualLow)}</p>
        </div>
        <div className="rounded-[12px] bg-brand-50 border border-brand-200 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-brand-600">Probable</p>
          <p className="text-lg font-bold text-brand-700 font-mono">{formatCurrency(forecast.annualProbable)}</p>
        </div>
        <div className="rounded-[12px] bg-ardoise-50 border border-ardoise-100 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-ardoise-500">Haute</p>
          <p className="text-base font-bold text-ardoise-700 font-mono">{formatCurrency(forecast.annualHigh)}</p>
        </div>
      </div>

      {growth != null && (
        <p className="text-xs text-ardoise-600">
          Évolution vs dernière année complète :{" "}
          <span className={`font-medium ${growth >= 0 ? "text-menthe-600" : "text-alerte-600"}`}>
            {growth >= 0 ? "+" : ""}{(growth * 100).toFixed(1)} %
          </span>
        </p>
      )}

      {hasScenario && baseForecast && (
        <div className="rounded-[12px] bg-brand-50/70 border border-brand-200 px-3 py-2 text-xs text-ardoise-700 flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-brand-700">Scénario actif</span>
          <span className="text-ardoise-500">
            sans scénario : {formatCurrency(baseForecast.annualProbable)}
          </span>
          <span className={`font-medium ${scenarioDelta >= 0 ? "text-menthe-600" : "text-alerte-600"}`}>
            ({scenarioDelta >= 0 ? "+" : ""}{formatCurrency(scenarioDelta)})
          </span>
        </div>
      )}

      {/* Graphe mensuel réalisé vs projeté */}
      <div className="w-full h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E1DBEC" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
            <YAxis tickFormatter={(v) => `${Math.round(v / 1000)} k`} tick={{ fontSize: 11 }} width={36} />
            <Tooltip
              formatter={(v, _n, item) => [formatCurrency(Number(v ?? 0)), item?.payload?.projete ? "Projeté" : "Réalisé"]}
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
            />
            <Bar dataKey="ca" radius={[4, 4, 0, 0]}>
              {monthlyChart.map((d, i) => (
                <Cell key={i} fill={d.projete ? "#C4A3DE" : "#9060B6"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 text-[11px] text-ardoise-500">
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#9060B6]" /> Réalisé</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#C4A3DE]" /> Projeté</span>
      </div>

      {/* Appliquer au simulateur — temporairement désactivé */}
      {/*
      <Button
        type="button"
        onClick={() => onApply(forecast.annualProbable)}
        disabled={applied}
        className="w-full"
      >
        {applied ? "Prévision appliquée au simulateur ✓" : "Appliquer cette prévision au simulateur"}
      </Button>
      */}

      {/* Encart IA */}
      <div className="rounded-[12px] border border-ardoise-100 bg-white/60 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-semibold text-ardoise-700">Analyse de Nova</p>
          <button
            type="button"
            onClick={() => askAI("Explique-moi ma prévision de chiffre d'affaires pour cette année : tendance, saisonnalité, mois forts et faibles, et ce que je peux en faire.")}
            disabled={aiLoading}
            className="px-2.5 py-1 text-xs font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {aiLoading ? "Analyse…" : "Expliquer ma prévision"}
          </button>
        </div>
        {aiMessages.length > 0 && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {aiMessages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : ""}>
                <span className={`inline-block text-xs whitespace-pre-wrap leading-relaxed rounded-md px-2 py-1 ${
                  m.role === "user" ? "bg-brand-100 text-brand-800" : "text-ardoise-600"
                }`}>
                  {m.content || (aiLoading && i === aiMessages.length - 1 ? "…" : "")}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && question.trim()) { askAI(question.trim()); setQuestion(""); } }}
            placeholder="Poser une question sur ma prévision…"
            disabled={aiLoading}
            className="flex-1 min-w-0 px-3 py-1.5 text-xs rounded-md border border-ardoise-200 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:opacity-40"
          />
          <button
            type="button"
            onClick={() => { if (question.trim()) { askAI(question.trim()); setQuestion(""); } }}
            disabled={aiLoading || !question.trim()}
            className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-ardoise-100 text-ardoise-700 hover:bg-ardoise-200 disabled:opacity-40"
          >
            Envoyer
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

// ── Shared components ──

function YearSelector({
  year,
  setYear,
  maxYear,
}: {
  year: number;
  setYear: (y: number | ((prev: number) => number)) => void;
  maxYear: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setYear((y) => y - 1)}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-ardoise-500 hover:text-ardoise-900 hover:bg-ardoise-100 transition-colors"
        aria-label="Année précédente"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span className="text-sm font-semibold text-ardoise-900 w-12 text-center font-mono">{year}</span>
      <button
        type="button"
        onClick={() => setYear((y) => y + 1)}
        disabled={year >= maxYear}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-ardoise-500 hover:text-ardoise-900 hover:bg-ardoise-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Année suivante"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow((v) => !v)}
        className="flex items-center justify-center w-4 h-4 rounded-full bg-ardoise-200 text-ardoise-500 hover:bg-ardoise-300 transition-colors shrink-0 cursor-help"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-ardoise-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg leading-relaxed">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ardoise-900" />
        </div>
      )}
    </div>
  );
}
