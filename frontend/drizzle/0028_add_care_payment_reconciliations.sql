CREATE TABLE IF NOT EXISTS "care_payment_reconciliations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "care_payment_id" uuid NOT NULL UNIQUE REFERENCES "care_payments"("id") ON DELETE CASCADE,
  "bank_transaction_id" uuid NOT NULL REFERENCES "bank_transactions"("id") ON DELETE CASCADE,
  "pass" smallint NOT NULL,
  "matched_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "care_payment_reconciliations_pass_check" CHECK ("pass" IN (1, 2))
);

CREATE INDEX IF NOT EXISTS "idx_care_payment_reconciliations_bank_tx"
  ON "care_payment_reconciliations" ("bank_transaction_id");
