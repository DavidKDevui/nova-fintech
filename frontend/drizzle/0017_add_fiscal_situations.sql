-- Create marital status enum
DO $$ BEGIN
  CREATE TYPE "marital_status" AS ENUM ('celibataire', 'marie', 'pacse');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create fiscal situations table
CREATE TABLE IF NOT EXISTS "practitioner_fiscal_situations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "practitioner_id" uuid NOT NULL REFERENCES "practitioners"("id") ON DELETE CASCADE,
  "year" integer NOT NULL,
  "marital_status" "marital_status" NOT NULL DEFAULT 'celibataire',
  "dependent_children" integer NOT NULL DEFAULT 0,
  "other_income" numeric(12, 2) NOT NULL DEFAULT '0',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Create index
CREATE INDEX IF NOT EXISTS "idx_fiscal_situations_practitioner_year" ON "practitioner_fiscal_situations" ("practitioner_id", "year");
