ALTER TABLE "users" ADD COLUMN "previous_refresh_token" varchar(500);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "previous_refresh_token_expires_at" timestamp;