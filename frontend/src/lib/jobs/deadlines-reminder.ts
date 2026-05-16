import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { practitioners, users } from "@/lib/db/schema";
import { sendDeadlinesReminder, type DeadlineEvent, type DeadlinesReminderData } from "@/lib/services/mail.service";
import { buildCalendar, type PaymentPreferences, type CalendarEvent } from "@/lib/data/fiscal-calendar";
import { emailToLogId } from "@/lib/log";

const WINDOW_DAYS = 14;
const DAY_OF_MS = 24 * 60 * 60 * 1000;

const DAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MONTH_NAMES = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const EVENT_LABEL: Record<CalendarEvent["type"], string> = {
  urssaf: "URSSAF",
  carpimko: "CARPIMKO",
  ir: "Impôt sur le revenu (PAS)",
  cfe: "CFE",
  declaration: "",
};

function dayLabel(d: Date): string {
  const dayName = DAY_NAMES[d.getUTCDay()]!;
  const day = d.getUTCDate();
  const month = MONTH_NAMES[d.getUTCMonth()]!;
  const dayStr = day === 1 ? "1er" : String(day);
  return `${dayName} ${dayStr} ${month}`;
}

function formatRange(start: Date, end: Date): string {
  const sDay = start.getUTCDate() === 1 ? "1er" : String(start.getUTCDate());
  const eDay = end.getUTCDate() === 1 ? "1er" : String(end.getUTCDate());
  const sMonth = MONTH_NAMES[start.getUTCMonth()]!;
  const eMonth = MONTH_NAMES[end.getUTCMonth()]!;
  const eYear = end.getUTCFullYear();
  return `Du ${sDay} ${sMonth} au ${eDay} ${eMonth} ${eYear}`;
}

function mondayOf(d: Date): Date {
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return new Date(d.getTime() + offset * DAY_OF_MS);
}

function weekLabel(monday: Date): string {
  const day = monday.getUTCDate();
  const dayStr = day === 1 ? "1er" : String(day);
  return `Semaine du ${dayStr} ${MONTH_NAMES[monday.getUTCMonth()]}`;
}

type DatedEvent = { date: Date } & CalendarEvent;

function collectEventsInWindow(
  prefs: PaymentPreferences,
  windowStart: Date,
  windowEnd: Date,
): DatedEvent[] {
  const calendar = buildCalendar(prefs);
  const result: DatedEvent[] = [];

  const totalDays = Math.floor((windowEnd.getTime() - windowStart.getTime()) / DAY_OF_MS) + 1;
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(windowStart.getTime() + i * DAY_OF_MS);
    const monthEvents = calendar[d.getUTCMonth()] ?? [];
    for (const evt of monthEvents) {
      if (evt.day === d.getUTCDate()) {
        result.push({ ...evt, date: d });
      }
    }
  }
  return result;
}

function groupByWeek(events: DatedEvent[]): Array<{ weekLabel: string; events: DeadlineEvent[] }> {
  const groups = new Map<string, { weekLabel: string; events: DeadlineEvent[] }>();
  for (const evt of events) {
    const monday = mondayOf(evt.date);
    const key = monday.toISOString().slice(0, 10);
    let group = groups.get(key);
    if (!group) {
      group = { weekLabel: weekLabel(monday), events: [] };
      groups.set(key, group);
    }
    const label = EVENT_LABEL[evt.type] || evt.label;
    group.events.push({ dayLabel: dayLabel(evt.date), label });
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, g]) => g);
}

export type DeadlinesReminderResult = {
  sent: number;
  skipped: number;
  candidates: number;
  errors: string[];
};

export async function runDeadlinesReminder(): Promise<DeadlinesReminderResult> {
  const now = new Date();
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const windowEnd = new Date(windowStart.getTime() + (WINDOW_DAYS - 1) * DAY_OF_MS);

  const candidates = await db
    .select({
      practitionerId: practitioners.id,
      firstName: practitioners.firstName,
      email: users.email,
      urssafFrequency: practitioners.urssafFrequency,
      urssafPayDay: practitioners.urssafPayDay,
      pasFrequency: practitioners.pasFrequency,
      carpimkoFrequency: practitioners.carpimkoFrequency,
      carpimkoPayDay: practitioners.carpimkoPayDay,
      activityStartDate: practitioners.activityStartDate,
    })
    .from(practitioners)
    .innerJoin(users, eq(practitioners.userId, users.id))
    .where(and(
      eq(practitioners.deadlinesReminderEnabled, true),
      isNull(users.deletedAt),
    ));

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const p of candidates) {
    try {
      const prefs: PaymentPreferences = {
        urssafFrequency: p.urssafFrequency,
        urssafPayDay: p.urssafPayDay,
        pasFrequency: p.pasFrequency,
        carpimkoFrequency: p.carpimkoFrequency,
        carpimkoPayDay: p.carpimkoPayDay,
        activityStartDate: p.activityStartDate,
      };

      const events = collectEventsInWindow(prefs, windowStart, windowEnd);
      if (events.length === 0) {
        skipped++;
        continue;
      }

      const data: DeadlinesReminderData = {
        firstName: p.firstName,
        periodLabel: formatRange(windowStart, windowEnd),
        weekGroups: groupByWeek(events),
      };

      await sendDeadlinesReminder(p.email, data, p.practitionerId);
      sent++;
      console.log(`[deadlines-reminder] sent uid=${emailToLogId(p.email)} (${events.length} events)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[deadlines-reminder] error for ${p.practitionerId}:`, msg);
      errors.push(`Practitioner ${p.practitionerId}: ${msg}`);
    }
  }

  return { sent, skipped, candidates: candidates.length, errors };
}
