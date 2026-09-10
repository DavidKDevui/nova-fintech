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

// Taille du pool : les rendus serveur lancent leurs requêtes en parallèle
// (Promise.all dans les pages et le préchargement du layout). Avec `max: 1`
// tout était sérialisé sur une seule connexion, et un utilisateur bloquait les
// autres. 10 connexions restent très loin du max_connections Postgres (100) et
// du budget mémoire du container DB. Surchargeable via DATABASE_POOL_MAX.
const poolMax = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);

const pool = globalForPg.pgPool ?? new pg.Pool({
  connectionString,
  ...(wantSSL && { ssl: { rejectUnauthorized: false } }),
  max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 10,
  idleTimeoutMillis: 30_000,
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
