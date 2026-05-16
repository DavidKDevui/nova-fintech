DO $$ BEGIN
  CREATE TYPE "notification_channel" AS ENUM ('mail');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "notification_status" AS ENUM ('sent', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "logs_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "channel" "notification_channel" NOT NULL,
  "type" varchar(50) NOT NULL,
  "recipient" varchar(255) NOT NULL,
  "practitioner_id" uuid REFERENCES "practitioners"("id") ON DELETE SET NULL,
  "subject" varchar(500),
  "status" "notification_status" NOT NULL,
  "error_message" varchar(1000),
  "sent_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_logs_notifications_practitioner" ON "logs_notifications" ("practitioner_id");
CREATE INDEX IF NOT EXISTS "idx_logs_notifications_sent_at" ON "logs_notifications" ("sent_at");
