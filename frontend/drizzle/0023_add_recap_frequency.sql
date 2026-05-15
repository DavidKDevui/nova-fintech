DO $$ BEGIN
  CREATE TYPE "recap_frequency" AS ENUM ('none', 'monthly', 'quarterly');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "practitioners"
  ADD COLUMN IF NOT EXISTS "recap_frequency" "recap_frequency" NOT NULL DEFAULT 'monthly';
