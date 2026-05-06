import type pg from "pg";

const initSQL = `
DO $$ BEGIN CREATE TYPE "public"."account_type" AS ENUM('practitioner', 'admin'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."profession" AS ENUM('nurse'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."tax_regime" AS ENUM('bnc', 'micro_bnc'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."payment_frequency" AS ENUM('monthly', 'quarterly'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."urssaf_pay_day" AS ENUM('5', '20'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."carpimko_frequency" AS ENUM('monthly', 'semi_annual'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."retrocession_type" AS ENUM('percentage', 'fixed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."verification_type" AS ENUM('email_verification', 'password_reset', 'account_setup'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."practice_link_suggestion_status" AS ENUM('pending', 'accepted', 'dismissed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."care_passage_status" AS ENUM('a_securiser', 'a_envoyer', 'paye', 'rejete'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."care_payment_status" AS ENUM('paid', 'rejected'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."care_payment_payer_type" AS ENUM('c', 'm'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL,
  "password" varchar(255),
  "account_type" "account_type" DEFAULT 'practitioner' NOT NULL,
  "refresh_token" varchar(500),
  "previous_refresh_token" varchar(500),
  "previous_refresh_token_expires_at" timestamp,
  "is_verified" boolean DEFAULT false NOT NULL,
  "deleted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "practitioners" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "first_name" varchar(100) NOT NULL,
  "last_name" varchar(100) NOT NULL,
  "profession" "profession" NOT NULL,
  "activity_start_date" date NOT NULL,
  "tax_regime" "tax_regime" NOT NULL,
  "urssaf_frequency" "payment_frequency" DEFAULT 'monthly' NOT NULL,
  "urssaf_pay_day" "urssaf_pay_day" DEFAULT '5' NOT NULL,
  "pas_frequency" "payment_frequency" DEFAULT 'monthly' NOT NULL,
  "carpimko_frequency" "carpimko_frequency" DEFAULT 'monthly' NOT NULL,
  "pas_rate" numeric(4,1) DEFAULT '10' NOT NULL,
  "retrocession_type" "retrocession_type",
  "retrocession_value" numeric(10,2),
  "bridge_user_uuid" varchar(255),
  "default_bank_account_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "practitioners_user_id_unique" UNIQUE("user_id")
);

CREATE TABLE IF NOT EXISTS "bank_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "practitioner_id" uuid NOT NULL REFERENCES "practitioners"("id"),
  "bridge_account_id" integer NOT NULL,
  "name" varchar(255) NOT NULL,
  "balance" numeric(12,2),
  "currency_code" varchar(3) NOT NULL,
  "type" varchar(50) NOT NULL,
  "status" varchar(50) NOT NULL,
  "last_sync_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_bank_accounts_practitioner" ON "bank_accounts"("practitioner_id");
CREATE INDEX IF NOT EXISTS "idx_bank_accounts_last_sync" ON "bank_accounts"("last_sync_at");

CREATE TABLE IF NOT EXISTS "bank_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bank_account_id" uuid NOT NULL REFERENCES "bank_accounts"("id") ON DELETE CASCADE,
  "bridge_transaction_id" bigint NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "currency_code" varchar(3) NOT NULL,
  "date" date NOT NULL,
  "description" varchar(500) NOT NULL,
  "clean_description" varchar(500),
  "operation_type" varchar(100),
  "category_id" integer,
  "bridge_updated_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_bank_transactions_account" ON "bank_transactions"("bank_account_id");
CREATE INDEX IF NOT EXISTS "idx_bank_transactions_bridge_id" ON "bank_transactions"("bridge_transaction_id");
CREATE INDEX IF NOT EXISTS "idx_bank_transactions_date" ON "bank_transactions"("date");

CREATE TABLE IF NOT EXISTS "practices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "finess" varchar(9) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "practices_finess_unique" UNIQUE("finess")
);

CREATE TABLE IF NOT EXISTS "practices_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "practice_id" uuid NOT NULL REFERENCES "practices"("id"),
  "practitioner_id" uuid NOT NULL REFERENCES "practitioners"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "practices_links_suggestions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "practice_id" uuid NOT NULL REFERENCES "practices"("id"),
  "practitioner_id" uuid NOT NULL REFERENCES "practitioners"("id"),
  "status" "practice_link_suggestion_status" DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "statement_uploads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "practice_id" uuid NOT NULL REFERENCES "practices"("id"),
  "file_name" varchar(500) NOT NULL,
  "file_hash" varchar(64) NOT NULL,
  "document_type" varchar(50) NOT NULL,
  "passage_count" integer NOT NULL,
  "total_amount" numeric(12,2) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "statement_uploads_file_hash_unique" UNIQUE("file_hash")
);

CREATE TABLE IF NOT EXISTS "care_passages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "practice_id" uuid NOT NULL REFERENCES "practices"("id"),
  "import_id" uuid REFERENCES "statement_uploads"("id"),
  "client_name" varchar(500),
  "invoice_number" varchar(20) NOT NULL,
  "care_date" date NOT NULL,
  "care_moment" varchar(20) NOT NULL,
  "practitioner" varchar(255) NOT NULL,
  "cotation" varchar(500) NOT NULL,
  "status" "care_passage_status" NOT NULL,
  "base_amount" numeric(10,2) NOT NULL,
  "adj_1" numeric(10,2) NOT NULL,
  "adj_2" numeric(10,2) NOT NULL,
  "adj_3" numeric(10,2) NOT NULL,
  "total_amount" numeric(10,2) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "care_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "practice_id" uuid NOT NULL REFERENCES "practices"("id"),
  "upload_id" uuid REFERENCES "statement_uploads"("id"),
  "invoice_number" varchar(20) NOT NULL,
  "invoice_type" varchar(10),
  "payer_type" "care_payment_payer_type" NOT NULL,
  "payment_date" date NOT NULL,
  "payment_ref" varchar(500),
  "amount_billed" numeric(10,2) NOT NULL,
  "amount_paid" numeric(10,2) NOT NULL,
  "status" "care_payment_status" NOT NULL,
  "rejection_reason" varchar(500),
  "client_name" varchar(500),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL,
  "account_type" "account_type" DEFAULT 'practitioner' NOT NULL,
  "token" varchar(500) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "verifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "type" "verification_type" NOT NULL,
  "value" varchar(500) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
`;

export async function initDatabase(pool: pg.Pool) {
  try {
    await pool.query(initSQL);
    console.log("✅ Base de données initialisée");
  } catch (err) {
    console.error("❌ Erreur lors de l'initialisation de la base de données :", (err as Error).message);
  }
}
