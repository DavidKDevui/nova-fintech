"use client";

import { useMemo, useState } from "react";
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

  // Filtered totals
  const filteredTotal = useMemo(() => {
    return filteredPassages.reduce((s, p) => s + parseFloat(p.totalAmount), 0);
  }, [filteredPassages]);

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
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-5 animate-pulse">
          <div className="h-3 bg-gray-200 rounded w-24 mb-3" />
          <div className="h-6 bg-gray-200 rounded w-32" />
        </div>
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-5 animate-pulse">
          <div className="h-48 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!hp) {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-6 text-center">
        <p className="text-sm text-gray-400">Complétez votre profil pour accéder à la facturation.</p>
      </div>
    );
  }

  if (passages.length === 0) {
    return (
      <div>
        <h1 className="text-xl md:text-2xl font-bold mb-1">Facturation</h1>
        <p className="text-sm text-gray-400 mb-6 md:mb-8">Suivi de vos actes et paiements.</p>
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-6 text-center">
          <p className="text-sm text-gray-400">Aucune donnée disponible pour le moment.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl md:text-2xl font-bold mb-1">Facturation</h1>
      <p className="text-sm text-gray-400 mb-6 md:mb-8">Suivi de vos actes et paiements.</p>

      {/* Summary card */}
      {summary && (
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-5 mb-6">
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total CA — Payé</p>
              <InfoBadge tooltip={STATUS_TOOLTIPS.totalCA} />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{formatCurrency(summary.totalCA)}</p>
            <p className="text-xs text-gray-400 mt-1">{summary.byStatus.paye.count} facture{summary.byStatus.paye.count > 1 ? "s" : ""}</p>
          </div>

          {/* Status breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries({
              en_attente: {
                count: summary.byStatus.a_securiser.count + summary.byStatus.a_envoyer.count,
                total: summary.byStatus.a_securiser.total + summary.byStatus.a_envoyer.total,
              },
              rejete: summary.byStatus.rejete,
            }).map(([status, data]) => {
              if (data.count === 0) return null;
              const style = STATUS_CONFIG[status];
              if (!style) return null;
              return (
                <div key={status} className={`${style.bg} rounded-lg p-3`}>
                  <div className="flex items-center justify-between">
                    <p className={`text-xs font-medium ${style.color}`}>{style.label}</p>
                    <InfoBadge tooltip={STATUS_TOOLTIPS[status]} />
                  </div>
                  <p className={`text-lg font-bold ${style.color} mt-0.5`}>{formatCurrency(data.total)}</p>
                  <p className="text-xs text-gray-400">{data.count} facture{data.count > 1 ? "s" : ""}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chart CA mensuel */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Facturation mensuelle</h2>
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
                  className="border border-gray-200/50 bg-white/50 px-2 py-1.5 text-xs rounded-md focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="paye">Payé</option>
                  <option value="en_attente">En attente</option>
                  <option value="rejete">Rejeté</option>
                </select>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setChartYear((y) => y - 1)}
                className="flex items-center justify-center w-7 h-7 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span className="text-sm font-medium text-gray-900 w-10 text-center">{chartYear}</span>
              <button
                type="button"
                onClick={() => setChartYear((y) => y + 1)}
                disabled={chartYear >= new Date().getFullYear()}
                className="flex items-center justify-center w-7 h-7 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>
        </div>
        <div className="h-48 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={0}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} width={45} />
              <Tooltip contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 13 }} formatter={(value: number, name: string) => [formatCurrency(value), STATUS_CONFIG[name]?.label || name]} />
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

      {/* Délai moyen de paiement */}
      {summary && summary.avgPaymentDelay !== null && (
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-gray-900">Délai moyen de paiement</h2>
            <span className="text-2xl font-bold text-gray-900">{summary.avgPaymentDelay}j</span>
          </div>
          <p className="text-xs text-gray-400">Temps moyen entre la date de soin et le virement</p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-4 md:p-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-4">
          <select
            value={filterPractice}
            onChange={(e) => setFilterPractice(e.target.value)}
            className="border border-gray-200/50 bg-white/50 px-3 py-2 text-sm rounded-md backdrop-blur-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Tous les cabinets</option>
            {practiceOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-200/50 bg-white/50 px-3 py-2 text-sm rounded-md backdrop-blur-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS_CONFIG).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-gray-500">Du</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-200/50 bg-white/50 px-3 py-2 text-sm rounded-md backdrop-blur-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-0"
            />
            <label className="text-xs text-gray-500">au</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-200/50 bg-white/50 px-3 py-2 text-sm rounded-md backdrop-blur-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-0"
            />
          </div>

          <div className="sm:ml-auto flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {filteredPassages.length} passage{filteredPassages.length > 1 ? "s" : ""} — {formatCurrency(filteredTotal)}
            </span>
            {filteredPassages.length > 0 && (
              <button
                type="button"
                onClick={() => exportCSV(sortedPassages)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                CSV
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {filteredPassages.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <p className="text-sm">Aucun passage ne correspond aux filtres.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-200/50 text-left text-gray-500">
                  <SortableHeader column="practiceName" label="Cabinet" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
                  <SortableHeader column="careDate" label="Date" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
                  <SortableHeader column="careMoment" label="Moment" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
                  <SortableHeader column="invoiceNumber" label="N° facture" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
                  <SortableHeader column="status" label="Statut" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
                  <SortableHeader column="totalAmount" label="Total" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedPassages.map((row) => {
                  const style = STATUS_CONFIG[displayStatus(row.status)];
                  return (
                    <tr key={row.id} className="border-b border-gray-100/50 last:border-0 hover:bg-white/40">
                      <td className="px-3 py-3 text-gray-500">{row.practiceName}</td>
                      <td className="px-3 py-3 text-gray-900">{formatDateFr(row.careDate)}</td>
                      <td className="px-3 py-3 text-gray-500">{row.careMoment.charAt(0).toUpperCase() + row.careMoment.slice(1)}</td>
                      <td className="px-3 py-3 font-medium">{row.invoiceNumber}</td>
                      <td className="px-3 py-3">
                        {style && (
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${style.bg} ${style.color}`}>
                            {style.label}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-medium text-right">{formatCurrency(parseFloat(row.totalAmount))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

function exportCSV(passages: CarePassageRow[]) {
  const headers = ["Date", "Moment", "Cabinet", "N° facture", "Statut", "Cotation", "Honoraires", "Majoration", "Férié/Dim/Nuit", "IFD", "Total"];
  const rows = passages.map((p) => [
    formatDateFr(p.careDate),
    p.careMoment,
    p.practiceName,
    p.invoiceNumber,
    STATUS_CONFIG[displayStatus(p.status)]?.label || p.status,
    p.cotation,
    p.baseAmount,
    p.adj1,
    p.adj2,
    p.adj3,
    p.totalAmount,
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `facturation_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
    <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">Taux de rejet</h2>
          <p className="text-xs text-gray-400">
            {rejections.rejectedCount} rejet{rejections.rejectedCount > 1 ? "s" : ""} sur {rejections.totalInvoices} factures traitées
          </p>
        </div>
        <div className={`text-2xl font-bold shrink-0 ${rejections.rejectedCount > 0 ? "text-red-600" : "text-green-600"}`}>
          {rejections.rate.toFixed(1)}%
        </div>
      </div>


      {rejections.details.length > 0 && (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-200/50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">N° facture</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Payeur</th>
                <th className="px-3 py-2 font-medium">Motif</th>
                <th className="px-3 py-2 font-medium text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {rejections.details.map((d, i) => (
                <tr key={i} className="border-b border-gray-100/50 last:border-0">
                  <td className="px-3 py-2 font-medium">{d.invoiceNumber}</td>
                  <td className="px-3 py-2 text-gray-500">{formatDateFr(d.date)}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate">{d.payerRef}</td>
                  <td className="px-3 py-2 text-red-600 text-xs max-w-[300px]">{d.reason || "—"}</td>
                  <td className="px-3 py-2 font-medium text-right">{formatCurrency(parseFloat(d.amountBilled))}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
    <th
      className={`px-3 py-3 font-medium cursor-pointer select-none hover:text-gray-900 transition-colors ${align === "right" ? "text-right" : ""}`}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`inline-flex flex-col text-[8px] leading-none ${isActive ? "text-gray-900" : "text-gray-300"}`}>
          <span className={isActive && sortDirection === "asc" ? "text-gray-900" : ""}>▲</span>
          <span className={isActive && sortDirection === "desc" ? "text-gray-900" : ""}>▼</span>
        </span>
      </span>
    </th>
  );
}

