ALTER TABLE "practices" ALTER COLUMN "finess" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "care_passages" DROP COLUMN "patient_hash";--> statement-breakpoint
ALTER TABLE "practices" ADD CONSTRAINT "practices_finess_unique" UNIQUE("finess");