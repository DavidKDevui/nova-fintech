-- Create work schedule enum
DO $$ BEGIN
  CREATE TYPE "work_schedule" AS ENUM ('weekdays', 'all_days');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add column to practitioners (default 'all_days' — cible IDEL qui tournent 7j/7)
ALTER TABLE "practitioners"
  ADD COLUMN IF NOT EXISTS "work_schedule" "work_schedule" NOT NULL DEFAULT 'all_days';
