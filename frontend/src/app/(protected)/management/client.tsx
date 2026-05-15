"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useActionState, type ReactNode } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, ReferenceLine, LabelList } from "recharts";
import { getMonthlyActivityAction, getTransactionKpisAction, getCategoryTransactionsAction, type MonthlyActivityMonth, type CategoryTransaction } from "@/actions/transaction";
import { getCotisationsEstimate, type CotisationsEstimate } from "@/actions/cotisations-estimate";
import { getFiscalSituationAction, upsertFiscalSituationAction } from "@/actions/fiscal-situation";
import { getVacationsAction, upsertVacationDayAction } from "@/actions/vacations";
import { useData } from "@/providers/data-provider";
import { usePractitioner } from "@/providers/practitioner-provider";
import { buildCalendar, type PaymentPreferences, DEFAULT_PREFERENCES } from "@/lib/data/fiscal-calendar";
import { countWorkingDays, countRemainingWorkingDays } from "@/lib/data/fr-holidays";
import { computeIR, computeParts, getBareme } from "@/lib/data/fr-tax";
import { downloadCSV, downloadPDF, getChartSvg } from "@/lib/export";
import { ExportButtons } from "@/components/export-buttons";

const TABS = [
  { key: "activity", label: "Mon activité" },
  { key: "contributions", label: "Mes cotisations sociales" },
  { key: "taxes", label: "Mes impôts" },
  { key: "summary", label: "Ma synthèse" },
] as const;

type Tab = (typeof TABS)[number]["key"];

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
}

export function ManagementClient() {
  const [tab, setTab] = useState<Tab>("activity");

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-gray-100 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-1.5 pb-2.5 text-sm font-medium border-b-2 transition-all ${
              tab === t.key ? "border-brand-600 text-brand-600" : "border-transparent text-gray-400 hover:text-gray-600"
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
    </div>
  );
}

// ── Activity Tab ──

