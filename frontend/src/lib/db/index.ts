import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { initDatabase } from "./init";

const connectionString = process.env.DATABASE_URL?.replace(/[?&]sslmode=[^&]*/g, "");

const globalForPg = globalThis as unknown as { pgPool?: pg.Pool };

const isProduction = process.env.NODE_ENV === "production";

const pool = globalForPg.pgPool ?? new pg.Pool({
  connectionString,
  ...(isProduction && { ssl: { rejectUnauthorized: false } }),
  max: 1,
});

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}

pool.query("SELECT 1")
  .then(() => {
    console.log("✅ Connexion à PostgreSQL réussie");
    return initDatabase(pool);
  })
  .catch((err) => console.error("❌ Échec de connexion à PostgreSQL :", err.message));

export const db = drizzle(pool, { schema });
