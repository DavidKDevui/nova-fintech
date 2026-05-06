UPDATE "users" SET "account_type" = 'health_professional' WHERE "account_type" = 'user';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "account_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "account_type" SET DEFAULT 'health_professional'::text;--> statement-breakpoint
DROP TYPE "public"."account_type";--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('health_professional', 'admin');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "account_type" SET DEFAULT 'health_professional'::"public"."account_type";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "account_type" SET DATA TYPE "public"."account_type" USING "account_type"::"public"."account_type";