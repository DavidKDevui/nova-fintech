ALTER TABLE "practitioners"
  ADD COLUMN IF NOT EXISTS "rejection_alert_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "rejection_alert_threshold" numeric(5, 2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS "rejection_alert_last_sent_at" timestamp;
