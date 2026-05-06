import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { eq, and, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { bankAlerts, bankAccounts, practitioners, users } from "@/lib/db/schema";
import { sendTreasuryAlert } from "@/lib/services/mail.service";

const COOLDOWN_DAYS = 7;
const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000;
const CRON_SECRET = process.env.CRON_SECRET;

function verifySignature(body: string, signature: string): boolean {
  if (!CRON_SECRET) return false;
  const expected = createHmac("sha256", CRON_SECRET).update(body).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function verifyTimestamp(body: string): boolean {
  try {
    const parsed = JSON.parse(body);
    const timestamp = parsed.timestamp;
    if (typeof timestamp !== "number") return false;
    return Math.abs(Date.now() - timestamp) <= MAX_TIMESTAMP_DRIFT_MS;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("x-signature");

  if (!signature || !verifySignature(body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (!verifyTimestamp(body)) {
    return NextResponse.json({ error: "Expired or invalid timestamp" }, { status: 401 });
  }

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
