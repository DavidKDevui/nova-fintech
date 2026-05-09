import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { syncDatabase } from "./sync";

const connectionString = process.env.DATABASE_URL?.replace(/[?&]sslmode=[^&]*/g, "");

const globalForPg = globalThis as unknown as { pgPool?: pg.Pool; dbReady?: Promise<void> };

const isProduction = process.env.NODE_ENV === "production";

const pool = globalForPg.pgPool ?? new pg.Pool({
  connectionString,
  ...(isProduction && { ssl: { rejectUnauthorized: false } }),
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
