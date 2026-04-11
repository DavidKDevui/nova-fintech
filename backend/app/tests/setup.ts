import type { Server } from "http";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { createApp } from "../app";

let server: Server;
let baseUrl: string;

export async function setupTestServer() {
  // Drop everything and recreate to ensure schema is up to date
  await db.execute(sql`DROP TABLE IF EXISTS verifications`);
  await db.execute(sql`DROP TABLE IF EXISTS users`);
  await db.execute(sql`DROP TYPE IF EXISTS account_type`);
  await db.execute(sql`DROP TYPE IF EXISTS verification_type`);

  await db.execute(sql`CREATE TYPE account_type AS ENUM ('user', 'admin')`);
  await db.execute(sql`CREATE TYPE verification_type AS ENUM ('email_verification', 'password_reset', 'account_setup')`);

  await db.execute(sql`
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255),
      account_type account_type NOT NULL DEFAULT 'user',
      refresh_token VARCHAR(500),
      is_verified BOOLEAN NOT NULL DEFAULT false,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE verifications (
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
