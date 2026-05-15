ALTER TABLE "practitioners"
  ADD COLUMN IF NOT EXISTS "deadlines_reminder_enabled" boolean NOT NULL DEFAULT true;
