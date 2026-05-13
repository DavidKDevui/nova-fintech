-- Add single-parent (case T) flag to fiscal situations
ALTER TABLE "practitioner_fiscal_situations"
  ADD COLUMN IF NOT EXISTS "is_single_parent" boolean NOT NULL DEFAULT false;
