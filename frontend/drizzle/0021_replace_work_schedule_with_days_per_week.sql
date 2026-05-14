-- Drop work_schedule column + enum (added in 0020, replaced by days_per_week_worked)
ALTER TABLE "practitioners" DROP COLUMN IF EXISTS "work_schedule";
DROP TYPE IF EXISTS "work_schedule";

-- Add days_per_week_worked column (1-7, default 5)
ALTER TABLE "practitioners"
  ADD COLUMN IF NOT EXISTS "days_per_week_worked" integer NOT NULL DEFAULT 5;

DO $$ BEGIN
  ALTER TABLE "practitioners"
    ADD CONSTRAINT "days_per_week_worked_range"
    CHECK ("days_per_week_worked" >= 1 AND "days_per_week_worked" <= 7);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
