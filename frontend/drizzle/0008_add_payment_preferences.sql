CREATE TYPE "public"."payment_frequency" AS ENUM('monthly', 'quarterly');--> statement-breakpoint
CREATE TYPE "public"."urssaf_pay_day" AS ENUM('5', '20');--> statement-breakpoint
CREATE TYPE "public"."carpimko_frequency" AS ENUM('monthly', 'semi_annual');--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "urssaf_frequency" "payment_frequency" DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "urssaf_pay_day" "urssaf_pay_day" DEFAULT '5' NOT NULL;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "pas_frequency" "payment_frequency" DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "carpimko_frequency" "carpimko_frequency" DEFAULT 'monthly' NOT NULL;
