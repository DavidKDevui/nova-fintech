export type CalendarEvent = {
  day: number;
  label: string;
  type: "urssaf" | "carpimko" | "ir" | "cfe" | "tf" | "declaration";
  estimatedAmount?: number;
};

export type PaymentPreferences = {
  urssafFrequency: "monthly" | "quarterly";
  urssafPayDay: "5" | "20";
  pasFrequency: "monthly" | "quarterly";
  carpimkoFrequency: "monthly" | "semi_annual";
};

export const DEFAULT_PREFERENCES: PaymentPreferences = {
  urssafFrequency: "monthly",
  urssafPayDay: "5",
  pasFrequency: "monthly",
  carpimkoFrequency: "monthly",
};

export const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export const EVENT_DOT: Record<string, string> = {
  urssaf: "bg-blue-500",
  carpimko: "bg-amber-500",
  ir: "bg-violet-500",
  cfe: "bg-emerald-500",
  tf: "bg-teal-500",
  declaration: "bg-red-500",
};

export const EVENT_BADGE: Record<string, string> = {
  urssaf: "bg-blue-50 text-blue-700",
  carpimko: "bg-amber-50 text-amber-700",
  ir: "bg-violet-50 text-violet-700",
  cfe: "bg-emerald-50 text-emerald-700",
  tf: "bg-teal-50 text-teal-700",
  declaration: "bg-red-50 text-red-700",
};

export const EVENT_LABEL: Record<string, string> = {
  urssaf: "URSSAF",
  carpimko: "CARPIMKO",
  ir: "Impôt revenu",
  cfe: "CFE",
  tf: "T. foncière",
  declaration: "Décla",
};

// URSSAF quarterly months: Feb(1), May(4), Aug(7), Nov(10)
const URSSAF_QUARTERLY_MONTHS = new Set([1, 4, 7, 10]);

// PAS quarterly months: Feb(1), May(4), Aug(7), Nov(10)
const PAS_QUARTERLY_MONTHS = new Set([1, 4, 7, 10]);

// CARPIMKO monthly: Jan(0)→Oct(9), nothing Nov/Dec
const CARPIMKO_MONTHLY_MONTHS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

// Fixed events that don't depend on preferences
const FIXED_EVENTS: Record<number, CalendarEvent[]> = {
  4: [
    { day: 5, label: "Date limite déclaration 2035 (papier) + DAS2", type: "declaration" },
    { day: 20, label: "Date limite 2035 (télétransmission) + DAS2 en ligne", type: "declaration" },
    { day: 21, label: "Date limite 2042 C Pro (dept 01-19)", type: "declaration" },
    { day: 28, label: "Date limite 2042 C Pro (dept 20-54)", type: "declaration" },
  ],
  5: [
    { day: 4, label: "Date limite 2042 C Pro (dept 55-976)", type: "declaration" },
    { day: 15, label: "Acompte CFE (si > 3 000 EUR)", type: "cfe" },
    { day: 30, label: "Date limite adhésion mensualisation TF", type: "tf" },
  ],
  8: [
    { day: 30, label: "Date limite option PAS trimestriel pour N+1", type: "declaration" },
  ],
  9: [
    { day: 15, label: "Date limite taxe foncière (non démat.)", type: "tf" },
    { day: 20, label: "Date limite taxe foncière (en ligne)", type: "tf" },
  ],
  11: [
    { day: 15, label: "Solde CFE — date limite", type: "cfe" },
    { day: 31, label: "Déclaration initiale CFE (si création)", type: "declaration" },
  ],
};

export function buildCalendar(prefs: PaymentPreferences = DEFAULT_PREFERENCES): Record<number, CalendarEvent[]> {
  const calendar: Record<number, CalendarEvent[]> = {};

  const urssafDay = parseInt(prefs.urssafPayDay);

  for (let month = 0; month < 12; month++) {
    const events: CalendarEvent[] = [];

    // ── URSSAF ──
    if (prefs.urssafFrequency === "monthly") {
      const isNov = month === 10;
      events.push({
        day: urssafDay,
        label: isNov ? `URSSAF (mensuel) + CFP + URPS` : `URSSAF (mensuel)`,
        type: "urssaf",
      });
    } else if (URSSAF_QUARTERLY_MONTHS.has(month)) {
      const q = month === 1 ? "T1" : month === 4 ? "T2" : month === 7 ? "T3" : "T4";
      const isNov = month === 10;
      events.push({
        day: 5,
        label: isNov ? `URSSAF (${q} trimestriel) + CFP + URPS` : `URSSAF (${q} trimestriel)`,
        type: "urssaf",
      });
    }

    // ── PAS (impôt sur le revenu) ──
    if (prefs.pasFrequency === "monthly") {
      const label = month === 8
        ? "PAS — nouveau taux appliqué + régularisation IR"
        : "PAS Impôt sur le revenu";
      events.push({ day: 15, label, type: "ir" });
    } else if (PAS_QUARTERLY_MONTHS.has(month)) {
      const q = month === 1 ? "T1" : month === 4 ? "T2" : month === 7 ? "T3" : "T4";
      events.push({
        day: 15,
        label: `PAS Impôt sur le revenu (${q})`,
        type: "ir",
      });
    }

    // ── CARPIMKO ──
    if (prefs.carpimkoFrequency === "monthly") {
      if (CARPIMKO_MONTHLY_MONTHS.has(month)) {
        const label = month === 9
          ? "CARPIMKO (dernier prélèvement mensuel)"
          : "CARPIMKO (mensuel)";
        events.push({ day: 10, label, type: "carpimko" });
      }
    } else {
      // semi_annual: March(2) and September(8)
      if (month === 2) {
        events.push({ day: 25, label: "CARPIMKO (semestriel S1)", type: "carpimko" });
      } else if (month === 8) {
        events.push({ day: 25, label: "CARPIMKO (semestriel S2)", type: "carpimko" });
      }
    }

    // ── Fixed events (CFE, TF, declarations) ──
    if (FIXED_EVENTS[month]) {
      events.push(...FIXED_EVENTS[month]);
    }

    // Sort by day
    events.sort((a, b) => a.day - b.day);
    calendar[month] = events;
  }

  return calendar;
}

// Legacy static calendar (default preferences) — used by /help page
export const CALENDAR = buildCalendar(DEFAULT_PREFERENCES);

export function getUpcomingEvents(
  currentMonth: number,
  currentDay: number,
  count = 3,
  calendar: Record<number, CalendarEvent[]> = CALENDAR,
) {
  const events: (CalendarEvent & { month: number })[] = [];
  for (let offset = 0; offset < count; offset++) {
    const m = (currentMonth + offset) % 12;
    for (const evt of calendar[m] || []) {
      if (offset === 0 && evt.day < currentDay) continue;
      events.push({ ...evt, month: m });
    }
  }
  return events;
}
