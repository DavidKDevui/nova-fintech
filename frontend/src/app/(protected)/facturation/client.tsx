"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/modal";
import { getRejectionAlertAction, upsertRejectionAlertAction } from "@/actions/rejection-alert";
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
  PieChart,
  Pie,
  Cell,
} from "recharts";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  en_attente: { label: "En attente", color: "text-amber-700", bg: "bg-amber-50" },
  paye: { label: "Payé", color: "text-green-700", bg: "bg-green-50" },
  rejete: { label: "Rejeté", color: "text-red-700", bg: "bg-red-50" },
};

const MONTH_NAMES = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

// Normalise les statuts internes en statuts affichés
function displayStatus(status: string): string {
  if (status === "a_securiser" || status === "a_envoyer") return "en_attente";
  return status;
}

import type { CarePassageRow } from "@/actions/facturation";
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
  const [exporting, setExporting] = useState(false);
  const chartCardRef = useRef<HTMLDivElement>(null);

  async function exportChartToPdf() {
    if (!chartCardRef.current) return;
    setExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(chartCardRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      // Format paysage A4 (297 × 210 mm), marge 12 mm.
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 12;
      const maxW = pageWidth - margin * 2;
      const maxH = pageHeight - margin * 2 - 12;
      const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
      const w = canvas.width * ratio;
      const h = canvas.height * ratio;
      const x = (pageWidth - w) / 2;
      const y = margin + 8;
      pdf.setFontSize(13);
      pdf.setTextColor(30);
      pdf.text(`Facturation mensuelle — ${chartYear}`, margin, margin);
      pdf.addImage(imgData, "PNG", x, y, w, h);
      pdf.save(`facturation-mensuelle-${chartYear}.pdf`);
    } finally {
      setExporting(false);
    }
  }
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
      if (parseInt(p.careDate.split("-")[0]!, 10) !== chartYear) return false;
      if (filterStatus && displayStatus(p.status) !== filterStatus) return false;
      if (filterPractice && p.practiceId !== filterPractice) return false;
      if (dateFrom && p.careDate < dateFrom) return false;
      if (dateTo && p.careDate > dateTo) return false;
      return true;
    });
  }, [passages, chartYear, filterStatus, filterPractice, dateFrom, dateTo]);

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
  const filterKey = `${chartYear}-${filterStatus}-${filterPractice}-${dateFrom}-${dateTo}`;
  useEffect(() => {
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

  const rejectionViewData = useMemo(() => {
    let okCount = 0, rejectedCount = 0;
    for (const p of passages) {
      const year = parseInt(p.careDate.split("-")[0]!, 10);
      if (year !== chartYear) continue;
      if (p.status === "paye") okCount++;
      else if (p.status === "rejete") rejectedCount++;
    }
    return { okCount, rejectedCount, total: okCount + rejectedCount };
  }, [passages, chartYear]);

  // Average payment delay for the selected year (days between careDate and paymentDate)
  const avgDelayForYear = useMemo(() => {
    let totalDays = 0;
    let count = 0;
    for (const p of passages) {
      if (parseInt(p.careDate.split("-")[0]!, 10) !== chartYear) continue;
      if (!p.paymentDate) continue;
      const days = Math.round(
        (new Date(p.paymentDate).getTime() - new Date(p.careDate).getTime()) / 86_400_000,
      );
      if (days >= 0) {
        totalDays += days;
        count++;
      }
    }
    return count > 0 ? Math.round(totalDays / count) : null;
  }, [passages, chartYear]);

  const globalViewData = useMemo(() => {
    let paye = 0, en_attente = 0, rejete = 0;
    let payeCount = 0, attenteCount = 0, rejeteCount = 0;
    for (const p of passages) {
      const year = parseInt(p.careDate.split("-")[0]!, 10);
      if (year !== chartYear) continue;
      const amount = parseFloat(p.totalAmount);
      const s = displayStatus(p.status);
      if (s === "paye") { paye += amount; payeCount++; }
      else if (s === "en_attente") { en_attente += amount; attenteCount++; }
      else if (s === "rejete") { rejete += amount; rejeteCount++; }
    }
    const declared = paye + en_attente + rejete;
    return {
      declared, paye, en_attente, rejete,
      payeCount, attenteCount, rejeteCount,
      pct: (v: number) => declared > 0 ? (v / declared) * 100 : 0,
    };
  }, [passages, chartYear]);

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
      {/* Sélecteur d'année global */}
      <div className="flex items-center justify-end gap-2 mb-4">
        <span className="text-xs uppercase tracking-wider text-gray-400">Année</span>
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

      {/* Summary KPI cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
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
            <p className="text-xl font-bold text-gray-900">{formatCurrency(globalViewData.paye)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{globalViewData.payeCount} facture{globalViewData.payeCount > 1 ? "s" : ""} — {chartYear}</p>
          </div>

          {globalViewData.attenteCount > 0 && (
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
              <p className="text-xl font-bold text-gray-900">{formatCurrency(globalViewData.en_attente)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{globalViewData.attenteCount} facture{globalViewData.attenteCount > 1 ? "s" : ""} — {chartYear}</p>
            </div>
          )}

          {globalViewData.rejeteCount > 0 && (
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
              <p className="text-xl font-bold text-gray-900">{formatCurrency(globalViewData.rejete)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{globalViewData.rejeteCount} facture{globalViewData.rejeteCount > 1 ? "s" : ""} — {chartYear}</p>
            </div>
          )}

          {avgDelayForYear !== null && (
            <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-4">
              <div className="flex items-center gap-2 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-brand-600">
                  <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3" />
                  <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                </svg>
                <p className="text-xs font-medium text-gray-500">Délai moyen</p>
              </div>
              <p className="text-xl font-bold text-gray-900">{avgDelayForYear}j</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Entre soin et virement — {chartYear}</p>
            </div>
          )}
        </div>
      )}

      {/* Chart CA mensuel */}
      <div ref={chartCardRef} className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-5 mb-6">
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
            <button
              type="button"
              onClick={exportChartToPdf}
              disabled={exporting}
              data-html2canvas-ignore="true"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Exporter le graphique en PDF"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
              {exporting ? "Export..." : "PDF"}
            </button>
          </div>
        </div>
        <div className="h-40 sm:h-56 min-h-[1px]">
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

      {/* Vue globale + Taux de rejet — row 50/50 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 items-stretch">
      <div className={`bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-5 ${rejectionViewData.total > 0 ? "" : "sm:col-span-2"}`}>
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-900">Vue globale — CA déclaré vs payé</h2>
          <p className="text-xs text-gray-400">Répartition annuelle par statut</p>
        </div>

        {globalViewData.declared === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Aucune donnée pour {chartYear}.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  {(() => {
                    const pieData = [
                      { name: "paye", value: globalViewData.paye, color: "#16a34a" },
                      { name: "en_attente", value: globalViewData.en_attente, color: "#d97706" },
                      { name: "rejete", value: globalViewData.rejete, color: "#dc2626" },
                    ].filter((d) => d.value > 0);
                    return (
                      <Pie
                        data={pieData}
                        dataKey="value"
                        innerRadius={42}
                        outerRadius={68}
                        paddingAngle={2}
                        onClick={(d) => setFilterStatus((d as { name: string }).name)}
                        className="cursor-pointer"
                      >
                        {pieData.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                    );
                  })()}
                  <Tooltip
                    formatter={(value: unknown, name: unknown) =>
                      [formatCurrency(Number(value)), STATUS_CONFIG[String(name)]?.label || String(name)]}
                    contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400">CA déclaré {chartYear}</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(globalViewData.declared)}</p>
              </div>
              <div className="space-y-1.5">
                <SegmentRow color="#16a34a" label="Payé" value={formatCurrency(globalViewData.paye)} pct={globalViewData.pct(globalViewData.paye)} onClick={() => setFilterStatus("paye")} />
                <SegmentRow color="#d97706" label="En attente" value={formatCurrency(globalViewData.en_attente)} pct={globalViewData.pct(globalViewData.en_attente)} onClick={() => setFilterStatus("en_attente")} />
                <SegmentRow color="#dc2626" label="Rejeté" value={formatCurrency(globalViewData.rejete)} pct={globalViewData.pct(globalViewData.rejete)} onClick={() => setFilterStatus("rejete")} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Taux de rejet (carte droite de la row) */}
      {rejectionViewData.total > 0 && (
        <RejectionBlock okCount={rejectionViewData.okCount} rejectedCount={rejectionViewData.rejectedCount} year={chartYear} />
      )}
      </div>

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
          <div className="md:overflow-x-auto">
            {/* Table header — desktop uniquement */}
            <div className="hidden md:grid md:grid-cols-[16fr_12fr_10fr_12fr_11fr_12fr] md:min-w-[700px] border-b border-gray-200/60">
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
                <div key={row.id} className="grid grid-cols-2 md:grid-cols-[16fr_12fr_10fr_12fr_11fr_12fr] md:min-w-[700px] md:items-center gap-y-1.5 md:gap-y-0 px-4 py-3 md:p-0 border-b border-gray-200/60 last:border-b-0 hover:bg-white/50 transition-colors">
                  <div className="order-3 col-span-2 md:order-1 md:col-span-1 text-sm font-medium text-gray-900 md:font-normal md:text-gray-500 md:truncate md:px-5 md:py-3.5">{row.practiceName}</div>
                  <div className="order-1 md:order-2 text-xs text-gray-500 whitespace-nowrap md:text-sm md:text-gray-900 md:px-5 md:py-3.5">{formatDateFr(row.careDate)}</div>
                  <div className="hidden md:block md:order-3 md:px-5 md:py-3.5 md:text-sm md:text-gray-500">{row.careMoment.charAt(0).toUpperCase() + row.careMoment.slice(1)}</div>
                  <div className="order-4 md:order-4 text-xs text-gray-500 md:text-sm md:font-medium md:text-gray-900 md:px-5 md:py-3.5"><span className="md:hidden">N° </span>{row.invoiceNumber}</div>
                  <div className="order-5 md:order-5 text-right md:text-left md:px-5 md:py-3.5">
                    {style && (
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${style.bg} ${style.color}`}>
                        {style.label}
                      </span>
                    )}
                    {row.status === "paye" && (
                      <ReconciliationBadge reconciliation={row.reconciliation} paymentDate={row.paymentDate} />
                    )}
                  </div>
                  <div className="order-2 md:order-6 text-base font-semibold text-right whitespace-nowrap text-gray-900 md:px-5 md:py-3.5">{formatCurrency(parseFloat(row.totalAmount))}</div>
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

// Au-delà de ce délai sans virement détecté, on signale une anomalie discrète à l'utilisateur.
const RECONCILIATION_STALE_DAYS = 30;

function ReconciliationBadge({
  reconciliation,
  paymentDate,
}: {
  reconciliation: { bankTxDate: string; bankTxAmount: string } | null;
  paymentDate: string | null;
}) {
  // Capture du "now" une seule fois au mount pour éviter Date.now() impur pendant le render
  const [now] = useState(() => Date.now());
  if (reconciliation) {
    const [y, m, d] = reconciliation.bankTxDate.split("-");
    return (
      <p
        className="text-[10px] text-emerald-600 mt-1 truncate"
        title={`Virement bancaire de ${formatCurrency(parseFloat(reconciliation.bankTxAmount))} reçu le ${formatDateFr(reconciliation.bankTxDate)}`}
      >
        ✓ Encaissé le {d}/{m}/{y}
      </p>
    );
  }
  if (!paymentDate) return null;
  const ageDays = Math.floor((now - new Date(paymentDate).getTime()) / 86_400_000);
  if (ageDays > RECONCILIATION_STALE_DAYS) {
    return (
      <p
        className="text-[10px] text-amber-600 mt-1"
        title={`Aucun virement bancaire détecté ${ageDays} jours après le paiement annoncé par la caisse.`}
      >
        ⚠ Virement non détecté
      </p>
    );
  }
  return <p className="text-[10px] text-gray-400 mt-1">En attente du virement</p>;
}

function SegmentRow({ color, label, value, pct, onClick }: {
  color: string; label: string; value: string; pct: number; onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }}></span>
        {label}
      </span>
      <span className="text-xs">
        <span className="font-semibold text-gray-900">{value}</span>
        <span className="text-gray-400 ml-1.5">{pct.toFixed(0)}%</span>
      </span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center justify-between w-full text-left hover:bg-gray-50 rounded-md px-1 py-0.5 transition-colors"
      >
        {inner}
      </button>
    );
  }
  return <div className="flex items-center justify-between w-full px-1 py-0.5">{inner}</div>;
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

function RejectionBlock({ okCount, rejectedCount, year }: { okCount: number; rejectedCount: number; year: number }) {
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState("5");
  const [alertLoaded, setAlertLoaded] = useState(false);
  const [alertSaving, setAlertSaving] = useState(false);
  const alertConfigured = alertLoaded && alertEnabled;

  useEffect(() => {
    if (alertLoaded) return;
    getRejectionAlertAction().then(({ alert }) => {
      if (alert) {
        setAlertEnabled(alert.enabled);
        setAlertThreshold(String(alert.threshold));
      }
      setAlertLoaded(true);
    });
  }, [alertLoaded]);

  const saveAlert = useCallback(async () => {
    const value = parseFloat(alertThreshold);
    if (!Number.isFinite(value) || value <= 0) return;
    setAlertSaving(true);
    const result = await upsertRejectionAlertAction(value, alertEnabled);
    setAlertSaving(false);
    if ("success" in result && result.success) {
      setShowAlertModal(false);
      toast.success(alertEnabled ? `Alerte paramétrée à ${value} %` : "Alerte désactivée");
    } else if ("error" in result) {
      toast.error(result.error);
    }
  }, [alertThreshold, alertEnabled]);

  const total = okCount + rejectedCount;
  const okPct = total > 0 ? (okCount / total) * 100 : 0;
  const rejectPct = total > 0 ? (rejectedCount / total) * 100 : 0;

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Taux de rejet</h2>
          <p className="text-xs text-gray-400">Répartition des factures traitées</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAlertModal(true)}
          className={`flex items-center justify-center w-7 h-7 rounded-md transition-all ${
            alertConfigured ? "text-brand-600 hover:bg-brand-50" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          }`}
          title="Alerte seuil"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={alertConfigured ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
        <div className="relative h-40">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              {(() => {
                const pieData = [
                  { name: "ok", value: okCount, color: "#16a34a" },
                  { name: "rejete", value: rejectedCount, color: "#dc2626" },
                ].filter((d) => d.value > 0);
                return (
                  <Pie
                    data={pieData}
                    dataKey="value"
                    innerRadius={42}
                    outerRadius={68}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {pieData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                );
              })()}
              <Tooltip
                formatter={(value: unknown, name: unknown) =>
                  [`${value} facture${Number(value) > 1 ? "s" : ""}`, name === "rejete" ? "Rejetées" : "Non rejetées"]}
                contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <span className={`absolute inset-0 flex items-center justify-center pointer-events-none text-xl font-bold ${rejectedCount > 0 ? "text-red-600" : "text-green-600"}`}>
            {rejectPct.toFixed(1)}%
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">Total traité {year}</p>
            <p className="text-xl font-bold text-gray-900">{total} facture{total > 1 ? "s" : ""}</p>
          </div>
          <div className="space-y-1.5">
            <SegmentRow color="#16a34a" label="Non rejetées" value={String(okCount)} pct={okPct} />
            <SegmentRow color="#dc2626" label="Rejetées" value={String(rejectedCount)} pct={rejectPct} />
          </div>
        </div>
      </div>

      <Modal open={showAlertModal} onClose={() => setShowAlertModal(false)}>
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Alerte taux de rejet</h3>
            <p className="text-sm text-gray-500 mt-1">
              Recevez un email si plus d&apos;un certain pourcentage de vos bordereaux des 30 derniers jours sont rejetés.
            </p>
          </div>
          {!alertLoaded ? (
            <div className="py-6 text-center text-sm text-gray-400">Chargement…</div>
          ) : (
            <>
              <div>
                <label htmlFor="rejection-threshold" className="block text-sm font-medium text-gray-700 mb-1">
                  Seuil de rejet (%)
                </label>
                <input
                  id="rejection-threshold"
                  type="number"
                  min="0.5"
                  max="50"
                  step="0.5"
                  value={alertThreshold}
                  onChange={(e) => setAlertThreshold(e.target.value)}
                  placeholder="Ex : 5"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  Email envoyé au maximum une fois tous les 14 jours. Échantillon minimum de 10 bordereaux sur la période.
                </p>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  type="button"
                  role="switch"
                  aria-checked={alertEnabled}
                  onClick={() => setAlertEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${alertEnabled ? "bg-brand-600" : "bg-gray-200"}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${alertEnabled ? "translate-x-5" : "translate-x-0"}`} />
                </button>
                <span className="text-sm text-gray-700">Alerte activée</span>
              </label>
              <button
                type="button"
                disabled={!alertThreshold || alertSaving}
                onClick={saveAlert}
                className="w-full bg-brand-600 text-white text-sm font-medium py-2.5 rounded-lg transition-all hover:bg-brand-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {alertSaving ? "Enregistrement…" : "Enregistrer l'alerte"}
              </button>
            </>
          )}
        </div>
      </Modal>
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
