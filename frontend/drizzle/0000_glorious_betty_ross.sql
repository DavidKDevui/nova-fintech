CREATE TYPE "public"."account_type" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."profession" AS ENUM('nurse');--> statement-breakpoint
CREATE TYPE "public"."tax_regime" AS ENUM('bnc', 'micro_bnc');--> statement-breakpoint
CREATE TYPE "public"."verification_type" AS ENUM('email_verification', 'password_reset', 'account_setup');--> statement-breakpoint
CREATE TABLE "health_professionals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"profession" "profession" NOT NULL,
	"activity_start_date" date NOT NULL,
	"tax_regime" "tax_regime" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "health_professionals_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255),
	"account_type" "account_type" DEFAULT 'user' NOT NULL,
	"refresh_token" varchar(500),
	"is_verified" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "verification_type" NOT NULL,
	"value" varchar(500) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "health_professionals" ADD CONSTRAINT "health_professionals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;