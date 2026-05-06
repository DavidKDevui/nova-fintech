CREATE TABLE IF NOT EXISTS "bank_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"threshold" numeric(12, 2) NOT NULL,
	"enabled" boolean NOT NULL DEFAULT true,
	"last_triggered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bank_alerts_practitioner" ON "bank_alerts" USING btree ("practitioner_id");
--> statement-breakpoint
ALTER TABLE "bank_alerts" ADD CONSTRAINT "bank_alerts_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bank_alerts" ADD CONSTRAINT "bank_alerts_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;
