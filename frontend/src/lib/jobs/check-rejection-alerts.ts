import { eq, and, isNull, lte, or, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { practitioners, users, practiceLinks, carePassages } from "@/lib/db/schema";
import { sendRejectionAlert } from "@/lib/services/mail.service";
import { namesMatch } from "@/lib/name-matching";
import { emailToLogId } from "@/lib/log";

const COOLDOWN_DAYS = 14;
const PERIOD_DAYS = 30;
// Échantillon minimum pour éviter les alertes sur trop peu de bordereaux
// (ex. 1 rejet sur 3 passages = 33 % mais statistiquement non significatif).
const MIN_SAMPLE = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CheckRejectionAlertsResult = {
  candidates: number;
  checked: number;
  sent: number;
  skipped: number;
  errors: string[];
};

export async function runCheckRejectionAlerts(): Promise<CheckRejectionAlertsResult> {
  const now = new Date();
  const cooldownDate = new Date(now.getTime() - COOLDOWN_DAYS * DAY_MS);
  const periodStart = new Date(now.getTime() - PERIOD_DAYS * DAY_MS).toISOString().slice(0, 10);

  const candidates = await db
    .select({
      practitionerId: practitioners.id,
      firstName: practitioners.firstName,
      lastName: practitioners.lastName,
      email: users.email,
      threshold: practitioners.rejectionAlertThreshold,
    })
    .from(practitioners)
    .innerJoin(users, eq(practitioners.userId, users.id))
    .where(and(
      eq(practitioners.rejectionAlertEnabled, true),
      isNull(users.deletedAt),
      or(
        isNull(practitioners.rejectionAlertLastSentAt),
        lte(practitioners.rejectionAlertLastSentAt, cooldownDate),
      ),
    ));

  let checked = 0;
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const p of candidates) {
    try {
      // Cabinets liés au praticien
      const links = await db
        .select({ practiceId: practiceLinks.practiceId })
        .from(practiceLinks)
        .where(eq(practiceLinks.practitionerId, p.practitionerId));

      if (links.length === 0) {
        skipped++;
        continue;
      }
      const practiceIds = links.map((l) => l.practiceId);

      // Pré-filtre SQL sur le nom + date, refine avec namesMatch en JS
      // (même approche que cotisations-estimate / health-score / facturation).
      const fullName = `${p.firstName} ${p.lastName}`;
      const lastNamePattern = `%${p.lastName}%`;

      const passages = await db
        .select({
          practitioner: carePassages.practitioner,
          status: carePassages.status,
        })
        .from(carePassages)
        .where(and(
          inArray(carePassages.practiceId, practiceIds),
          sql`${carePassages.practitioner} ILIKE ${lastNamePattern}`,
          sql`${carePassages.careDate} >= ${periodStart}`,
        ));

      const mine = passages.filter((row) => namesMatch(fullName, row.practitioner));
      const totalCount = mine.length;

      if (totalCount < MIN_SAMPLE) {
        skipped++;
        continue;
      }

      const rejectedCount = mine.filter((row) => row.status === "rejete").length;
      const rejectionRate = rejectedCount / totalCount;
      const threshold = Number(p.threshold) / 100;
      checked++;

      if (rejectionRate <= threshold) {
        skipped++;
        continue;
      }

      await sendRejectionAlert(p.email, {
        firstName: p.firstName,
        rejectionRate,
        threshold,
        rejectedCount,
        totalCount,
        periodDays: PERIOD_DAYS,
      }, p.practitionerId);

      await db
        .update(practitioners)
        .set({ rejectionAlertLastSentAt: now })
        .where(eq(practitioners.id, p.practitionerId));

      sent++;
      console.log(`[check-rejection-alerts] sent uid=${emailToLogId(p.email)} (rate: ${(rejectionRate * 100).toFixed(1)}%, threshold: ${(threshold * 100).toFixed(1)}%)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[check-rejection-alerts] error for ${p.practitionerId}:`, msg);
      errors.push(`Practitioner ${p.practitionerId}: ${msg}`);
    }
  }

  return { candidates: candidates.length, checked, sent, skipped, errors };
}
