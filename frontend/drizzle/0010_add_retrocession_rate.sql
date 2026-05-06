CREATE TYPE "retrocession_type" AS ENUM ('percentage', 'fixed');

ALTER TABLE "practitioners" ADD COLUMN "retrocession_type" "retrocession_type";
ALTER TABLE "practitioners" ADD COLUMN "retrocession_value" numeric(10, 2);
