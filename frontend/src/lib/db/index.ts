import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { syncDatabase } from "./sync";

const rawUrl = process.env.DATABASE_URL ?? "";

// SSL est opt-in :
//   - explicite via DATABASE_URL contient `sslmode=require` (ou similaire)
//   - OU explicite via DATABASE_SSL=true
// Par defaut OFF (cas Postgres en container interne sans cert TLS).
const wantSSL = /[?&]sslmode=(require|verify-ca|verify-full)/i.test(rawUrl)
  || process.env.DATABASE_SSL === "true";

// On strip sslmode de la URL car le client pg gere le SSL via l'option dediee
const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");

const globalForPg = globalThis as unknown as { pgPool?: pg.Pool; dbReady?: Promise<void> };

const pool = globalForPg.pgPool ?? new pg.Pool({
  connectionString,
  ...(wantSSL && { ssl: { rejectUnauthorized: false } }),
  max: 1,
});

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}

export const dbReady = globalForPg.dbReady ?? pool.query("SELECT 1")
  .then(() => {
    console.log("✅ Connexion à PostgreSQL réussie");
    return syncDatabase(pool);
  })
  .catch((err) => console.error("❌ Échec de connexion à PostgreSQL :", err.message));

if (process.env.NODE_ENV !== "production") {
  globalForPg.dbReady = dbReady;
}

export const db = drizzle(pool, { schema });
export { pool };
