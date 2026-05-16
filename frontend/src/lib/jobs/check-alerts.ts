import { eq, and, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { bankAlerts, bankAccounts, practitioners, users } from "@/lib/db/schema";
import { sendTreasuryAlert } from "@/lib/services/mail.service";
import { emailToLogId } from "@/lib/log";

const COOLDOWN_DAYS = 7;

export type CheckAlertsResult = {
  alertsChecked: number;
  alertsSent: number;
  errors: string[];
};

export async function runCheckAlerts(): Promise<CheckAlertsResult> {
  const cooldownDate = new Date();
  cooldownDate.setDate(cooldownDate.getDate() - COOLDOWN_DAYS);

  const activeAlerts = await db
    .select({
      alertId: bankAlerts.id,
      threshold: bankAlerts.threshold,
      bankAccountId: bankAlerts.bankAccountId,
      practitionerId: bankAlerts.practitionerId,
      accountName: bankAccounts.name,
      balance: bankAccounts.balance,
      email: users.email,
    })
    .from(bankAlerts)
    .innerJoin(bankAccounts, eq(bankAlerts.bankAccountId, bankAccounts.id))
    .innerJoin(practitioners, eq(bankAlerts.practitionerId, practitioners.id))
    .innerJoin(users, eq(practitioners.userId, users.id))
    .where(
      and(
        eq(bankAlerts.enabled, true),
        or(
          isNull(bankAlerts.lastTriggeredAt),
          lte(bankAlerts.lastTriggeredAt, cooldownDate),
        ),
      ),
    );

  let alertsSent = 0;
  const errors: string[] = [];

  for (const alert of activeAlerts) {
    if (alert.balance === null) continue;

    const balance = Number(alert.balance);
    const threshold = Number(alert.threshold);

    if (balance >= threshold) continue;

    try {
      // Atomic compare-and-swap : on ne procède à l'envoi que si on a réussi
      // à poser `lastTriggeredAt = now` ET que la valeur précédente est bien
      // dans la fenêtre de cooldown. Empêche deux runs concurrents d'envoyer
      // tous les deux un mail.
      const claimed = await db
        .update(bankAlerts)
        .set({ lastTriggeredAt: new Date() })
        .where(and(
          eq(bankAlerts.id, alert.alertId),
          or(
            isNull(bankAlerts.lastTriggeredAt),
            lte(bankAlerts.lastTriggeredAt, cooldownDate),
          ),
        ))
        .returning({ id: bankAlerts.id });

      if (claimed.length === 0) {
        // Un autre run a déjà revendiqué cette alerte → on saute.
        continue;
      }

      await sendTreasuryAlert(alert.email, {
        accountName: alert.accountName,
        currentBalance: alert.balance,
        threshold: alert.threshold,
      }, alert.practitionerId);

      alertsSent++;
      console.log(`[check-alerts] sent uid=${emailToLogId(alert.email)} (balance: ${balance}, threshold: ${threshold})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[check-alerts] error for alert ${alert.alertId}:`, msg);
      errors.push(`Alert ${alert.alertId}: ${msg}`);
    }
  }

  return { alertsChecked: activeAlerts.length, alertsSent, errors };
}
