"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { usePractitioner } from "@/providers/practitioner-provider";
import { useData } from "@/providers/data-provider";
import { type CotisationsEstimate } from "@/actions/cotisations-estimate";
import {
  buildCalendar,
  MONTH_NAMES,
  EVENT_DOT,
  EVENT_BADGE,
  EVENT_LABEL,
  getUpcomingEvents,
  type CalendarEvent,
  type PaymentPreferences,
  DEFAULT_PREFERENCES,
} from "@/lib/data/fiscal-calendar";
import { downloadCSV, downloadPDF } from "@/lib/export";
import { ExportButtons } from "@/components/export-buttons";
import { DataMissingOverlay } from "@/components/data-missing-overlay";
import { CASourceIndicator } from "@/components/ca-source-indicator";

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

type Filter = "all" | "urssaf" | "carpimko" | "ir" | "cfe" | "declaration";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "ir", label: "Impôt revenu" },
  { key: "urssaf", label: "URSSAF" },
  { key: "carpimko", label: "CARPIMKO" },
  { key: "cfe", label: "CFE" },
  { key: "declaration", label: "Déclarations" },
];

export function DeadlinesClient() {
  const hp = usePractitioner();
  const { facturationSummary, effectiveCA, cotisationsEstimate: estimate } = useData();
  const [filter, setFilter] = useState<Filter>("all");
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [calExporting, setCalExporting] = useState(false);
  const calendarCardRef = useRef<HTMLDivElement>(null);

  async function exportCalendarToPdf() {
    if (!calendarCardRef.current) return;
    setCalExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(calendarCardRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
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
      pdf.text(`Calendrier fiscal — ${MONTH_NAMES[calMonth]} ${new Date().getFullYear()}`, margin, margin);
      pdf.addImage(imgData, "PNG", x, y, w, h);
      pdf.save(`calendrier-fiscal-${new Date().getFullYear()}-${String(calMonth + 1).padStart(2, "0")}.pdf`);
    } finally {
      setCalExporting(false);
    }
  }

  // effectiveCA + estimation cotisations : centralisés dans DataProvider (useData ci-dessus).

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();
  const currentYear = now.getFullYear();

  const bankConnected = !!hp?.bridgeUserUuid;

  // Build calendar from practitioner preferences
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

  // Determine the last month with facturation data
  const lastMonthWithData = useMemo(() => {
    if (!facturationSummary || facturationSummary.passageCount === 0) return -1;
    return new Date().getMonth(); // on a des données jusqu'au mois en cours
  }, [facturationSummary]);

  const calendar = useMemo(() => {
    const cal = buildCalendar(prefs);
    if (!estimate || lastMonthWithData < 0) return cal;

    // Only enrich events for months where we have data
    for (const month of Object.keys(cal)) {
      const m = Number(month);
      if (m > lastMonthWithData) continue;
      for (const evt of cal[m]) {
        if (evt.type === "urssaf") {
          evt.estimatedAmount = estimate.urssafParEcheance;
        } else if (evt.type === "carpimko") {
          evt.estimatedAmount = estimate.carpimkoParEcheance;
        } else if (evt.type === "ir") {
          evt.estimatedAmount = estimate.pasParEcheance;
        }
      }
    }
    return cal;
  }, [prefs, estimate, lastMonthWithData]);

  const upcoming = useMemo(() => {
    const now = new Date();
    const events = getUpcomingEvents(now.getMonth(), now.getDate(), 6, calendar, { maxDays: 30 });
    if (filter === "all") return events;
    return events.filter((e) => e.type === filter);
  }, [filter, calendar]);

  const calendarEvents = useMemo(() => {
    const events = calendar[calMonth] || [];
    if (filter === "all") return events;
    return events.filter((e) => e.type === filter);
  }, [calMonth, filter, calendar]);

  const eventsByDay = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (const evt of calendarEvents) {
      const existing = map.get(evt.day) || [];
      existing.push(evt);
      map.set(evt.day, existing);
    }
    return map;
  }, [calendarEvents]);

  const daysInMonth = new Date(currentYear, calMonth + 1, 0).getDate();
  const firstDayOfWeek = (new Date(currentYear, calMonth, 1).getDay() + 6) % 7;

  const allThisMonth = calendar[currentMonth] || [];
  const totalThisMonth = allThisMonth.length;
  const passedThisMonth = allThisMonth.filter((e) => e.day < currentDay).length;
  const remainingThisMonth = totalThisMonth - passedThisMonth;
  const nextEvent = upcoming[0];

  const selectedDayEvents = selectedDay ? (eventsByDay.get(selectedDay) || []) : [];

  // Construit la liste plate des échéances à exporter (filtre actif appliqué).
  const exportRows = useMemo(() => {
    const yearNow = new Date().getFullYear();
    const headers = ["Date", "Type", "Libellé", "Montant estimé"];
    const rows = upcoming.map((evt) => {
      const dateStr = `${String(evt.day).padStart(2, "0")}/${String(evt.month + 1).padStart(2, "0")}/${yearNow}`;
      return [
        dateStr,
        EVENT_LABEL[evt.type] ?? evt.type,
        evt.label,
        evt.estimatedAmount && evt.estimatedAmount > 0 ? Math.round(evt.estimatedAmount) : "",
      ];
    });
    return { headers, rows };
  }, [upcoming]);

  const handleExportCsv = useCallback(() => {
    const filterSuffix = filter !== "all" ? `_${filter}` : "";
    downloadCSV(`echeances${filterSuffix}`, exportRows.headers, exportRows.rows);
  }, [exportRows, filter]);

  const handleExportPdf = useCallback(() => {
    const rowsFormatted = exportRows.rows.map((r) =>
      r.map((cell, i) => (i === 3 && typeof cell === "number" ? formatCurrency(cell) : cell)),
    );
    const filterLabel = FILTERS.find((f) => f.key === filter)?.label ?? "Tout";
    const totalEstime = upcoming.reduce((s, e) => s + (e.estimatedAmount ?? 0), 0);
    const filterSuffix = filter !== "all" ? `_${filter}` : "";
    downloadPDF(`echeances${filterSuffix}`, "Mes prochaines échéances fiscales", exportRows.headers, rowsFormatted, {
      subtitle: `Filtre : ${filterLabel} — 30 prochains jours`,
      summary: [
        { label: "Nombre d'échéances", value: String(upcoming.length) },
        { label: "Total estimé", value: totalEstime > 0 ? `~${formatCurrency(Math.round(totalEstime))}` : "—" },
      ],
    });
  }, [exportRows, filter, upcoming]);

  return (
    <div className="space-y-6">

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ardoise-400 mb-1">Prochaine échéance</p>
          {nextEvent ? (
            <>
              <p className="text-2xl font-bold text-ardoise-900">{formatCountdown(getDaysUntil(currentMonth, currentDay, nextEvent.month, nextEvent.day))}</p>
              <p className="text-xs text-ardoise-500 mt-1 truncate">{nextEvent.label}</p>
              {nextEvent.estimatedAmount != null && nextEvent.estimatedAmount > 0 ? (
                <p className="text-xs font-semibold text-brand-600 mt-0.5 font-mono">~{formatCurrency(nextEvent.estimatedAmount)}</p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-ardoise-400">Aucune</p>
          )}
        </div>
        <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ardoise-400 mb-1">Ce mois-ci</p>
          <p className="text-2xl font-bold text-ardoise-900">{remainingThisMonth} <span className="text-base font-normal text-ardoise-400">restante{remainingThisMonth > 1 ? "s" : ""}</span></p>
          <p className="text-xs text-ardoise-500 mt-1">{passedThisMonth} passée{passedThisMonth > 1 ? "s" : ""} / {totalThisMonth} au total</p>
        </div>
        <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ardoise-400 mb-1 inline-flex items-center gap-1.5">
            Cotisations annuelles estimées
            <CASourceIndicator source={effectiveCA.source} />
          </p>
          {estimate ? (
            <>
              <p className="text-2xl font-bold text-ardoise-900 font-mono">~{formatCurrency(estimate.urssafAnnuel + estimate.carpimkoAnnuel + estimate.pasAnnuel)}</p>
              <div className="flex flex-col gap-0.5 mt-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-ardoise-400"><span className={`w-1.5 h-1.5 rounded-full ${EVENT_DOT.urssaf}`} />URSSAF</span>
                  <span className="text-ardoise-700 font-medium font-mono">{formatCurrency(estimate.urssafAnnuel)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-ardoise-400"><span className={`w-1.5 h-1.5 rounded-full ${EVENT_DOT.carpimko}`} />CARPIMKO</span>
                  <span className="text-ardoise-700 font-medium font-mono">{formatCurrency(estimate.carpimkoAnnuel)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-ardoise-400"><span className={`w-1.5 h-1.5 rounded-full ${EVENT_DOT.ir}`} />Impôt revenu</span>
                  <span className="text-ardoise-700 font-medium font-mono">{formatCurrency(estimate.pasAnnuel)}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-ardoise-400">Données insuffisantes</p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
              filter === f.key
                ? f.key === "all"
                  ? "bg-ardoise-900 text-white"
                  : `${EVENT_BADGE[f.key]} ring-1 ring-current`
                : "bg-ardoise-100 text-ardoise-500 hover:text-ardoise-900"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Upcoming + Calendar side by side */}
      <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DataMissingOverlay bankConnected={bankConnected} />

      {/* Upcoming list */}
      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 overflow-hidden flex flex-col lg:max-h-[540px]">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-ardoise-100 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-ardoise-900">Prochaines échéances</h2>
            <p className="text-xs text-ardoise-400 mt-0.5">{upcoming.length} échéance{upcoming.length > 1 ? "s" : ""} dans les 30 prochains jours</p>
          </div>
          <ExportButtons
            onCsv={handleExportCsv}
            onPdf={handleExportPdf}
            disabled={upcoming.length === 0}
          />
        </div>
        {upcoming.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ardoise-400 text-center">Aucune échéance à venir pour ce filtre.</p>
        ) : (
          <div className="divide-y divide-ardoise-100 overflow-y-auto flex-1">
            {upcoming.map((evt, i) => {
              const daysUntil = getDaysUntil(currentMonth, currentDay, evt.month, evt.day);
              return (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/40 transition-colors">
                  <div className="w-14 shrink-0">
                    <p className="text-[10px] uppercase text-ardoise-400">{MONTH_NAMES[evt.month]?.slice(0, 3)}</p>
                    <p className="text-xl font-bold text-ardoise-900 -mt-0.5 font-mono">{evt.day}</p>
                  </div>
                  <div className="w-16 flex items-center justify-center shrink-0">
                    {evt.type === "urssaf" ? (
                      // eslint-disable-next-line @next/next/no-img-element -- static logo asset
                      <img src="/logo-urssaf.svg" alt="URSSAF" className="h-5 w-full object-contain" />
                    ) : evt.type === "carpimko" ? (
                      // eslint-disable-next-line @next/next/no-img-element -- static logo asset
                      <img src="/logo-carpimko.png" alt="CARPIMKO" className="h-5 w-full object-contain" />
                    ) : evt.type === "ir" ? (
                      // eslint-disable-next-line @next/next/no-img-element -- static logo asset
                      <img src="/logo-dgfip.svg" alt="DGFiP" className="h-7 w-full object-contain" />
                    ) : evt.type === "cfe" ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-menthe-500"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ardoise-800">{evt.label}</p>
                    <p className="text-xs text-ardoise-400 mt-0.5">
                      {daysUntil === 0 ? "Aujourd'hui" : daysUntil === 1 ? "Demain" : `Dans ${daysUntil} jours`}
                    </p>
                  </div>
                  {evt.estimatedAmount != null && evt.estimatedAmount > 0 ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-sm font-semibold text-ardoise-900 font-mono">~{formatCurrency(evt.estimatedAmount)}</span>
                      <div className="relative group">
                        <div className="w-4 h-4 rounded-full bg-ardoise-100 text-ardoise-400 flex items-center justify-center text-[10px] font-bold cursor-help hover:bg-ardoise-200 hover:text-ardoise-600 transition-colors">i</div>
                        <div className="absolute right-0 top-6 w-72 bg-ardoise-900 text-white text-xs rounded-lg px-3.5 py-3 hidden group-hover:block z-[9999] shadow-lg space-y-2">
                          {getEstimateTooltip(evt.type, estimate, prefs)}
                        </div>
                      </div>
                    </div>
                  ) : evt.estimatedAmount === 0 ? (
                    <span className="text-xs font-medium text-menthe-600 shrink-0">Exonéré</span>
                  ) : evt.type === "declaration" ? null : (
                    <span className="flex items-center gap-1 text-xs text-ardoise-300 shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      Estimation à venir
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Calendar Grid ── */}
      <div ref={calendarCardRef} className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 overflow-hidden">
        {/* Month navigation */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ardoise-100">
          <button
            onClick={() => { setCalMonth(Math.max(0, calMonth - 1)); setSelectedDay(null); }}
            disabled={calMonth <= 0}
            data-html2canvas-ignore="true"
            className="p-1.5 rounded hover:bg-ardoise-100 text-ardoise-400 hover:text-ardoise-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="text-center">
            <h2 className="text-sm font-bold text-ardoise-900">{MONTH_NAMES[calMonth]} {currentYear}</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={exportCalendarToPdf}
              disabled={calExporting}
              data-html2canvas-ignore="true"
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md bg-ardoise-100 text-ardoise-700 hover:bg-ardoise-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Exporter le calendrier en PDF"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
              {calExporting ? "..." : "PDF"}
            </button>
            <button
              onClick={() => { setCalMonth(Math.min(11, calMonth + 1)); setSelectedDay(null); }}
              disabled={calMonth >= 11}
              data-html2canvas-ignore="true"
              className="p-1 rounded hover:bg-ardoise-100 text-ardoise-400 hover:text-ardoise-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="px-4 py-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-xs font-semibold uppercase tracking-wider text-ardoise-400 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="h-20" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayEvents = eventsByDay.get(day) || [];
              const hasEvents = dayEvents.length > 0;
              const isToday = calMonth === currentMonth && day === currentDay;
              const isPast = calMonth < currentMonth || (calMonth === currentMonth && day < currentDay);
              const isSelected = selectedDay === day;
              const eventTypes = [...new Set(dayEvents.map((e) => e.type))];

              return (
                <button
                  key={day}
                  onClick={() => hasEvents ? setSelectedDay(isSelected ? null : day) : setSelectedDay(null)}
                  className={`
                    h-20 flex flex-col items-center justify-center rounded-md transition-all
                    ${isSelected ? "bg-ardoise-900 text-white" : ""}
                    ${!isSelected && isToday ? "bg-violet-50 text-violet-700 font-bold" : ""}
                    ${!isSelected && !isToday && hasEvents ? "hover:bg-ardoise-100 cursor-pointer" : ""}
                    ${!isSelected && !isToday && !hasEvents ? "text-ardoise-300 cursor-default" : ""}
                    ${!isSelected && !isToday && hasEvents && !isPast ? "text-ardoise-900 font-medium" : ""}
                    ${!isSelected && !isToday && hasEvents && isPast ? "text-ardoise-400" : ""}
                    ${!isSelected && !isToday && !hasEvents && isPast ? "text-ardoise-200" : ""}
                  `}
                >
                  <span className="text-sm font-mono">{day}</span>
                  {hasEvents && (
                    <div className="flex gap-0.5 mt-0.5">
                      {eventTypes.slice(0, 3).map((type) => (
                        <div
                          key={type}
                          className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white/70" : EVENT_DOT[type]}`}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected day detail */}
        {selectedDay && selectedDayEvents.length > 0 && (
          <div className="border-t border-ardoise-100">
            <div className="px-3 py-2 bg-ardoise-50">
              <p className="text-[10px] font-semibold text-ardoise-900">
                {selectedDay} {MONTH_NAMES[calMonth]} — {selectedDayEvents.length} échéance{selectedDayEvents.length > 1 ? "s" : ""}
              </p>
            </div>
            <div className="divide-y divide-ardoise-100">
              {selectedDayEvents.map((evt, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${EVENT_DOT[evt.type]}`} />
                  <p className="text-xs text-ardoise-800 flex-1">{evt.label}</p>
                  {evt.estimatedAmount != null && evt.estimatedAmount > 0 ? (
                    <span className="text-xs font-semibold text-ardoise-700 shrink-0 font-mono">~{formatCurrency(evt.estimatedAmount)}</span>
                  ) : null}
                  <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0 ${EVENT_BADGE[evt.type]}`}>
                    {EVENT_LABEL[evt.type]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-x-5 gap-y-2 px-4 py-3 border-t border-ardoise-100 text-xs text-ardoise-400">
          {Object.entries(EVENT_DOT).map(([key, color]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${color}`} /> {EVENT_LABEL[key]}
            </span>
          ))}
        </div>
      </div>

      </div>{/* end grid */}
    </div>
  );
}

function getEstimateTooltip(
  type: string,
  estimate: CotisationsEstimate | null,
  prefs: PaymentPreferences,
) {
  if (!estimate) return null;

  let label = "";
  let annuel = 0;
  let echeance = 0;
  let freq = "";

  const currentYear = new Date().getFullYear();

  if (type === "urssaf") {
    label = "URSSAF";
    annuel = estimate.urssafAnnuel;
    echeance = estimate.urssafParEcheance;
    freq = prefs.urssafFrequency === "monthly" ? "12 mensualités" : "4 trimestres";
  } else if (type === "carpimko") {
    label = "CARPIMKO";
    annuel = estimate.carpimkoAnnuel;
    echeance = estimate.carpimkoParEcheance;
    freq = prefs.carpimkoFrequency === "monthly" ? "10 mensualités (jan-oct)" : "2 semestres";
  } else if (type === "ir") {
    label = "Impôt sur le revenu (PAS)";
    annuel = estimate.pasAnnuel;
    echeance = estimate.pasParEcheance;
    freq = prefs.pasFrequency === "monthly" ? "12 mensualités" : "4 trimestres";
  } else {
    return null;
  }

  const isUrssaf = type === "urssaf";
  let baseRevenu = estimate.revenuAnnualise;
  let baseLabel = "CA encaissé, annualisé sur 12 mois";
  let sourceLabel = "Estimation basée sur votre CA encaissé";

  if (isUrssaf) {
    if (estimate.urssafBase === "forfaitaire") {
      baseRevenu = Math.round(estimate.pss * 0.19);
      baseLabel = `Base forfaitaire (19% du PASS ${currentYear})`;
      sourceLabel = "Début d'activité : base forfaitaire URSSAF";
    } else if (estimate.urssafBase === "n2" && estimate.revenuN2 != null) {
      baseRevenu = estimate.revenuN2;
      baseLabel = `CA encaissé ${currentYear - 2} (N-2)`;
      sourceLabel = `Basé sur vos revenus ${currentYear - 2} (N-2)`;
    }
  }

  return (
    <>
      <p className="font-semibold text-white/90">{label}</p>
      <p className="text-[10px] text-white/50">{sourceLabel}</p>
      <div className="space-y-1.5 text-[11px] text-white/70 mt-2">
        <div className="flex justify-between gap-4">
          <span>{isUrssaf ? baseLabel : "Votre CA encaissé, annualisé sur 12 mois"}</span>
          <span className="text-white font-medium shrink-0 font-mono">{formatCurrency(isUrssaf ? baseRevenu : estimate.revenuAnnualise)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Cotisation annuelle estimée</span>
          <span className="text-white font-medium shrink-0 font-mono">{formatCurrency(annuel)}</span>
        </div>
        <div className="border-t border-white/10 pt-1.5 flex justify-between gap-4">
          <span>Montant par échéance ({freq})</span>
          <span className="text-white font-semibold shrink-0 font-mono">{formatCurrency(echeance)}</span>
        </div>
      </div>
    </>
  );
}

function getDaysUntil(currentMonth: number, currentDay: number, targetMonth: number, targetDay: number): number {
  const now = new Date();
  const target = new Date(now.getFullYear(), targetMonth, targetDay);
  const today = new Date(now.getFullYear(), currentMonth, currentDay);
  if (target < today) target.setFullYear(target.getFullYear() + 1);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatCountdown(days: number): string {
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Demain";
  if (days < 7) return `Dans ${days} jours`;
  const weeks = Math.floor(days / 7);
  const remainingDays = days % 7;
  if (remainingDays === 0) return `Dans ${weeks} semaine${weeks > 1 ? "s" : ""}`;
  return `Dans ${weeks} sem. et ${remainingDays} j`;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
}
