DO $$ BEGIN
  CREATE TYPE "categorization_source" AS ENUM ('manual', 'auto_similarity');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "categorization_source" "categorization_source";

UPDATE "bank_transactions"
SET "categorization_source" = 'manual'
WHERE "category" IS NOT NULL AND "categorization_source" IS NULL;
