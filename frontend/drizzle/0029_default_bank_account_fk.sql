-- Cleanup orphan references first (default_bank_account_id pointing to a deleted bank_account)
UPDATE "practitioners"
SET "default_bank_account_id" = NULL
WHERE "default_bank_account_id" IS NOT NULL
  AND "default_bank_account_id" NOT IN (SELECT "id" FROM "bank_accounts");

-- Enforce the relation: if the bank_account is deleted, just null the field on the practitioner
ALTER TABLE "practitioners"
  ADD CONSTRAINT "practitioners_default_bank_account_id_fkey"
  FOREIGN KEY ("default_bank_account_id")
  REFERENCES "bank_accounts"("id")
  ON DELETE SET NULL;
