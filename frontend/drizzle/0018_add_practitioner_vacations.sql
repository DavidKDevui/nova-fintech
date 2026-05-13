-- Create practitioner vacations table
CREATE TABLE IF NOT EXISTS "practitioner_vacations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "practitioner_id" uuid NOT NULL REFERENCES "practitioners"("id") ON DELETE CASCADE,
  "year" integer NOT NULL,
  "month" integer NOT NULL,
  "days" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_vacations_practitioner_year" ON "practitioner_vacations" ("practitioner_id", "year");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_vacations_practitioner_year_month" ON "practitioner_vacations" ("practitioner_id", "year", "month");
