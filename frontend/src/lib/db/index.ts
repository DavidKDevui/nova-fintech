import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { initDatabase } from "./init";

const connectionString = process.env.DATABASE_URL?.replace(/[?&]sslmode=[^&]*/g, "");

const pool = new pg.Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.query("SELECT 1")
  .then(() => {
    console.log("✅ Connexion à PostgreSQL réussie");
    return initDatabase(pool);
  })
  .catch((err) => console.error("❌ Échec de connexion à PostgreSQL :", err.message));

export const db = drizzle(pool, { schema });
