"use client";

import { useEffect, useMemo, useState } from "react";
import { usePractitioner } from "@/providers/practitioner-provider";
import { useData } from "@/providers/data-provider";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  en_attente: { label: "En attente", color: "text-amber-700", bg: "bg-amber-50" },
  paye: { label: "Payé", color: "text-green-700", bg: "bg-green-50" },
  rejete: { label: "Rejeté", color: "text-red-700", bg: "bg-red-50" },
};

// Normalise les statuts internes en statuts affichés
function displayStatus(status: string): string {
  if (status === "a_securiser" || status === "a_envoyer") return "en_attente";
  return status;
}

import type { CarePassageRow, RejectionStats } from "@/actions/facturation";
import { downloadCSV, downloadPDF } from "@/lib/export";

export function FacturationClient() {
  const hp = usePractitioner();
  const { facturationPassages: passages, facturationSummary: summary, facturationLoading: loading } = useData();
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPractice, setFilterPractice] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortColumn, setSortColumn] = useState<string>("careDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [chartYear, setChartYear] = useState(new Date().getFullYear());
  const [compareMode, setCompareMode] = useState(false);
  const [compareStatus, setCompareStatus] = useState<"paye" | "en_attente" | "rejete">("paye");
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  // Unique practices
  const practiceOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of passages) {
      map.set(p.practiceId, p.practiceName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [passages]);

  // Filtered passages
  const filteredPassages = useMemo(() => {
    return passages.filter((p) => {
      if (filterStatus && displayStatus(p.status) !== filterStatus) return false;
      if (filterPractice && p.practiceId !== filterPractice) return false;
      if (dateFrom && p.careDate < dateFrom) return false;
      if (dateTo && p.careDate > dateTo) return false;
      return true;
    });
  }, [passages, filterStatus, filterPractice, dateFrom, dateTo]);

  // Sorted passages
  const sortedPassages = useMemo(() => {
    return [...filteredPassages].sort((a, b) => {
      const col = sortColumn as keyof CarePassageRow;
      let valA = a[col] ?? "";
      let valB = b[col] ?? "";

      // Numeric columns
      if (["baseAmount", "adj1", "adj2", "adj3", "totalAmount"].includes(sortColumn)) {
        const numA = parseFloat(valA as string);
        const numB = parseFloat(valB as string);
        return sortDirection === "asc" ? numA - numB : numB - numA;
      }

      // String comparison
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredPassages, sortColumn, sortDirection]);

  function toggleSort(column: string) {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  // Reset page when filters change
  const filterKey = `${filterStatus}-${filterPractice}-${dateFrom}-${dateTo}`;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset pagination on filter change
    setPage(1);
  }, [filterKey]);

  // Filtered totals
  const filteredTotal = useMemo(() => {
    return filteredPassages.reduce((s, p) => s + parseFloat(p.totalAmount), 0);
  }, [filteredPassages]);

  const totalPages = Math.max(1, Math.ceil(sortedPassages.length / PER_PAGE));
  const paginatedPassages = useMemo(() => {
    const start = (page - 1) * PER_PAGE;
    return sortedPassages.slice(start, start + PER_PAGE);
  }, [sortedPassages, page]);

  const MONTH_NAMES = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

  const chartData = useMemo(() => {
    type MonthBucket = {
      key: string; label: string;
      en_attente: number; paye: number; rejete: number; total: number;
      en_attente_prev: number; paye_prev: number; rejete_prev: number; total_prev: number;
    };
    const months: MonthBucket[] = [];

    for (let i = 0; i < 12; i++) {
      months.push({
        key: `${chartYear}-${String(i + 1).padStart(2, "0")}`,
        label: MONTH_NAMES[i],
        en_attente: 0, paye: 0, rejete: 0, total: 0,
        en_attente_prev: 0, paye_prev: 0, rejete_prev: 0, total_prev: 0,
      });
    }

    const monthMap = new Map(months.map((m) => [m.key, m]));
    const prevYear = chartYear - 1;

    for (const p of passages) {
      const [y, m] = p.careDate.split("-");
      const status = displayStatus(p.status);
      const amount = parseFloat(p.totalAmount);

      // Année N
      const bucket = monthMap.get(`${y}-${m}`);
      if (bucket && status in bucket) {
        (bucket as unknown as Record<string, number>)[status] += amount;
      }

      // Année N-1
      if (y === String(prevYear)) {
        const prevBucket = months[parseInt(m!) - 1];
        if (prevBucket) {
          (prevBucket as unknown as Record<string, number>)[`${status}_prev`] += amount;
        }
      }
    }

    for (const m of months) {
      m.en_attente = Math.round(m.en_attente * 100) / 100;
      m.paye = Math.round(m.paye * 100) / 100;
      m.rejete = Math.round(m.rejete * 100) / 100;
      m.total = m.en_attente + m.paye + m.rejete;
      m.en_attente_prev = Math.round(m.en_attente_prev * 100) / 100;
      m.paye_prev = Math.round(m.paye_prev * 100) / 100;
      m.rejete_prev = Math.round(m.rejete_prev * 100) / 100;
      m.total_prev = m.en_attente_prev + m.paye_prev + m.rejete_prev;
    }

    return months;
  }, [passages, chartYear]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-5 animate-pulse">
          <div className="h-3 bg-gray-200 rounded w-24 mb-3" />
          <div className="h-6 bg-gray-200 rounded w-32" />
        </div>
        <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-5 animate-pulse">
          <div className="h-48 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!hp) {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-6 text-center">
        <p className="text-sm text-gray-400">Complétez votre profil pour accéder à la facturation.</p>
      </div>
    );
  }

  if (passages.length === 0) {
    return (
      <div>
        <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-6 text-center">
          <p className="text-sm text-gray-400">Aucune donnée disponible pour le moment.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Summary KPI cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-transparent backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-4">
            <div className="flex items-center gap-2 mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-green-600">
                <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.3" />
                <path d="M12 16V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
                <path d="M8 12l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
              </svg>
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium text-gray-500">Total CA — Payé</p>
                <InfoBadge tooltip={STATUS_TOOLTIPS.totalCA} />
              </div>
            </div>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(summary.totalCA)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{summary.byStatus.paye.count} facture{summary.byStatus.paye.count > 1 ? "s" : ""}</p>
          </div>

          {(() => {
            const enAttenteData = {
              count: summary.byStatus.a_securiser.count + summary.byStatus.a_envoyer.count,
              total: summary.byStatus.a_securiser.total + summary.byStatus.a_envoyer.total,
            };
            if (enAttenteData.count === 0) return null;
            return (
              <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-4">
                <div className="flex items-center gap-2 mb-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-amber-600">
                    <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3" />
                    <path d="M12 7v4l2.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                  </svg>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium text-gray-500">En attente</p>
                    <InfoBadge tooltip={STATUS_TOOLTIPS.en_attente} />
                  </div>
                </div>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(enAttenteData.total)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{enAttenteData.count} facture{enAttenteData.count > 1 ? "s" : ""}</p>
              </div>
            );
          })()}

          {summary.byStatus.rejete.count > 0 && (
            <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-4">
              <div className="flex items-center gap-2 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-red-500">
                  <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3" />
                  <path d="M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
                  <path d="M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
                </svg>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-gray-500">Rejeté</p>
                  <InfoBadge tooltip={STATUS_TOOLTIPS.rejete} />
                </div>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(summary.byStatus.rejete.total)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{summary.byStatus.rejete.count} facture{summary.byStatus.rejete.count > 1 ? "s" : ""}</p>
            </div>
          )}

          {summary.avgPaymentDelay !== null && (
            <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-4">
              <div className="flex items-center gap-2 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-brand-600">
                  <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3" />
                  <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                </svg>
                <p className="text-xs font-medium text-gray-500">Délai moyen</p>
              </div>
              <p className="text-xl font-bold text-gray-900">{summary.avgPaymentDelay}j</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Entre soin et virement</p>
            </div>
          )}
        </div>
      )}

      {/* Chart CA mensuel */}
      <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Facturation mensuelle</h2>
            <p className="text-xs text-gray-400">Répartition par statut</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCompareMode((v) => !v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  compareMode
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:text-gray-900 bg-gray-100 hover:bg-gray-200"
                }`}
              >
                Comparer avec {chartYear - 1}
              </button>
              {compareMode && (
                <select
                  value={compareStatus}
                  onChange={(e) => setCompareStatus(e.target.value as "paye" | "en_attente" | "rejete")}
                  className="border border-gray-200 bg-white px-2.5 py-1.5 text-xs rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
                >
                  <option value="paye">Payé</option>
                  <option value="en_attente">En attente</option>
                  <option value="rejete">Rejeté</option>
                </select>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setChartYear((y) => y - 1)}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span className="text-sm font-semibold text-gray-900 w-12 text-center">{chartYear}</span>
              <button
                type="button"
                onClick={() => setChartYear((y) => y + 1)}
                disabled={chartYear >= new Date().getFullYear()}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>
        </div>
        <div className="h-48 sm:h-64 min-h-[1px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={1}>
            <BarChart data={chartData} barGap={0}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} width={45} />
              <Tooltip contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 13 }} formatter={(value, name) => [formatCurrency(Number(value)), STATUS_CONFIG[String(name)]?.label || String(name)]} />
              <Legend formatter={(value: string) => <span className="text-xs text-gray-500">{STATUS_CONFIG[value]?.label || value}</span>} />
              {compareMode ? (
                <>
                  <Bar dataKey={`${compareStatus}_prev`} fill="#d1d5db" radius={[4, 4, 0, 0]} name={`${STATUS_CONFIG[compareStatus]?.label || compareStatus} ${chartYear - 1}`} />
                  <Bar dataKey={compareStatus} fill={compareStatus === "paye" ? "#16a34a" : compareStatus === "en_attente" ? "#d97706" : "#dc2626"} radius={[4, 4, 0, 0]} name={`${STATUS_CONFIG[compareStatus]?.label || compareStatus} ${chartYear}`} />
                </>
              ) : (
                <>
                  <Bar dataKey="paye" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="en_attente" fill="#d97706" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="rejete" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Taux de rejet */}
      {summary && summary.rejections.totalInvoices > 0 && (
        <div className="mb-6">
          <RejectionBlock rejections={summary.rejections} />
        </div>
      )}

      {/* Table */}
      <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px]">
        {/* Header */}
        <div className="px-5 pt-4 pb-0 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-4">Détail des passages</h2>
          </div>
          <div className="flex items-center gap-3 pb-3">
            <span className="text-xs text-gray-400">
              {filteredPassages.length} passage{filteredPassages.length > 1 ? "s" : ""} — {formatCurrency(filteredTotal)}
            </span>
            {filteredPassages.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const headers = ["Date", "Moment", "Cabinet", "N° facture", "Statut", "Cotation", "Honoraires", "Majoration", "Férié/Dim/Nuit", "IFD", "Total"];
                    const rows = sortedPassages.map((p) => [
                      formatDateFr(p.careDate), p.careMoment, p.practiceName, p.invoiceNumber,
                      STATUS_CONFIG[displayStatus(p.status)]?.label || p.status,
                      p.cotation, p.baseAmount, p.adj1, p.adj2, p.adj3, p.totalAmount,
                    ]);
                    downloadCSV("facturation", headers, rows);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const headers = ["Date", "Cabinet", "N° facture", "Statut", "Cotation", "Total"];
                    const rows = sortedPassages.map((p) => [
                      formatDateFr(p.careDate), p.practiceName, p.invoiceNumber,
                      STATUS_CONFIG[displayStatus(p.status)]?.label || p.status,
                      p.cotation, formatCurrency(Number(p.totalAmount)),
                    ]);
                    downloadPDF("facturation", "Facturation — Détail des passages", headers, rows);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  PDF
                </button>
              </>
            )}
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span className="text-sm font-medium text-gray-500 min-w-[3rem] text-center">{page} / {totalPages}</span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <select
            value={filterPractice}
            onChange={(e) => setFilterPractice(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
          >
            <option value="">Tous les cabinets</option>
            {practiceOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
          >
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS_CONFIG).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
          />
          <span className="text-xs text-gray-400">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
          />

          {(filterPractice || filterStatus || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => { setFilterPractice(""); setFilterStatus(""); setDateFrom(""); setDateTo(""); }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Réinitialiser
            </button>
          )}
        </div>

        {/* Table content */}
        {filteredPassages.length === 0 ? (
          <div className="p-5 text-center text-sm text-gray-400">
            Aucun passage ne correspond aux filtres.
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_120px_100px_120px_110px_120px] min-w-[700px] border-b border-gray-200/60">
              <SortableHeader column="practiceName" label="Cabinet" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
              <SortableHeader column="careDate" label="Date" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
              <SortableHeader column="careMoment" label="Moment" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
              <SortableHeader column="invoiceNumber" label="N° facture" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
              <SortableHeader column="status" label="Statut" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
              <SortableHeader column="totalAmount" label="Total" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} align="right" />
            </div>

            {/* Rows */}
            {paginatedPassages.map((row) => {
              const style = STATUS_CONFIG[displayStatus(row.status)];
              return (
                <div key={row.id} className="grid grid-cols-[1fr_120px_100px_120px_110px_120px] min-w-[700px] items-center border-b border-gray-200/60 last:border-b-0 hover:bg-white/50 transition-colors">
                  <div className="px-5 py-3.5 text-sm text-gray-500 truncate">{row.practiceName}</div>
                  <div className="px-5 py-3.5 text-sm text-gray-900 whitespace-nowrap">{formatDateFr(row.careDate)}</div>
                  <div className="px-5 py-3.5 text-sm text-gray-500">{row.careMoment.charAt(0).toUpperCase() + row.careMoment.slice(1)}</div>
                  <div className="px-5 py-3.5 text-sm font-medium text-gray-900">{row.invoiceNumber}</div>
                  <div className="px-5 py-3.5">
                    {style && (
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${style.bg} ${style.color}`}>
                        {style.label}
                      </span>
                    )}
                  </div>
                  <div className="px-5 py-3.5 text-base font-semibold text-right whitespace-nowrap text-gray-900">{formatCurrency(parseFloat(row.totalAmount))}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);
}

