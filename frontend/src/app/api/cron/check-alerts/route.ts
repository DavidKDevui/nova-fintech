import { NextResponse } from "next/server";
import { eq, and, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { bankAlerts, bankAccounts, practitioners, users } from "@/lib/db/schema";
import { sendTreasuryAlert } from "@/lib/services/mail.service";
import { verifyCronRequest } from "@/lib/cron-auth";

const COOLDOWN_DAYS = 7;

export async function POST(request: Request) {
  const auth = await verifyCronRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - COOLDOWN_DAYS);

    // Récupérer toutes les alertes actives dont le cooldown est passé
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
        await sendTreasuryAlert(alert.email, {
          accountName: alert.accountName,
          currentBalance: alert.balance,
          threshold: alert.threshold,
        });

        await db
          .update(bankAlerts)
          .set({ lastTriggeredAt: new Date() })
          .where(eq(bankAlerts.id, alert.alertId));

        alertsSent++;
        console.log(`[CRON] Treasury alert sent to ${alert.email} (balance: ${balance}, threshold: ${threshold})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[CRON] Error sending alert for ${alert.alertId}:`, msg);
        errors.push(`Alert ${alert.alertId}: ${msg}`);
      }
    }

    return NextResponse.json({
      message: "Check complete",
      alertsChecked: activeAlerts.length,
      alertsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CRON] check-alerts fatal error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
