"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/modal";
import { Badge, type BadgeTone } from "@/components/badge";
import { Button } from "@/components/button";
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

const STATUS_CONFIG: Record<string, { label: string; tone: BadgeTone }> = {
  en_attente: { label: "En attente", tone: "action" },
  paye: { label: "Payé", tone: "success" },
  rejete: { label: "Rejeté", tone: "alerte" },
};

const MONTH_NAMES = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

// Normalise les statuts internes en statuts affichés
function displayStatus(status: string): string {
  if (status === "a_securiser" || status === "a_envoyer") return "en_attente";
  return status;
}

import type { CarePassageRow } from "@/actions/facturation";
import { downloadCSV, downloadPDF } from "@/lib/export";
import { buildPrestationBreakdown, principalCode, principalToken, prestationKey } from "@/lib/ngap/parse-cotation";
import { actLabel } from "@/lib/ngap/acts";

// Palette pour la ventilation NGAP (réutilise les teintes de la charte).
const NGAP_COLORS = ["#7C5CFC", "#2FA169", "#d97706", "#0EA5E9", "#dc2626", "#8B5CF6", "#14B8A6", "#F59E0B", "#EC4899", "#64748B"];

export function FacturationClient() {
  const hp = usePractitioner();
  const { facturationPassages: passages, facturationSummary: summary, facturationLoading: loading } = useData();
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPractice, setFilterPractice] = useState("");
  const [filterPrestation, setFilterPrestation] = useState(""); // clé prestation NGAP (code:coef)
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
      if (filterPrestation && prestationKey(p.cotation) !== filterPrestation) return false;
      if (dateFrom && p.careDate < dateFrom) return false;
      if (dateTo && p.careDate > dateTo) return false;
      return true;
    });
  }, [passages, chartYear, filterStatus, filterPractice, filterPrestation, dateFrom, dateTo]);

  // Sorted passages
  const sortedPassages = useMemo(() => {
    return [...filteredPassages].sort((a, b) => {
      // Colonne dérivée (non présente sur la ligne) : tri sur le libellé de prestation.
      if (sortColumn === "prestation") {
        const la = prestationLabelOf(a.cotation);
        const lb = prestationLabelOf(b.cotation);
        return sortDirection === "asc" ? la.localeCompare(lb) : lb.localeCompare(la);
      }

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
  const filterKey = `${chartYear}-${filterStatus}-${filterPractice}-${filterPrestation}-${dateFrom}-${dateTo}`;
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

  // Ventilation par prestation NGAP (même périmètre que la vue globale : année sélectionnée).
  // Chaque passage est rattaché à UNE prestation (acte principal) → la somme des CA = CA total.
  const ngapData = useMemo(() => {
    const yearPassages = passages.filter(
      (p) => parseInt(p.careDate.split("-")[0]!, 10) === chartYear,
    );
    const rows = buildPrestationBreakdown(
      yearPassages.map((p) => ({ cotation: p.cotation, totalAmount: p.totalAmount })),
    );
    const totalCA = rows.reduce((s, r) => s + r.amount, 0);
    return { rows, totalCA };
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
        <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-5 animate-pulse">
          <div className="h-3 bg-ardoise-200 rounded w-24 mb-3" />
          <div className="h-6 bg-ardoise-200 rounded w-32" />
        </div>
        <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-5 animate-pulse">
          <div className="h-48 bg-ardoise-200 rounded" />
        </div>
      </div>
    );
  }

  if (!hp) {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-6 text-center">
        <p className="text-sm text-ardoise-400">Complétez votre profil pour accéder à la facturation.</p>
      </div>
    );
  }

  if (passages.length === 0) {
    return (
      <div>
        <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-6 text-center">
          <p className="text-sm text-ardoise-400">Aucune donnée disponible pour le moment.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Sélecteur d'année global */}
      <div className="flex items-center justify-end gap-2 mb-4">
        <span className="text-xs uppercase tracking-wider text-ardoise-400">Année</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setChartYear((y) => y - 1)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-ardoise-500 hover:text-ardoise-900 hover:bg-ardoise-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span className="text-sm font-semibold text-ardoise-900 w-12 text-center font-mono">{chartYear}</span>
          <button
            type="button"
            onClick={() => setChartYear((y) => y + 1)}
            disabled={chartYear >= new Date().getFullYear()}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-ardoise-500 hover:text-ardoise-900 hover:bg-ardoise-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>

      {/* Summary KPI cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-transparent backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-4">
            <div className="flex items-center gap-2 mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-menthe-600">
                <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.3" />
                <path d="M12 16V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
                <path d="M8 12l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
              </svg>
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium text-ardoise-500">Total CA — Payé</p>
                <InfoBadge tooltip={STATUS_TOOLTIPS.totalCA} />
              </div>
            </div>
            <p className="text-xl font-bold text-ardoise-900 font-mono">{formatCurrency(globalViewData.paye)}</p>
            <p className="text-[10px] text-ardoise-400 mt-0.5">{globalViewData.payeCount} facture{globalViewData.payeCount > 1 ? "s" : ""} — {chartYear}</p>
          </div>

          {globalViewData.attenteCount > 0 && (
            <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-4">
              <div className="flex items-center gap-2 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-amber-600">
                  <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3" />
                  <path d="M12 7v4l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                </svg>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-ardoise-500">En attente</p>
                  <InfoBadge tooltip={STATUS_TOOLTIPS.en_attente} />
                </div>
              </div>
              <p className="text-xl font-bold text-ardoise-900 font-mono">{formatCurrency(globalViewData.en_attente)}</p>
              <p className="text-[10px] text-ardoise-400 mt-0.5">{globalViewData.attenteCount} facture{globalViewData.attenteCount > 1 ? "s" : ""} — {chartYear}</p>
            </div>
          )}

          {globalViewData.rejeteCount > 0 && (
            <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-4">
              <div className="flex items-center gap-2 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-red-500">
                  <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3" />
                  <path d="M15 9l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
                  <path d="M9 9l6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
                </svg>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-ardoise-500">Rejeté</p>
                  <InfoBadge tooltip={STATUS_TOOLTIPS.rejete} />
                </div>
              </div>
              <p className="text-xl font-bold text-ardoise-900 font-mono">{formatCurrency(globalViewData.rejete)}</p>
              <p className="text-[10px] text-ardoise-400 mt-0.5">{globalViewData.rejeteCount} facture{globalViewData.rejeteCount > 1 ? "s" : ""} — {chartYear}</p>
            </div>
          )}

          {avgDelayForYear !== null && (
            <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-4">
              <div className="flex items-center gap-2 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-brand-600">
                  <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3" />
                  <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                </svg>
                <p className="text-xs font-medium text-ardoise-500">Délai moyen</p>
              </div>
              <p className="text-xl font-bold text-ardoise-900 font-mono">{avgDelayForYear}j</p>
              <p className="text-[10px] text-ardoise-400 mt-0.5">Entre soin et virement — {chartYear}</p>
            </div>
          )}
        </div>
      )}

      {/* Chart CA mensuel */}
      <div ref={chartCardRef} className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-base font-bold text-ardoise-900">Facturation mensuelle</h2>
            <p className="text-xs text-ardoise-400">Répartition par statut</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCompareMode((v) => !v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  compareMode
                    ? "bg-ardoise-900 text-white"
                    : "text-ardoise-500 hover:text-ardoise-900 bg-ardoise-100 hover:bg-ardoise-200"
                }`}
              >
                Comparer avec {chartYear - 1}
              </button>
              {compareMode && (
                <select
                  value={compareStatus}
                  onChange={(e) => setCompareStatus(e.target.value as "paye" | "en_attente" | "rejete")}
                  className="border border-ardoise-200 bg-white px-2.5 py-1.5 text-xs rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
                >
                  <option value="paye">Payé</option>
                  <option value="en_attente">En attente</option>
                  <option value="rejete">Rejeté</option>
                </select>
              )}
            </div>
            <Button
              variant="cta"
              size="compact"
              type="button"
              onClick={exportChartToPdf}
              disabled={exporting}
              data-html2canvas-ignore="true"
              title="Exporter le graphique en PDF"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
              {exporting ? "Export..." : "PDF"}
            </Button>
          </div>
        </div>
        <div className="h-40 sm:h-56 min-h-[1px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={1}>
            <BarChart data={chartData} barGap={0}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFEAF6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#A79EB5" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#A79EB5" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} width={45} />
              <Tooltip contentStyle={{ background: "white", border: "1px solid #E1DBEC", borderRadius: 4, fontSize: 13 }} formatter={(value, name) => [formatCurrency(Number(value)), STATUS_CONFIG[String(name)]?.label || String(name)]} />
              <Legend formatter={(value: string) => <span className="text-xs text-ardoise-500">{STATUS_CONFIG[value]?.label || value}</span>} />
              {compareMode ? (
                <>
                  <Bar dataKey={`${compareStatus}_prev`} fill="#C8C1D4" radius={[4, 4, 0, 0]} name={`${STATUS_CONFIG[compareStatus]?.label || compareStatus} ${chartYear - 1}`} />
                  <Bar dataKey={compareStatus} fill={compareStatus === "paye" ? "#2FA169" : compareStatus === "en_attente" ? "#d97706" : "#dc2626"} radius={[4, 4, 0, 0]} name={`${STATUS_CONFIG[compareStatus]?.label || compareStatus} ${chartYear}`} />
                </>
              ) : (
                <>
                  <Bar dataKey="paye" fill="#2FA169" radius={[4, 4, 0, 0]} />
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
      <div className={`bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-5 ${rejectionViewData.total > 0 ? "" : "sm:col-span-2"}`}>
        <div className="mb-5">
          <h2 className="text-base font-bold text-ardoise-900">Vue globale — CA déclaré vs payé</h2>
          <p className="text-xs text-ardoise-400">Répartition annuelle par statut</p>
        </div>

        {globalViewData.declared === 0 ? (
          <p className="text-sm text-ardoise-400 text-center py-8">Aucune donnée pour {chartYear}.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  {(() => {
                    const pieData = [
                      { name: "paye", value: globalViewData.paye, color: "#2FA169" },
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
                    contentStyle={{ background: "white", border: "1px solid #E1DBEC", borderRadius: 4, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ardoise-400">CA déclaré {chartYear}</p>
                <p className="text-xl font-bold text-ardoise-900 font-mono">{formatCurrency(globalViewData.declared)}</p>
              </div>
              <div className="space-y-1.5">
                <SegmentRow color="#2FA169" label="Payé" value={formatCurrency(globalViewData.paye)} pct={globalViewData.pct(globalViewData.paye)} onClick={() => setFilterStatus("paye")} />
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

      {/* Ventilation par prestation (NGAP) */}
      {ngapData.rows.length > 0 && (
        <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
            <div>
              <h2 className="text-base font-bold text-ardoise-900">Ventilation par prestation (NGAP)</h2>
              <p className="text-xs text-ardoise-400">
                CA {chartYear} par acte (lettre-clé + coefficient) — Métropole. Cliquez une ligne pour filtrer le détail.
              </p>
            </div>
            {filterPrestation && (
              <Button variant="ghost" size="compact" type="button" onClick={() => setFilterPrestation("")}>
                Filtre : {ngapData.rows.find((r) => r.key === filterPrestation)?.short ?? filterPrestation} ✕
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            {/* Graphe */}
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={1}>
                <BarChart data={ngapData.rows} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EFEAF6" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "#A79EB5" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  />
                  <YAxis
                    type="category"
                    dataKey="short"
                    tick={{ fontSize: 11, fill: "#6B6478" }}
                    axisLine={false}
                    tickLine={false}
                    width={62}
                  />
                  <Tooltip
                    cursor={{ fill: "#F5F2FB" }}
                    contentStyle={{ background: "white", border: "1px solid #E1DBEC", borderRadius: 4, fontSize: 12 }}
                    formatter={(value: unknown) => [formatCurrency(Number(value)), "CA"]}
                    labelFormatter={(short: unknown) => ngapData.rows.find((r) => r.short === short)?.label ?? String(short)}
                  />
                  <Bar dataKey="amount" radius={[0, 4, 4, 0]} className="cursor-pointer"
                    onClick={(d) => { const key = (d as unknown as { key: string }).key; setFilterPrestation((c) => (c === key ? "" : key)); }}>
                    {ngapData.rows.map((r, i) => (
                      <Cell key={r.key} fill={NGAP_COLORS[i % NGAP_COLORS.length]} opacity={filterPrestation && filterPrestation !== r.key ? 0.35 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Tableau */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-ardoise-400 border-b border-ardoise-200/60">
                    <th className="text-left font-medium py-2 pr-2">Prestation</th>
                    <th className="text-right font-medium py-2 px-2">Passages</th>
                    <th className="text-right font-medium py-2 pl-2">CA</th>
                    <th className="text-right font-medium py-2 pl-2">%</th>
                  </tr>
                </thead>
                <tbody>
                  {ngapData.rows.map((r, i) => {
                    const pct = ngapData.totalCA > 0 ? (r.amount / ngapData.totalCA) * 100 : 0;
                    const active = filterPrestation === r.key;
                    return (
                      <tr
                        key={r.key}
                        onClick={() => setFilterPrestation((c) => (c === r.key ? "" : r.key))}
                        className={`border-b border-ardoise-100 last:border-b-0 cursor-pointer transition-colors ${active ? "bg-brand-50" : "hover:bg-ardoise-50"}`}
                      >
                        <td className="py-2 pr-2">
                          <span className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: NGAP_COLORS[i % NGAP_COLORS.length] }} />
                            <span className="min-w-0">
                              <span className="block text-ardoise-900 leading-tight">{r.label}</span>
                              <span className="block text-[10px] text-ardoise-400 font-mono">{r.short}</span>
                            </span>
                          </span>
                        </td>
                        <td className="text-right py-2 px-2 text-ardoise-500 font-mono align-top">{r.passageCount}</td>
                        <td className="text-right py-2 pl-2 font-semibold text-ardoise-900 font-mono align-top">{formatCurrency(r.amount)}</td>
                        <td className="text-right py-2 pl-2 text-ardoise-400 font-mono align-top">{pct.toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1">
        {/* Header */}
        <div className="px-5 pt-4 pb-0 border-b border-ardoise-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-ardoise-900 mb-4">Détail des passages</h2>
          </div>
          <div className="flex items-center gap-3 pb-3">
            <span className="text-xs text-ardoise-400">
              {filteredPassages.length} passage{filteredPassages.length > 1 ? "s" : ""} — {formatCurrency(filteredTotal)}
            </span>
            {filteredPassages.length > 0 && (
              <>
                <Button
                  variant="cta"
                  size="compact"
                  type="button"
                  onClick={() => {
                    const headers = ["Date", "Moment", "Cabinet", "N° facture", "Statut", "Cotation", "Lettre-clé", "Prestation", "Honoraires", "Majoration", "Férié/Dim/Nuit", "IFD", "Total"];
                    const rows = sortedPassages.map((p) => [
                      formatDateFr(p.careDate), p.careMoment, p.practiceName, p.invoiceNumber,
                      STATUS_CONFIG[displayStatus(p.status)]?.label || p.status,
                      p.cotation, principalCode(p.cotation) ?? "", prestationLabelOf(p.cotation), p.baseAmount, p.adj1, p.adj2, p.adj3, p.totalAmount,
                    ]);
                    downloadCSV("facturation", headers, rows);
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  CSV
                </Button>
                <Button
                  variant="cta"
                  size="compact"
                  type="button"
                  onClick={() => {
                    const headers = ["Date", "Cabinet", "N° facture", "Statut", "Cotation", "Prestation", "Total"];
                    const rows = sortedPassages.map((p) => [
                      formatDateFr(p.careDate), p.practiceName, p.invoiceNumber,
                      STATUS_CONFIG[displayStatus(p.status)]?.label || p.status,
                      p.cotation, prestationLabelOf(p.cotation), formatCurrency(Number(p.totalAmount)),
                    ]);
                    downloadPDF("facturation", "Facturation — Détail des passages", headers, rows);
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  PDF
                </Button>
              </>
            )}
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-ardoise-500 hover:text-ardoise-900 hover:bg-ardoise-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span className="text-sm font-medium text-ardoise-500 min-w-[3rem] text-center font-mono">{page} / {totalPages}</span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-ardoise-500 hover:text-ardoise-900 hover:bg-ardoise-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-ardoise-100 flex flex-wrap items-center gap-3">
          <select
            value={filterPractice}
            onChange={(e) => setFilterPractice(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-ardoise-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
          >
            <option value="">Tous les cabinets</option>
            {practiceOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-ardoise-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
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
            className="px-2.5 py-1.5 text-xs border border-ardoise-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent font-mono"
          />
          <span className="text-xs text-ardoise-400">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-ardoise-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent font-mono"
          />

          {(filterPractice || filterStatus || filterPrestation || dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="compact"
              type="button"
              onClick={() => { setFilterPractice(""); setFilterStatus(""); setFilterPrestation(""); setDateFrom(""); setDateTo(""); }}
            >
              Réinitialiser
            </Button>
          )}
        </div>

        {/* Table content */}
        {filteredPassages.length === 0 ? (
          <div className="p-5 text-center text-sm text-ardoise-400">
            Aucun passage ne correspond aux filtres.
          </div>
        ) : (
          <div className="md:overflow-x-auto">
            {/* Table header — desktop uniquement */}
            <div className="hidden md:grid md:grid-cols-[14fr_9fr_19fr_8fr_11fr_11fr_11fr] md:min-w-[760px] border-b border-ardoise-200/60">
              <SortableHeader column="practiceName" label="Cabinet" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
              <SortableHeader column="careDate" label="Date" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
              <SortableHeader column="prestation" label="Prestation" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
              <SortableHeader column="careMoment" label="Moment" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
              <SortableHeader column="invoiceNumber" label="N° facture" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
              <SortableHeader column="status" label="Statut" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
              <SortableHeader column="totalAmount" label="Total" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} align="right" />
            </div>

            {/* Rows */}
            {paginatedPassages.map((row) => {
              const style = STATUS_CONFIG[displayStatus(row.status)];
              const tok = principalToken(row.cotation);
              const prestation = tok ? actLabel(tok.code, tok.coefficient) : "—";
              const short = tok ? (tok.coefficient === 1 ? tok.code : `${tok.code} ${tok.coefficient}`) : "";
              return (
                <div key={row.id} className="grid grid-cols-2 md:grid-cols-[14fr_9fr_19fr_8fr_11fr_11fr_11fr] md:min-w-[760px] md:items-center gap-y-1.5 md:gap-y-0 px-4 py-3 md:p-0 border-b border-ardoise-200/60 last:border-b-0 hover:bg-white/50 transition-colors">
                  <div className="order-3 col-span-2 md:order-1 md:col-span-1 text-sm font-medium text-ardoise-900 md:font-normal md:text-ardoise-500 md:truncate md:px-5 md:py-3.5">{row.practiceName}</div>
                  <div className="order-1 md:order-2 text-xs text-ardoise-500 whitespace-nowrap md:text-sm md:text-ardoise-900 md:px-5 md:py-3.5 font-mono">{formatDateFr(row.careDate)}</div>
                  <div className="order-6 col-span-2 md:order-3 md:col-span-1 md:px-5 md:py-3.5 min-w-0">
                    <span className="block text-xs md:text-sm text-ardoise-700 md:truncate" title={`${prestation}${short ? ` (${short})` : ""}`}>
                      <span className="md:hidden text-ardoise-400">Prestation : </span>{prestation}
                    </span>
                    {short && <span className="hidden md:block text-[10px] text-ardoise-400 font-mono">{short}</span>}
                  </div>
                  <div className="hidden md:block md:order-4 md:px-5 md:py-3.5 md:text-sm md:text-ardoise-500">{row.careMoment.charAt(0).toUpperCase() + row.careMoment.slice(1)}</div>
                  <div className="order-4 md:order-5 text-xs text-ardoise-500 md:text-sm md:font-medium md:text-ardoise-900 md:px-5 md:py-3.5"><span className="md:hidden">N° </span>{row.invoiceNumber}</div>
                  <div className="order-5 md:order-6 text-right md:text-left md:px-5 md:py-3.5">
                    {style && (
                      <Badge tone={style.tone} dot>{style.label}</Badge>
                    )}
                    {row.status === "paye" && (
                      <ReconciliationBadge reconciliation={row.reconciliation} paymentDate={row.paymentDate} />
                    )}
                  </div>
                  <div className="order-2 md:order-7 text-base font-semibold text-right whitespace-nowrap text-ardoise-900 md:px-5 md:py-3.5 font-mono">{formatCurrency(parseFloat(row.totalAmount))}</div>
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

// Libellé de la prestation (acte principal) d'une cotation, pour les exports.
function prestationLabelOf(cotation: string): string {
  const t = principalToken(cotation);
  return t ? actLabel(t.code, t.coefficient) : "";
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
        className="text-[10px] text-menthe-600 mt-1 truncate"
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
  return <p className="text-[10px] text-ardoise-400 mt-1">En attente du virement</p>;
}

function SegmentRow({ color, label, value, pct, onClick }: {
  color: string; label: string; value: string; pct: number; onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="inline-flex items-center gap-1.5 text-xs text-ardoise-600">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }}></span>
        {label}
      </span>
      <span className="text-xs">
        <span className="font-semibold text-ardoise-900 font-mono">{value}</span>
        <span className="text-ardoise-400 ml-1.5 font-mono">{pct.toFixed(0)}%</span>
      </span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center justify-between w-full text-left hover:bg-ardoise-50 rounded-md px-1 py-0.5 transition-colors"
      >
        {inner}
      </button>
    );
  }
  return <div className="flex items-center justify-between w-full px-1 py-0.5">{inner}</div>;
}

const STATUS_TOOLTIPS: Record<string, { dot: string; text: string }> = {
  totalCA: { dot: "bg-menthe-600", text: "Total CA — Payé : somme de toutes les factures pour lesquelles le virement a été reçu." },
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
        className="flex items-center justify-center w-5 h-5 rounded-full bg-ardoise-200 hover:bg-ardoise-300 text-ardoise-500 hover:text-ardoise-700 text-xs font-semibold transition-colors"
      >
        i
      </button>
      {open && (
        <div className="absolute top-7 left-0 w-64 bg-white border border-ardoise-200 rounded-lg shadow-lg p-3 text-xs text-ardoise-600 z-[60]">
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
    <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ardoise-900">Taux de rejet</h2>
          <p className="text-xs text-ardoise-400">Répartition des factures traitées</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAlertModal(true)}
          className={`flex items-center justify-center w-7 h-7 rounded-md transition-all ${
            alertConfigured ? "text-brand-600 hover:bg-brand-50" : "text-ardoise-400 hover:text-ardoise-600 hover:bg-ardoise-100"
          }`}
          title="Alerte seuil"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={alertConfigured ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
        <div className="relative h-40">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              {(() => {
                const pieData = [
                  { name: "ok", value: okCount, color: "#2FA169" },
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
                contentStyle={{ background: "white", border: "1px solid #E1DBEC", borderRadius: 4, fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <span className={`absolute inset-0 flex items-center justify-center pointer-events-none text-xl font-bold font-mono ${rejectedCount > 0 ? "text-red-600" : "text-menthe-600"}`}>
            {rejectPct.toFixed(1)}%
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ardoise-400">Total traité {year}</p>
            <p className="text-xl font-bold text-ardoise-900">{total} facture{total > 1 ? "s" : ""}</p>
          </div>
          <div className="space-y-1.5">
            <SegmentRow color="#2FA169" label="Non rejetées" value={String(okCount)} pct={okPct} />
            <SegmentRow color="#dc2626" label="Rejetées" value={String(rejectedCount)} pct={rejectPct} />
          </div>
        </div>
      </div>

      <Modal open={showAlertModal} onClose={() => setShowAlertModal(false)}>
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="text-lg font-bold text-ardoise-900">Alerte taux de rejet</h3>
            <p className="text-sm text-ardoise-500 mt-1">
              Recevez un email si plus d&apos;un certain pourcentage de vos bordereaux des 30 derniers jours sont rejetés.
            </p>
          </div>
          {!alertLoaded ? (
            <div className="py-6 text-center text-sm text-ardoise-400">Chargement…</div>
          ) : (
            <>
              <div>
                <label htmlFor="rejection-threshold" className="block text-sm font-medium text-ardoise-700 mb-1">
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
                  className="w-full border border-ardoise-200 rounded-lg px-3 py-2.5 text-sm text-ardoise-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent font-mono"
                />
                <p className="text-xs text-ardoise-400 mt-1.5">
                  Email envoyé au maximum une fois tous les 14 jours. Échantillon minimum de 10 bordereaux sur la période.
                </p>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  type="button"
                  role="switch"
                  aria-checked={alertEnabled}
                  onClick={() => setAlertEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${alertEnabled ? "bg-brand-600" : "bg-ardoise-200"}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${alertEnabled ? "translate-x-5" : "translate-x-0"}`} />
                </button>
                <span className="text-sm text-ardoise-700">Alerte activée</span>
              </label>
              <Button
                variant="cta"
                type="button"
                disabled={!alertThreshold || alertSaving}
                onClick={saveAlert}
                className="w-full"
              >
                {alertSaving ? "Enregistrement…" : "Enregistrer l'alerte"}
              </Button>
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
          isActive ? "text-ardoise-700" : "text-ardoise-400 hover:text-ardoise-600"
        }`}
      >
        {label}
        <span className="flex flex-col -space-y-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={isActive && sortDirection === "asc" ? "text-ardoise-700" : "text-ardoise-300"}><polyline points="18 15 12 9 6 15"/></svg>
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={isActive && sortDirection === "desc" ? "text-ardoise-700" : "text-ardoise-300"}><polyline points="6 9 12 15 18 9"/></svg>
        </span>
      </button>
    </div>
  );
}
