CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"health_professional_id" uuid NOT NULL,
	"bridge_account_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"balance" numeric(12, 2) NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"type" varchar(50) NOT NULL,
	"status" varchar(50) NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"bridge_transaction_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"date" date NOT NULL,
	"description" varchar(500) NOT NULL,
	"clean_description" varchar(500),
	"operation_type" varchar(100),
	"category_id" integer,
	"bridge_updated_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_health_professional_id_health_professionals_id_fk" FOREIGN KEY ("health_professional_id") REFERENCES "public"."health_professionals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;