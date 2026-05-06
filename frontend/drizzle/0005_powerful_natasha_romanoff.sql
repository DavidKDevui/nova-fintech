CREATE TYPE "public"."care_passage_status" AS ENUM('a_securiser', 'a_envoyer', 'paye', 'rejete');--> statement-breakpoint
CREATE TABLE "care_passages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"patient_hash" varchar(64) NOT NULL,
	"invoice_number" varchar(20) NOT NULL,
	"care_date" date NOT NULL,
	"care_moment" varchar(20) NOT NULL,
	"practitioner" varchar(255) NOT NULL,
	"cotation" varchar(255) NOT NULL,
	"status" "care_passage_status" NOT NULL,
	"part_caisse_status" varchar(50),
	"part_mutuelle_status" varchar(50),
	"honoraires" numeric(10, 2) NOT NULL,
	"majoration" numeric(10, 2) NOT NULL,
	"ferie_dim_nuit" numeric(10, 2) NOT NULL,
	"ifd" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "care_passages" ADD CONSTRAINT "care_passages_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;