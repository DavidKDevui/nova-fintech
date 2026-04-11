import type { Server } from "http";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { createApp } from "../app";

let server: Server;
let baseUrl: string;

export async function setupTestServer() {
  // Create tables if they don't exist
  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE account_type AS ENUM ('user', 'admin');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`);

  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE verification_type AS ENUM ('email_verification', 'password_reset');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      account_type account_type NOT NULL DEFAULT 'user',
      refresh_token VARCHAR(500),
      is_verified BOOLEAN NOT NULL DEFAULT false,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS verifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      type verification_type NOT NULL,
      value VARCHAR(500) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  const app = createApp();

  return new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });
}

export function getBaseUrl() {
  return baseUrl;
}

export async function cleanTestDb() {
  await db.execute(sql`DELETE FROM verifications`);
  await db.execute(sql`DELETE FROM users`);
}

export async function teardownTestServer() {
  await cleanTestDb();
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}
