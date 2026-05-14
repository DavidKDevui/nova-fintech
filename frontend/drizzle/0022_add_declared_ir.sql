-- IR réellement déclaré par l'utilisateur d'après son avis d'imposition
-- (différent de l'IR estimé par l'app, qui ignore les crédits/réductions non catégorisables)
ALTER TABLE "practitioner_fiscal_situations"
  ADD COLUMN IF NOT EXISTS "declared_ir" numeric(12, 2);
