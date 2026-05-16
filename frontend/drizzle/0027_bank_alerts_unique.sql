-- Dédoublonne avant de poser la contrainte unique : si deux alertes existent
-- pour le même (practitioner_id, bank_account_id), on garde la plus récente.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY practitioner_id, bank_account_id
           ORDER BY created_at DESC
         ) AS rn
  FROM bank_alerts
)
DELETE FROM bank_alerts
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_bank_alerts_practitioner_account"
  ON "bank_alerts" ("practitioner_id", "bank_account_id");
