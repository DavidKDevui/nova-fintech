import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000; // 5 minutes

type CronAuthSuccess = { ok: true; body: string };
type CronAuthFailure = { ok: false; response: NextResponse };
type CronAuthResult = CronAuthSuccess | CronAuthFailure;

export async function verifyCronRequest(request: Request): Promise<CronAuthResult> {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return {
      ok: false,
      response: NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 }),
    };
  }

  const body = await request.text();
  const signature = request.headers.get("x-signature");

  if (!signature || !verifySignature(body, signature, cronSecret)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid signature" }, { status: 401 }),
    };
  }

  if (!verifyTimestamp(body)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Expired or invalid timestamp" }, { status: 401 }),
    };
  }

  return { ok: true, body };
}

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
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
