ALTER TABLE "practitioners" ADD COLUMN "rpps_number" varchar(11);
ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_rpps_number_unique" UNIQUE("rpps_number");