function formatDateFr(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}


const STATUS_TOOLTIPS: Record<string, { dot: string; text: string }> = {
  totalCA: { dot: "bg-green-600", text: "Total CA — Payé : somme de toutes les factures pour lesquelles le virement a été reçu." },
  en_attente: { dot: "bg-amber-500", text: "En attente : factures créées, en cours de sécurisation ou de télétransmission à la caisse." },
  rejete: { dot: "bg-red-600", text: "Rejeté : paiement refusé par la caisse. Consultez le motif dans le détail ci-dessous." },
};

function InfoBadge({ tooltip }: { tooltip: { dot: string; text: string } }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
        className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-500 hover:text-gray-700 text-xs font-semibold transition-colors"
      >
        i
      </button>
      {open && (
        <div className="absolute top-7 left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs text-gray-600 z-[60]">
          <span className={`inline-block w-2 h-2 rounded-full ${tooltip.dot} mr-2`} />
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

function RejectionBlock({ rejections }: { rejections: RejectionStats }) {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px]">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">Taux de rejet</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {rejections.rejectedCount} rejet{rejections.rejectedCount > 1 ? "s" : ""} sur {rejections.totalInvoices} factures traitées
          </p>
        </div>
        <div className={`text-2xl font-bold shrink-0 ${rejections.rejectedCount > 0 ? "text-red-600" : "text-green-600"}`}>
          {rejections.rate.toFixed(1)}%
        </div>
      </div>

      {rejections.details.length > 0 && (
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Header */}
            <div className="grid grid-cols-[1fr_100px_1fr_1.5fr_100px] border-b border-gray-200/60">
              <div className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">N° facture</div>
              <div className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Date</div>
              <div className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Payeur</div>
              <div className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Motif</div>
              <div className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Montant</div>
            </div>
            {/* Rows */}
            {rejections.details.map((d, i) => (
              <div key={i} className="grid grid-cols-[1fr_100px_1fr_1.5fr_100px] items-center border-b border-gray-200/60 last:border-b-0">
                <div className="px-5 py-3 text-sm font-medium text-gray-900">{d.invoiceNumber}</div>
                <div className="px-5 py-3 text-sm text-gray-500">{formatDateFr(d.date)}</div>
                <div className="px-5 py-3 text-sm text-gray-500 truncate">{d.payerRef}</div>
                <div className="px-5 py-3 text-xs text-red-600">{d.reason || "—"}</div>
                <div className="px-5 py-3 text-sm font-medium text-right text-gray-900">{formatCurrency(parseFloat(d.amountBilled))}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SortableHeader({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
  align = "left",
}: {
  column: string;
  label: string;
  sortColumn: string;
  sortDirection: "asc" | "desc";
  onSort: (column: string) => void;
  align?: "left" | "right";
}) {
  const isActive = sortColumn === column;
  return (
    <div className={`px-5 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
          isActive ? "text-gray-700" : "text-gray-400 hover:text-gray-600"
        }`}
      >
        {label}
        <span className="flex flex-col -space-y-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={isActive && sortDirection === "asc" ? "text-gray-700" : "text-gray-300"}><polyline points="18 15 12 9 6 15"/></svg>
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={isActive && sortDirection === "desc" ? "text-gray-700" : "text-gray-300"}><polyline points="6 9 12 15 18 9"/></svg>
        </span>
      </button>
    </div>
  );
}
