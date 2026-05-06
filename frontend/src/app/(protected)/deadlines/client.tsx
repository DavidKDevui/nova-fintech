"use client";

import { useState, useMemo, useEffect } from "react";
import { usePractitioner } from "@/providers/practitioner-provider";
import { useData } from "@/providers/data-provider";
import { getCotisationsEstimate, type CotisationsEstimate } from "@/actions/cotisations-estimate";
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

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

type Filter = "all" | "urssaf" | "carpimko" | "ir" | "cfe" | "tf" | "declaration";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "ir", label: "Impôt revenu" },
  { key: "urssaf", label: "URSSAF" },
  { key: "carpimko", label: "CARPIMKO" },
  { key: "cfe", label: "CFE" },
  { key: "tf", label: "Taxe foncière" },
  { key: "declaration", label: "Déclarations" },
];

export function DeadlinesClient() {
  const hp = usePractitioner();
  const { facturationSummary } = useData();
  const [filter, setFilter] = useState<Filter>("all");
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<CotisationsEstimate | null>(null);

  // Fetch cotisations estimate — use total CA (payé + en attente) for better estimation
  const totalCAForEstimate = useMemo(() => {
    if (!facturationSummary) return 0;
    const { paye, a_securiser, a_envoyer } = facturationSummary.byStatus;
    return paye.total + a_securiser.total + a_envoyer.total;
  }, [facturationSummary]);

  useEffect(() => {
    if (totalCAForEstimate <= 0) return;
    getCotisationsEstimate(totalCAForEstimate).then((res) => {
      if (res) setEstimate(res);
    }).catch(() => {});
  }, [totalCAForEstimate]);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();
  const currentYear = now.getFullYear();

  // Build calendar from practitioner preferences
  const prefs: PaymentPreferences = useMemo(() => {
    if (!hp) return DEFAULT_PREFERENCES;
    return {
      urssafFrequency: hp.urssafFrequency,
      urssafPayDay: hp.urssafPayDay,
      pasFrequency: hp.pasFrequency,
      carpimkoFrequency: hp.carpimkoFrequency,
    };
  }, [hp]);

  // Determine the last month with facturation data
  const lastMonthWithData = useMemo(() => {
    if (!facturationSummary || facturationSummary.passageCount === 0) return -1;
    return currentMonth; // on a des données jusqu'au mois en cours
  }, [facturationSummary, currentMonth]);

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
    const events = getUpcomingEvents(currentMonth, currentDay, 6, calendar, { maxDays: 30 });
    if (filter === "all") return events;
    return events.filter((e) => e.type === filter);
  }, [currentMonth, currentDay, filter, calendar]);

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

  // Summary of active preferences
  const prefsSummary = [
    `URSSAF ${prefs.urssafFrequency === "monthly" ? `mensuel (le ${prefs.urssafPayDay})` : "trimestriel"}`,
    `PAS ${prefs.pasFrequency === "monthly" ? "mensuel" : "trimestriel"}`,
    `CARPIMKO ${prefs.carpimkoFrequency === "monthly" ? "mensuel" : "semestriel"}`,
  ].join(" · ");

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold mb-1">Échéances</h1>
        <p className="text-sm text-gray-400">Calendrier de vos prélèvements et déclarations obligatoires.</p>
        <p className="text-xs text-gray-300 mt-1">{prefsSummary}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Prochaine échéance</p>
          {nextEvent ? (
            <>
              <p className="text-2xl font-bold text-gray-900">{nextEvent.day} {MONTH_NAMES[nextEvent.month]?.slice(0, 3)}</p>
              <p className="text-xs text-gray-500 mt-1 truncate">{nextEvent.label}</p>
              {nextEvent.estimatedAmount != null && nextEvent.estimatedAmount > 0 ? (
                <p className="text-xs font-semibold text-brand-600 mt-0.5">~{formatCurrency(nextEvent.estimatedAmount)}</p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-gray-400">Aucune</p>
          )}
        </div>
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Ce mois-ci</p>
          <p className="text-2xl font-bold text-gray-900">{remainingThisMonth} <span className="text-base font-normal text-gray-400">restante{remainingThisMonth > 1 ? "s" : ""}</span></p>
          <p className="text-xs text-gray-500 mt-1">{passedThisMonth} passée{passedThisMonth > 1 ? "s" : ""} / {totalThisMonth} au total</p>
        </div>
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Cotisations annuelles estimées</p>
          {estimate ? (
            <>
              <p className="text-2xl font-bold text-gray-900">~{formatCurrency(estimate.urssafAnnuel + estimate.carpimkoAnnuel + estimate.pasAnnuel)}</p>
              <p className="text-xs text-gray-500 mt-1">
                URSSAF {formatCurrency(estimate.urssafAnnuel)} · CARPIMKO {formatCurrency(estimate.carpimkoAnnuel)} · IR {formatCurrency(estimate.pasAnnuel)}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400">Données insuffisantes</p>
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
                  ? "bg-gray-900 text-white"
                  : `${EVENT_BADGE[f.key]} ring-1 ring-current`
                : "bg-gray-100 text-gray-500 hover:text-gray-900"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Upcoming + Calendar side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* Upcoming list */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg overflow-hidden flex flex-col lg:max-h-[540px]">
        <div className="px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-sm font-bold text-gray-900">Prochaines échéances</h2>
          <p className="text-xs text-gray-400 mt-0.5">{upcoming.length} échéance{upcoming.length > 1 ? "s" : ""} dans les 30 prochains jours</p>
        </div>
        {upcoming.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Aucune échéance à venir pour ce filtre.</p>
        ) : (
          <div className="divide-y divide-gray-100 overflow-y-auto flex-1">
            {upcoming.map((evt, i) => {
              const daysUntil = getDaysUntil(currentMonth, currentDay, evt.month, evt.day);
              return (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/40 transition-colors">
                  <div className="w-14 shrink-0">
                    <p className="text-[10px] uppercase text-gray-400">{MONTH_NAMES[evt.month]?.slice(0, 3)}</p>
                    <p className="text-xl font-bold text-gray-900 -mt-0.5">{evt.day}</p>
                  </div>
                  <div className="w-16 flex items-center justify-center shrink-0">
                    {evt.type === "urssaf" ? (
                      <img src="/logo-urssaf.svg" alt="URSSAF" className="h-5 w-full object-contain" />
                    ) : evt.type === "carpimko" ? (
                      <img src="/logo-carpimko.png" alt="CARPIMKO" className="h-5 w-full object-contain" />
                    ) : evt.type === "ir" ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M2 10h2m16 0h2M2 14h2m16 0h2"/></svg>
                    ) : evt.type === "cfe" ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/></svg>
                    ) : evt.type === "tf" ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-teal-500"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{evt.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {daysUntil === 0 ? "Aujourd'hui" : daysUntil === 1 ? "Demain" : `Dans ${daysUntil} jours`}
                    </p>
                  </div>
                  {evt.estimatedAmount != null && evt.estimatedAmount > 0 ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-sm font-semibold text-gray-900">~{formatCurrency(evt.estimatedAmount)}</span>
                      <div className="relative group">
                        <div className="w-4 h-4 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-[10px] font-bold cursor-help hover:bg-gray-200 hover:text-gray-600 transition-colors">i</div>
                        <div className="absolute right-0 top-6 w-72 bg-gray-900 text-white text-xs rounded-lg px-3.5 py-3 hidden group-hover:block z-[9999] shadow-lg space-y-2">
                          {getEstimateTooltip(evt.type, estimate, prefs)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-gray-300 shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
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
      <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg overflow-hidden">
        {/* Month navigation */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button
            onClick={() => { setCalMonth(Math.max(0, calMonth - 1)); setSelectedDay(null); }}
            disabled={calMonth <= 0}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="text-center">
            <h2 className="text-sm font-bold text-gray-900">{MONTH_NAMES[calMonth]} {currentYear}</h2>
          </div>
          <button
            onClick={() => { setCalMonth(Math.min(11, calMonth + 1)); setSelectedDay(null); }}
            disabled={calMonth >= 11}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        {/* Grid */}
        <div className="px-4 py-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-xs font-semibold uppercase tracking-wider text-gray-400 py-1">
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
                    ${isSelected ? "bg-gray-900 text-white" : ""}
                    ${!isSelected && isToday ? "bg-blue-50 text-blue-700 font-bold" : ""}
                    ${!isSelected && !isToday && hasEvents ? "hover:bg-gray-100 cursor-pointer" : ""}
                    ${!isSelected && !isToday && !hasEvents ? "text-gray-300 cursor-default" : ""}
                    ${!isSelected && !isToday && hasEvents && !isPast ? "text-gray-900 font-medium" : ""}
                    ${!isSelected && !isToday && hasEvents && isPast ? "text-gray-400" : ""}
                    ${!isSelected && !isToday && !hasEvents && isPast ? "text-gray-200" : ""}
                  `}
                >
                  <span className="text-sm">{day}</span>
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
          <div className="border-t border-gray-100">
            <div className="px-3 py-2 bg-gray-50">
              <p className="text-[10px] font-semibold text-gray-900">
                {selectedDay} {MONTH_NAMES[calMonth]} — {selectedDayEvents.length} échéance{selectedDayEvents.length > 1 ? "s" : ""}
              </p>
            </div>
            <div className="divide-y divide-gray-100">
              {selectedDayEvents.map((evt, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${EVENT_DOT[evt.type]}`} />
                  <p className="text-xs text-gray-800 flex-1">{evt.label}</p>
                  {evt.estimatedAmount != null && evt.estimatedAmount > 0 ? (
                    <span className="text-xs font-semibold text-gray-700 shrink-0">~{formatCurrency(evt.estimatedAmount)}</span>
                  ) : null}
                  <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0 ${EVENT_BADGE[evt.type]}`}>
                    {EVENT_LABEL[evt.type]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      </div>{/* end grid */}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-400">
        {Object.entries(EVENT_DOT).map(([key, color]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${color}`} /> {EVENT_LABEL[key]}
          </span>
        ))}
      </div>
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

  return (
    <>
      <p className="font-semibold text-white/90">{label}</p>
      <div className="space-y-1 text-[11px] text-white/70">
        <div className="flex justify-between">
          <span>CA annualisé</span>
          <span className="text-white font-medium">{formatCurrency(estimate.revenuAnnualise)}</span>
        </div>
        <div className="flex justify-between">
          <span>Cotisation annuelle</span>
          <span className="text-white font-medium">{formatCurrency(annuel)}</span>
        </div>
        <div className="border-t border-white/10 pt-1 flex justify-between">
          <span>Par échéance ({freq})</span>
          <span className="text-white font-semibold">{formatCurrency(echeance)}</span>
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

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
}