function ActivityTab() {
  const hp = usePractitioner();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({ encaissement: 0, decaissement: 0, cotisations: 0, remuneration: 0 });
  type MonthData = { name: string; revenus: number; cotisations: number; autresDepenses: number; urssaf: number; carpimko: number; chargesPro: number; retrocession: number; madelin: number; impots: number; remuneration: number };
  const [chartData, setChartData] = useState<MonthData[]>([]);
  const [vacations, setVacations] = useState<number[]>(Array(12).fill(0));
  const [depensesOpen, setDepensesOpen] = useState(false);
  const [remOpen, setRemOpen] = useState(false);

  const fetchData = useCallback(async (y: number) => {
    setLoading(true);
    const [kpiResult, monthlyResult, vacationsResult] = await Promise.all([
      getTransactionKpisAction(null, y),
      getMonthlyActivityAction(y),
      getVacationsAction(y),
    ]);
    setKpis({ encaissement: kpiResult.encaissement, decaissement: kpiResult.decaissement, cotisations: kpiResult.cotisations ?? 0, remuneration: kpiResult.remuneration ?? 0 });
    setChartData(
      monthlyResult.months.map((m) => ({
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
      })),
    );
    setVacations(vacationsResult);
    setLoading(false);
  }, []);

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

  const handleExportPdf = useCallback(() => {
    const totalCA = chartData.reduce((s, m) => s + m.revenus, 0);
    const totalDepenses = chartData.reduce((s, m) => s + m.cotisations + m.autresDepenses, 0);
    const totalRem = chartData.reduce((s, m) => s + (m.revenus - m.urssaf - m.carpimko - m.chargesPro - m.retrocession - m.madelin), 0);
    // Formate les colonnes monétaires en € pour le PDF (le CSV garde des nombres bruts).
    const rowsForPdf = exportData.rows.map((r) =>
      r.map((cell, i) => (i > 0 && i < r.length - 1 && typeof cell === "number" ? formatCurrency(cell) : cell)),
    );
    downloadPDF(`activite_${year}`, `Mon activité ${year}`, exportData.headers, rowsForPdf, {
      subtitle: `Détail mensuel ${year}`,
      chartSvg: getChartSvg(chartRef.current) ?? undefined,
      summary: [
        { label: "Chiffre d'affaires", value: formatCurrency(Math.round(totalCA)) },
        { label: "Dépenses", value: formatCurrency(Math.round(totalDepenses)) },
        { label: "Rém. avant impôt", value: formatCurrency(Math.round(totalRem)) },
      ],
    });
  }, [exportData, chartData, year]);

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

  return (
    <div>
      {/* Chart + monthly breakdown (aligned) */}
      <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] overflow-hidden">
        <div className="flex items-center justify-end gap-2 px-5 pt-4 pb-3">
          <ExportButtons
            onCsv={handleExportCsv}
            onPdf={handleExportPdf}
            disabled={loading || chartData.length === 0}
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="text-sm font-semibold text-gray-900 w-12 text-center">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              disabled={year >= currentYear}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

        <div className="pb-2 flex">
          {/* KPI cards stacked vertically */}
          <div style={{ width: 260 }} className="flex flex-col items-center px-2 py-1 shrink-0">
            <div className="w-[80%] mx-3 my-2 bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[10px] p-2.5">
              <div className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-green-600 shrink-0">
                  <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.3" />
                  <path d="M12 16V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
                  <path d="M8 12l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                </svg>
                <p className="text-xs font-medium text-gray-500 truncate">Chiffre d&apos;affaires</p>
              </div>
              {loading ? (
                <div className="h-5 bg-gray-200 rounded w-20 animate-pulse mt-1" />
              ) : (
                <p className="text-lg font-bold text-gray-900 mt-0.5">{formatCurrency(kpis.encaissement)}</p>
              )}
            </div>

            <div className="w-[80%] mx-3 my-2 bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[10px] p-2.5">
              <div>
                <div className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-red-500 shrink-0">
                    <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.3" />
                    <path d="M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
                    <path d="M16 12l-4 4-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                  </svg>
                  <p className="text-xs font-medium text-gray-500 truncate">Dépenses</p>
                </div>
                {loading ? (
                  <div className="h-5 bg-gray-200 rounded w-20 animate-pulse mt-1" />
                ) : (
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{formatCurrency(kpis.decaissement)}</p>
                )}
              </div>
              <div className="border-t border-gray-100 my-2" />
              <div>
                <div className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-orange-500 shrink-0">
                    <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.3" />
                    <path d="M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
                    <path d="M16 12l-4 4-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                  </svg>
                  <p className="text-xs font-medium text-gray-500 truncate">Dont cotisations sociales</p>
                </div>
                {loading ? (
                  <div className="h-5 bg-gray-200 rounded w-20 animate-pulse mt-1" />
                ) : (
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{formatCurrency(kpis.cotisations)}</p>
                )}
              </div>
            </div>

            <div className="w-[80%] mx-3 my-2 bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[10px] p-2.5">
              <div className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-brand-600 shrink-0">
                  <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3" />
                  <path d="M12 7v4l2.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                  <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.5" />
                </svg>
                <p className="text-xs font-medium text-gray-500 truncate">Rém. avant impôt</p>
              </div>
              {loading ? (
                <div className="h-5 bg-gray-200 rounded w-20 animate-pulse mt-1" />
              ) : (
                <p className="text-lg font-bold text-gray-900 mt-0.5">{formatCurrency(
                  chartData.reduce((s, m) => s + m.revenus - m.urssaf - m.carpimko - m.chargesPro - m.retrocession - m.madelin, 0)
                )}</p>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0" ref={chartRef}>
            {loading ? (
              <div className="h-60 bg-gray-100 rounded animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} barGap={2} barCategoryGap="20%" margin={{ left: 0, right: 0, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} hide />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={0} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                    formatter={(value, name) => {
                      const labels: Record<string, string> = { revenus: "Revenus", cotisations: "Cotisations sociales", autresDepenses: "Autres dépenses" };
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
                      const labels: Record<string, string> = { revenus: "Revenus", cotisations: "Cotisations sociales", autresDepenses: "Autres dépenses" };
                      return labels[value] ?? value;
                    }}
                  />
                  <Bar dataKey="revenus" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="autresDepenses" stackId="depenses" fill="#ef4444" />
                  <Bar dataKey="cotisations" stackId="depenses" fill="#f97316" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {!loading && (
          <div className="border-t border-gray-100 text-xs">
              {/* Header */}
              <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                <div className="px-3 py-3.5" />
                {chartData.map((m) => (
                  <div key={m.name} className="py-3.5 text-center font-semibold text-gray-500">{m.name}</div>
                ))}
              </div>
              {/* CA */}
              <div className="grid border-b border-gray-50" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                <div className="px-3 py-3.5 text-sm font-semibold text-gray-700">Chiffre d&apos;affaires</div>
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
                      <div key={m.name} className="py-3.5 text-center font-medium text-gray-700">
                        {m.revenus > 0 ? formatCurrency(m.revenus) : "—"}
                      </div>
                    );
                  }

                  // No daily rate yet → no simulation possible.
                  if (dailyRate <= 0) {
                    return (
                      <div key={m.name} className="py-3.5 text-center font-medium text-gray-700">
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
                      <div key={m.name} className="py-3.5 text-center font-medium text-gray-400 italic">
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
                      <div key={m.name} className="py-3.5 text-center font-medium text-gray-700">
                        {total > 0 ? <>~{formatCurrency(total)}</> : formatCurrency(0)}
                      </div>
                    );
                  }

                  return <div key={m.name} className="py-3.5 text-center font-medium text-gray-300">—</div>;
                })}
              </div>
              {/* Dépenses */}
              <div
                className="grid border-b border-gray-50 cursor-pointer hover:bg-gray-50/50 transition-colors"
                style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}
                onClick={() => setDepensesOpen((v) => !v)}
              >
                <div className="px-3 py-3.5 text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  Dépenses
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-gray-400 transition-transform ${depensesOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
                </div>
                {chartData.map((m) => {
                  const dep = m.cotisations + m.autresDepenses;
                  return (
                    <div key={m.name} className="py-3.5 text-center font-medium text-gray-700">
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
                    <div key={sub.key} className="grid border-b border-gray-50 bg-gray-50/30" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                      <div className="pl-7 pr-3 py-2.5 text-xs font-medium text-gray-500">{sub.label}</div>
                      {chartData.map((m) => {
                        const val = m[sub.key];
                        return (
                          <div key={m.name} className="py-2.5 text-center text-xs font-medium text-gray-500">
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
                className="grid border-b border-gray-50 cursor-pointer hover:bg-gray-50/50 transition-colors"
                style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}
                onClick={() => setRemOpen((v) => !v)}
              >
                <div className="px-3 py-3.5 text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  Rém. avant impôt
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-gray-400 transition-transform ${remOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
                </div>
                {chartData.map((m) => {
                  const charges = m.urssaf + m.carpimko + m.chargesPro + m.retrocession + m.madelin;
                  const res = m.revenus - charges;
                  const empty = m.revenus === 0 && charges === 0;
                  return (
                    <div key={m.name} className={`py-3.5 text-center font-medium ${empty ? "text-gray-300" : res >= 0 ? "text-gray-900" : "text-red-500"}`}>
                      {empty ? "—" : formatCurrency(res)}
                    </div>
                  );
                })}
              </div>
              {/* Sub-rows rém. avant impôt */}
              {remOpen && (
                <>
                  <div className="grid border-b border-gray-50 bg-gray-50/30" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                    <div className="pl-7 pr-3 py-2.5 text-xs font-medium text-gray-500">Rémunération versée</div>
                    {chartData.map((m) => (
                      <div key={m.name} className="py-2.5 text-center text-xs font-medium text-gray-500">
                        {m.remuneration > 0 ? formatCurrency(m.remuneration) : "—"}
                      </div>
                    ))}
                  </div>
                  <div className="grid border-b border-gray-50 bg-gray-50/30" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                    <div className="pl-7 pr-3 py-2.5 text-xs font-medium text-gray-500">Provision d&apos;impôt estimée</div>
                    {chartData.map((m, i) => {
                      const isFuture = year > currentYear || (year === currentYear && i >= currentMonth);
                      // Past months: show real tax transactions
                      if (!isFuture) {
                        return (
                          <div key={m.name} className="py-2.5 text-center text-xs font-medium text-gray-500">
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
                        <div key={m.name} className="py-2.5 text-center text-xs font-medium text-gray-400 italic">
                          {estimated > 0 ? `~${formatCurrency(estimated)}` : "—"}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {/* Vacances */}
              <div className="grid" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                <div className="px-3 py-3.5 text-sm font-semibold text-gray-700">Vacances (jours)</div>
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
                        className="w-10 text-center text-xs font-medium text-gray-700 border border-gray-200 rounded hover:border-gray-300 focus:border-brand-500 focus:outline-none bg-transparent transition-colors py-1 disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed disabled:hover:border-gray-200"
                      />
                    </div>
                  );
                })}
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
  const { facturationSummary } = useData();
  const [estimate, setEstimate] = useState<CotisationsEstimate | null>(null);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState<{ urssaf: number; carpimko: number }[]>(Array(12).fill({ urssaf: 0, carpimko: 0 }));

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const totalCA = useMemo(() => {
    if (!facturationSummary) return 0;
    return facturationSummary.byStatus.paye.total;
  }, [facturationSummary]);

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

  // Load estimate (only once, independent of year)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    if (totalCA <= 0) { setCardsLoading(false); return; }
    getCotisationsEstimate(totalCA).then((est) => {
      if (est) setEstimate(est);
      setCardsLoading(false);
    }).catch(() => setCardsLoading(false));
  }, [totalCA]);

  // Load monthly data (depends on year)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setTableLoading(true);
    getMonthlyActivityAction(year).then((monthly) => {
      if (monthly.months) {
        setMonthlyData(monthly.months.map((m) => ({ urssaf: m.urssaf, carpimko: m.carpimko })));
      }
      setTableLoading(false);
    }).catch(() => setTableLoading(false));
  }, [year]);

  // Totals réels (déjà versés) pour l'année sélectionnée
  const { totalUrssafReel, totalCarpimkoReel } = useMemo(() => {
    const u = monthlyData.reduce((s, m) => s + m.urssaf, 0);
    const c = monthlyData.reduce((s, m) => s + m.carpimko, 0);
    return { totalUrssafReel: u, totalCarpimkoReel: c };
  }, [monthlyData]);

  const isPastYear = year < currentYear;

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
      const canEstimate = year > currentYear || (year === currentYear && i >= new Date().getMonth());
      const estUrssaf = canEstimate ? (estimatedMonths[i]?.urssaf ?? 0) : 0;
      const estCarpimko = canEstimate ? (estimatedMonths[i]?.carpimko ?? 0) : 0;
      const urssaf = reelUrssaf > 0 ? reelUrssaf : estUrssaf;
      const carpimko = reelCarpimko > 0 ? reelCarpimko : estCarpimko;
      const isReel = reelUrssaf > 0 || reelCarpimko > 0;
      return [m, Math.round(urssaf), Math.round(carpimko), Math.round(urssaf + carpimko), isReel ? "Réel" : (urssaf + carpimko > 0 ? "Estimé" : "—")];
    });
    downloadCSV(`cotisations_${year}`, headers, rows);
  }, [monthlyData, estimatedMonths, year, currentYear]);

  const handleExportCotisationsPdf = useCallback(() => {
    const headers = ["Mois", "URSSAF", "CARPIMKO", "Total", "Type"];
    const rows = MONTH_LABELS.map((m, i) => {
      const reelUrssaf = monthlyData[i]?.urssaf ?? 0;
      const reelCarpimko = monthlyData[i]?.carpimko ?? 0;
      const canEstimate = year > currentYear || (year === currentYear && i >= new Date().getMonth());
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
    const totalUrssaf = totalUrssafReel || (estimate?.urssafAnnuel ?? 0);
    const totalCarpimko = totalCarpimkoReel || (estimate?.carpimkoAnnuel ?? 0);
    downloadPDF(`cotisations_${year}`, `Mes cotisations sociales ${year}`, headers, rows, {
      subtitle: isPastYear ? `Cotisations versées en ${year}` : `Estimation des cotisations ${year}`,
      summary: [
        { label: "URSSAF", value: `${isPastYear ? "" : "~"}${formatCurrency(Math.round(totalUrssaf))}` },
        { label: "CARPIMKO", value: `${isPastYear ? "" : "~"}${formatCurrency(Math.round(totalCarpimko))}` },
        { label: "Total", value: `${isPastYear ? "" : "~"}${formatCurrency(Math.round(totalUrssaf + totalCarpimko))}` },
      ],
    });
  }, [monthlyData, estimatedMonths, year, currentYear, isPastYear, totalUrssafReel, totalCarpimkoReel, estimate]);

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
      {/* Cards */}
      <div className="grid grid-cols-2 gap-6">
        {/* URSSAF */}
        <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-6">
          <div className="flex items-center gap-4 mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-urssaf.svg" alt="URSSAF" className="h-8" />
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs text-gray-400">
              {isPastYear ? `Cotisations versées en ${year}` : `Montant total estimé des cotisations ${year}`}
            </p>
            <InfoTooltip text={isPastYear
              ? `Somme des prélèvements Urssaf effectivement débités sur vos comptes en ${year}.`
              : `Montant total estimé de vos cotisations Urssaf à payer en ${year}, réduit du remboursement estimé (régularisation négative) au titre de ${year - 1}.`}
            />
          </div>
          {(isPastYear ? tableLoading : cardsLoading) ? (
            <div className="h-8 bg-gray-200 rounded w-28 animate-pulse mb-4" />
          ) : (
            <p className="text-2xl font-bold text-gray-900 mb-4">
              {isPastYear
                ? (totalUrssafReel > 0 ? formatCurrency(totalUrssafReel) : "—")
                : (estimate ? `~${formatCurrency(estimate.urssafAnnuel)}` : "—")}
            </p>
          )}
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs text-gray-400">{isPastYear ? "Nombre de prélèvements" : "Montant par échéance"}</p>
            <InfoTooltip text={isPastYear
              ? `Nombre de prélèvements Urssaf passés sur vos comptes en ${year}.`
              : `Estimation du montant prélevé à chaque échéance Urssaf en ${year}.`}
            />
          </div>
          {(isPastYear ? tableLoading : cardsLoading) ? (
            <div className="h-8 bg-gray-200 rounded w-28 animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-gray-900">
              {isPastYear
                ? (monthlyData.filter((m) => m.urssaf > 0).length > 0
                    ? `${monthlyData.filter((m) => m.urssaf > 0).length} prélèvements`
                    : "—")
                : (estimate ? `~${formatCurrency(estimate.urssafParEcheance)}` : "—")}
            </p>
          )}
        </div>

        {/* CARPIMKO */}
        <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-6">
          <div className="flex items-center gap-4 mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-carpimko.png" alt="CARPIMKO" className="h-8" />
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs text-gray-400">
              {isPastYear ? `Cotisations versées en ${year}` : `Montant total estimé des cotisations ${year}`}
            </p>
            <InfoTooltip text={isPastYear
              ? `Somme des prélèvements Carpimko effectivement débités sur vos comptes en ${year}.`
              : `Montant total estimé de vos cotisations Carpimko à payer en ${year}, intégrant la régularisation estimée au titre de ${year - 1}.`}
            />
          </div>
          {(isPastYear ? tableLoading : cardsLoading) ? (
            <div className="h-8 bg-gray-200 rounded w-28 animate-pulse mb-4" />
          ) : (
            <p className="text-2xl font-bold text-gray-900 mb-4">
              {isPastYear
                ? (totalCarpimkoReel > 0 ? formatCurrency(totalCarpimkoReel) : "—")
                : (estimate ? `~${formatCurrency(estimate.carpimkoAnnuel)}` : "—")}
            </p>
          )}
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs text-gray-400">{isPastYear ? "Nombre de prélèvements" : "Montant par échéance"}</p>
            <InfoTooltip text={isPastYear
              ? `Nombre de prélèvements Carpimko passés sur vos comptes en ${year}.`
              : `Estimation du montant prélevé à chaque échéance Carpimko en ${year}.`}
            />
          </div>
          {(isPastYear ? tableLoading : cardsLoading) ? (
            <div className="h-8 bg-gray-200 rounded w-28 animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-gray-900">
              {isPastYear
                ? (monthlyData.filter((m) => m.carpimko > 0).length > 0
                    ? `${monthlyData.filter((m) => m.carpimko > 0).length} prélèvements`
                    : "—")
                : (estimate ? `~${formatCurrency(estimate.carpimkoParEcheance)}` : "—")}
            </p>
          )}
        </div>
      </div>

      {/* Monthly table */}
      <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-base font-semibold text-gray-900">Détail mensuel</h2>
        </div>
        {tableLoading ? (
          <div className="px-5 pb-5">
            <div className="h-32 bg-gray-100 rounded animate-pulse" />
          </div>
        ) : (
          <div className="border-t border-gray-100 text-xs">
            {/* Header */}
            <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
              <div className="px-3 py-3.5" />
              {MONTH_LABELS.map((m) => (
                <div key={m} className="py-3.5 text-center font-semibold text-gray-500">{m}</div>
              ))}
            </div>
            {/* URSSAF */}
            <div className="grid border-b border-gray-50" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
              <div className="px-3 py-3.5 flex items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-urssaf.svg" alt="URSSAF" className="h-5" />
              </div>
              {monthlyData.map((m, i) => {
                const reel = m.urssaf;
                const canEstimate = year > currentYear || (year === currentYear && i >= new Date().getMonth());
                const est = canEstimate ? (estimatedMonths[i]?.urssaf ?? 0) : 0;
                if (reel > 0) {
                  return <div key={i} className="py-3.5 text-center font-medium text-gray-700">{formatCurrency(reel)}</div>;
                }
                if (est > 0) {
                  return <div key={i} className="py-3.5 text-center font-medium text-gray-400 italic">~{formatCurrency(est)}</div>;
                }
                return <div key={i} className="py-3.5 text-center font-medium text-gray-300">—</div>;
              })}
            </div>
            {/* CARPIMKO */}
            <div className="grid border-b border-gray-50" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
              <div className="px-3 py-3.5 flex items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-carpimko.png" alt="CARPIMKO" className="h-5" />
              </div>
              {monthlyData.map((m, i) => {
                const reel = m.carpimko;
                const canEstimate = year > currentYear || (year === currentYear && i >= new Date().getMonth());
                const est = canEstimate ? (estimatedMonths[i]?.carpimko ?? 0) : 0;
                if (reel > 0) {
                  return <div key={i} className="py-3.5 text-center font-medium text-gray-700">{formatCurrency(reel)}</div>;
                }
                if (canEstimate) {
                  return <div key={i} className="py-3.5 text-center font-medium text-gray-400 italic">{est > 0 ? `~${formatCurrency(est)}` : "0 €"}</div>;
                }
                return <div key={i} className="py-3.5 text-center font-medium text-gray-300">—</div>;
              })}
            </div>
            {/* Total */}
            <div className="grid" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
              <div className="px-3 py-3.5 text-sm font-semibold text-gray-900">Total</div>
              {monthlyData.map((m, i) => {
                const reelTotal = m.urssaf + m.carpimko;
                const canEstimate = year > currentYear || (year === currentYear && i >= new Date().getMonth());
                const estTotal = canEstimate ? ((estimatedMonths[i]?.urssaf ?? 0) + (estimatedMonths[i]?.carpimko ?? 0)) : 0;
                const hasReel = reelTotal > 0;
                const value = hasReel ? reelTotal : estTotal;
                if (value > 0) {
                  return (
                    <div key={i} className={`py-3.5 text-center font-semibold ${hasReel ? "text-gray-900" : "text-gray-400 italic"}`}>
                      {hasReel ? formatCurrency(value) : `~${formatCurrency(value)}`}
                    </div>
                  );
                }
                return <div key={i} className="py-3.5 text-center font-semibold text-gray-300">—</div>;
              })}
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
    <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && transactions.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-gray-400">Total {year}</p>
              <p className="text-base font-bold text-gray-900">{formatCurrency(total)}</p>
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
          <div className="h-32 bg-gray-100 rounded animate-pulse" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="px-6 pb-6 text-sm text-gray-400">
          Aucune transaction enregistrée en {year} pour les catégories concernées.
        </div>
      ) : (
        <div className="border-t border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500">
                <th className="text-left px-6 py-3">Date</th>
                <th className="text-left px-3 py-3">Libellé</th>
                <th className="text-left px-3 py-3">Catégorie</th>
                <th className="text-right px-6 py-3">Montant</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-3 text-gray-700 whitespace-nowrap">{formatTransactionDate(t.date)}</td>
                  <td className="px-3 py-3 text-gray-900 truncate max-w-[420px]" title={t.cleanDescription ?? t.description}>
                    {t.cleanDescription ?? t.description}
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {CATEGORY_LABELS[t.category] ?? t.category}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
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

  // Load monthly activity + vacations for the selected year
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setMonthlyLoading(true);
    Promise.all([getMonthlyActivityAction(year), getVacationsAction(year)])
      .then(([m, v]) => {
        setMonthly(m.months);
        setVacations(v);
        setMonthlyLoading(false);
      })
      .catch(() => setMonthlyLoading(false));
  }, [year]);

  // For future years with no data yet, fall back on the current year as reference for daily rate
  useEffect(() => {
    if (year <= currentYear) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when no projection is needed
      setPastReference(null);
      return;
    }
    getMonthlyActivityAction(currentYear).then((m) => setPastReference(m.months)).catch(() => {});
  }, [year, currentYear]);

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
    });
  }, [situation, enfants, isSingleParent, autresRevenus, parts, hp, isProjected, revenuBNC, revenuImposable, currentTranche, ir, pasAnnuel, regularisation, year, declaredIr]);

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
    <div className="grid grid-cols-2 gap-6">
      {/* Ma situation fiscale */}
      <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-6">
        <div className="mb-5">
          <h3 className="text-base font-semibold text-gray-900">Ma situation fiscale</h3>
        </div>
        <form action={saveAction} className="space-y-4">
          <input type="hidden" name="year" value={year} />
          <div>
            <label className="block text-sm text-gray-500 mb-1.5">Situation conjugale</label>
            <select
              name="maritalStatus"
              value={situation}
              onChange={(e) => setSituation(e.target.value as "celibataire" | "marie" | "pacse")}
              className="w-full border border-gray-200 bg-transparent px-3 py-2 rounded-md text-sm transition-all hover:border-gray-400 focus:border-gray-900 focus:outline-none appearance-none cursor-pointer"
            >
              <option value="celibataire">Célibataire</option>
              <option value="marie">Marié(e)</option>
              <option value="pacse">Pacsé(e)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1.5">Nombre d&apos;enfants à charge</label>
            <input
              type="number"
              name="dependentChildren"
              min="0"
              max="20"
              value={enfants}
              onChange={(e) => setEnfants(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full border border-gray-200 bg-transparent px-3 py-2 rounded-md text-sm transition-all hover:border-gray-400 focus:border-gray-900 focus:outline-none"
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
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="isSingleParent" className="text-sm text-gray-700 leading-tight">
                Parent isolé (case T)
                <span className="block text-xs text-gray-400 mt-0.5">
                  Vous vivez seul(e) et élevez seul(e) votre/vos enfant(s). Donne droit à une demi-part supplémentaire.
                </span>
              </label>
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-500 mb-1.5">Autres revenus BNC ou salariés du foyer en {year}</label>
            <div className="relative">
              <input
                type="number"
                name="otherIncome"
                min="0"
                step="100"
                value={autresRevenus || ""}
                onChange={(e) => setAutresRevenus(Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="0"
                className="w-full border border-gray-200 bg-transparent px-3 py-2 pr-8 rounded-md text-sm transition-all hover:border-gray-400 focus:border-gray-900 focus:outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">€</span>
            </div>
            <p className="mt-1 text-xs text-gray-400">Revenus nets imposables du conjoint ou autres activités.</p>
          </div>
          {year < currentYear && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <label className="block text-sm text-gray-500">IR réel de mon avis d&apos;imposition {year}</label>
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
                  className="w-full border border-gray-200 bg-transparent px-3 py-2 pr-8 rounded-md text-sm transition-all hover:border-gray-400 focus:border-gray-900 focus:outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">€</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">À renseigner après réception de votre avis (août {year + 1}).</p>
            </div>
          )}
          <div className="pt-2 border-t border-gray-100 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Nombre de parts fiscales</span>
              <span className="font-semibold text-gray-900">{parts}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500">{hp?.taxRegime === "micro_bnc" ? "BNC après abattement 34 %" : "Bénéfice BNC estimé"}</span>
                <InfoTooltip text={hp?.taxRegime === "micro_bnc"
                  ? "Régime micro-BNC : les recettes annuelles sont diminuées d'un abattement forfaitaire de 34 %."
                  : "Régime déclaration contrôlée : bénéfice = recettes encaissées - charges déductibles (URSSAF, CARPIMKO, charges pro, rétrocession, Madelin)."} />
              </div>
              <span className={`font-semibold ${isProjected ? "text-gray-500 italic" : "text-gray-900"}`}>
                {monthlyLoading ? "…" : `${isProjected ? "~" : ""}${formatCurrency(revenuBNC)}`}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Revenu imposable du foyer</span>
              <span className={`font-semibold ${isProjected ? "text-gray-500 italic" : "text-gray-900"}`}>
                {monthlyLoading ? "…" : `${isProjected ? "~" : ""}${formatCurrency(revenuImposable)}`}
              </span>
            </div>
          </div>

          {saveState?.error && (
            <p className="bg-red-50 p-3 rounded-md text-sm text-red-600">{saveState.error}</p>
          )}
          {saveState?.success && (
            <p className="bg-green-50 p-3 rounded-md text-sm text-green-600">Situation fiscale enregistrée.</p>
          )}

          <button
            type="submit"
            disabled={saving || !dbLoaded}
            className="flex items-center gap-2 bg-gray-900 px-5 py-3 rounded-md text-sm font-medium text-white transition-all hover:bg-black active:scale-[0.98] disabled:bg-gray-300 disabled:opacity-60 disabled:hover:bg-gray-300 disabled:active:scale-100 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </form>
      </div>

      {/* Mon imposition estimée */}
      <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-5">Mon imposition estimée</h3>
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-xs text-gray-400">Impôt estimé sur les revenus {year}</p>
              <InfoTooltip text={`Estimation de l'impôt sur le revenu calculée avec le barème progressif applicable aux revenus ${year} (loi de finances ${year + 1}), votre situation familiale et le quotient familial${ir.plafonneQf ? " (plafonné)" : ""}.`} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{monthlyLoading ? "…" : formatCurrency(ir.impot)}</p>
            {ir.plafonneQf && (
              <p className="text-xs text-orange-600 mt-1">Quotient familial plafonné — gain limité par demi-part supplémentaire.</p>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-xs text-gray-400">Régularisation {year} payée en {year + 1}</p>
              <InfoTooltip text={`Différence entre l'impôt estimé et le PAS prélevé. PAS BNC : acomptes réellement prélevés (transactions catégorisées « Impôts » : ${formatCurrency(pasYtdReel)} à date)${year >= currentYear ? ` + projection au taux ${(pasRate * 100).toFixed(1)} % pour les mois restants` : ""}. PAS conjoint : approximation au même taux. Positif = complément à payer (sept-déc ${year + 1}), négatif = remboursement (été ${year + 1}).`} />
            </div>
            <p className={`text-2xl font-bold ${regularisation >= 0 ? "text-red-500" : "text-green-600"}`}>
              {monthlyLoading ? "…" : `${regularisation >= 0 ? "+" : ""}${formatCurrency(regularisation)}`}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              IR estimé {formatCurrency(ir.impot)} − PAS {formatCurrency(pasAnnuel)}
              {pasYtdReel > 0 && ` (dont ${formatCurrency(pasYtdReel)} déjà prélevés)`}
            </p>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-900 mb-1">Tranche marginale d&apos;imposition</p>
            <p className="text-xs text-gray-400 mb-3">
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
                      isPast ? "bg-brand-600" : isActive ? "bg-brand-200" : "bg-gray-100"
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
            <div className="flex text-[10px] font-medium text-gray-400">
              {bareme.map((t, i) => (
                <div key={t.rate} className={`flex-1 text-center ${i === ir.currentTrancheIndex ? "text-brand-600 font-bold" : ""}`}>
                  {t.rate} %
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-gray-500">Taux moyen</span>
              <span className="text-sm font-bold text-gray-900">{ir.tauxMoyen} %</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm text-gray-500">Tranche marginale</span>
              <span className="text-sm font-bold text-gray-900">{currentTranche.rate} %</span>
            </div>
          </div>

          {/* Comparaison estimé vs avis d'imposition réel (uniquement si saisi pour une année passée) */}
          {year < currentYear && declaredIr.trim() !== "" && (() => {
            const declared = parseFloat(declaredIr.replace(",", "."));
            if (isNaN(declared)) return null;
            const ecart = declared - ir.impot;
            return (
              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <p className="text-sm font-medium text-gray-900">IR réel vs estimation</p>
                  <InfoTooltip text="Un écart négatif signifie que votre avis d'imposition est inférieur à l'estimation de l'app — probablement à cause de crédits ou réductions (dons, garde d'enfant, etc.) non pris en compte." />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">IR déclaré</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(declared)}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-gray-500">Écart estimé / réel</span>
                  <span className={`font-semibold ${ecart >= 0 ? "text-red-500" : "text-green-600"}`}>
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
  const { facturationSummary, accounts, transactionsLoading } = useData();
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;
  const irYear = prevYear; // IR de N (déclaré et soldé en N+1)
  const irPrevYear = irYear - 1;

  const [loading, setLoading] = useState(true);
  const [estimate, setEstimate] = useState<CotisationsEstimate | null>(null);
  const [monthlyData, setMonthlyData] = useState<{
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

  const totalCA = facturationSummary?.byStatus.paye.total ?? 0;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setLoading(true);
    Promise.all([
      getCotisationsEstimate(totalCA),
      getMonthlyActivityAction(currentYear),
      getMonthlyActivityAction(prevYear),
      getFiscalSituationAction(prevYear),
    ]).then(([est, currentMonthly, prevMonthly, prevFiscal]) => {
      setEstimate(est);
      setMonthlyData(currentMonthly.months.map((m) => ({
        urssaf: m.urssaf,
        carpimko: m.carpimko,
        autresDepenses: m.autresDepenses,
        chargesPro: m.chargesPro,
        retrocession: m.retrocession,
        madelin: m.madelin,
      })));
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
    }).catch(() => setLoading(false));
  }, [totalCA, currentYear, prevYear]);

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
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
        </svg>
      ),
    },
    {
      key: "ch", title: "Charges pro.", year: currentYear, value: annualChargesPro, prevYear, prevValue: null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>
        </svg>
      ),
    },
    {
      key: "cot", title: "Cotisations sociales", year: currentYear, value: annualCotisations, prevYear, prevValue: null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ),
    },
    {
      key: "rem", title: "Rémunération avant impôt", year: currentYear, value: annualRemAvantImpot, prevYear, prevValue: null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4z"/>
        </svg>
      ),
    },
    {
      key: "ir", title: "Impôt sur le revenu", year: irYear, value: irPrev, prevYear: irPrevYear, prevValue: null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
        </svg>
      ),
    },
  ];

  const chartData = [
    { key: "treso", name: "Trésorerie actuelle", value: Math.round(defaultBalance) },
    ...(includeRegul ? [{ key: "regul", name: `Régularisation ${currentYear}`, value: Math.round(regulImpact) }] : []),
    { key: "antic", name: "Anticipation 3 mois", value: Math.round(anticipation) },
  ];

  const formatSigned = (v: number) => `${v > 0 ? "+" : ""}${formatCurrency(v)}`;
  const isLoading = loading || transactionsLoading;

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Trésorerie prévisionnelle */}
      <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-6">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="text-base font-semibold text-gray-900">Trésorerie prévisionnelle</h3>
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setIncludeRegul(true)}
              className={`px-3 py-1.5 rounded-md transition-colors ${includeRegul ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Prévoir la régularisation
            </button>
            <button
              type="button"
              onClick={() => setIncludeRegul(false)}
              className={`px-3 py-1.5 rounded-md transition-colors ${!includeRegul ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Ne pas prévoir
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="h-64 bg-gray-100 rounded animate-pulse" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 24, right: 12, bottom: 40, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={20}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${(v / 1000).toFixed(1)}k`}
                  width={40}
                />
                <ReferenceLine y={0} stroke="#1f2937" strokeWidth={1.5} />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
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
                    style={{ fontSize: 11, fontWeight: 600, fill: "#1f2937" }}
                  />
                  {chartData.map((d) => (
                    <Cell key={d.key} fill={d.value >= 0 ? "#22c55e" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-6 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-1.5 mb-1">
                <p className="text-xs text-gray-400">Solde de trésorerie prévisionnelle</p>
                <InfoTooltip text={includeRegul
                  ? `Solde hypothétique après avoir anticipé votre régularisation d'Urssaf et de Carpimko ${currentYear} (ajustée en ${currentYear + 1}) ainsi que 3 mois de vos frais professionnels.`
                  : `Solde hypothétique après avoir anticipé 3 mois de vos frais professionnels (sans tenir compte de la régularisation ${currentYear}).`} />
              </div>
              <p className={`text-3xl font-bold ${solde >= 0 ? "text-gray-900" : "text-red-500"}`}>
                {formatSigned(solde)}
              </p>
            </div>

            <p className="mt-4 text-xs text-gray-500 leading-relaxed">
              {includeRegul
                ? <>Solde de trésorerie hypothétique après avoir anticipé votre régularisation d&apos;Urssaf et de Carpimko {currentYear} (ajustée en {currentYear + 1}) ainsi que 3 mois de vos frais professionnels.</>
                : <>Solde de trésorerie hypothétique après avoir anticipé 3 mois de vos frais professionnels. La régularisation {currentYear} n&apos;est pas prise en compte.</>}
            </p>
            <p className="mt-2 text-xs text-gray-500 leading-relaxed">
              Un montant positif indique une trésorerie suffisante pour couvrir ces dépenses à venir.
            </p>
          </>
        )}
      </div>

      {/* Métriques annuelles N vs N-1 */}
      <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-6">
        {isLoading ? (
          <div className="h-96 bg-gray-100 rounded animate-pulse" />
        ) : (
          <div className="divide-y divide-gray-100">
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
                  <p className="text-sm font-medium text-gray-900 flex-1 min-w-0">{m.title}</p>
                  {/* Years + bars stacked */}
                  <div className="flex flex-col gap-2 w-[55%] shrink-0">
                    {/* Year N */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-gray-500 w-10 shrink-0">{m.year}</span>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-600 rounded-full transition-all" style={{ width: `${pctN}%` }} />
                      </div>
                      <div className="w-20 text-right shrink-0 leading-tight">
                        <p className="text-[10px] text-gray-400 italic">Prévision</p>
                        <p className="text-[12px] font-semibold text-gray-900">{formatCurrency(m.value)}</p>
                      </div>
                    </div>
                    {/* Year N-1 */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-gray-400 w-10 shrink-0">{m.prevYear}</span>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gray-300 rounded-full transition-all" style={{ width: `${pctNm1}%` }} />
                      </div>
                      <div className="w-20 text-right shrink-0 leading-tight">
                        <p className="text-[10px] italic">&nbsp;</p>
                        <p className="text-[12px] font-semibold text-gray-300">{m.prevValue != null ? formatCurrency(m.prevValue) : "—"}</p>
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
        className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        aria-label="Année précédente"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span className="text-sm font-semibold text-gray-900 w-12 text-center">{year}</span>
      <button
        type="button"
        onClick={() => setYear((y) => y + 1)}
        disabled={year >= maxYear}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Année suivante"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
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
        className="flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300 transition-colors shrink-0 cursor-help"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg leading-relaxed">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}
