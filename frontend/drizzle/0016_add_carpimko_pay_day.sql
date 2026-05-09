CREATE TYPE "public"."carpimko_pay_day" AS ENUM('5', '10', '15', '20', '25');

ALTER TABLE "practitioners" ADD COLUMN "carpimko_pay_day" "carpimko_pay_day" NOT NULL DEFAULT '10';
