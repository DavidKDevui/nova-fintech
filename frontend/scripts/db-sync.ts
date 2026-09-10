// Synchronisation du schéma (tables, colonnes, index, clés étrangères) —
// ÉTAPE DE DÉPLOIEMENT, lancée UNE fois par le CMD du container avant
// `next start` (cf. Dockerfile : `npm run db:sync && npm run start`).
//
// En production, l'app elle-même ne synchronise jamais (lib/db/index.ts) :
// si cette étape échoue, le container s'arrête au lieu de servir une base
// désynchronisée, et Docker le relance (restart: unless-stopped).
process.env.DB_SKIP_SYNC = "1"; // l'import de lib/db ne doit pas déclencher sa propre synchro

async function main() {
  const { pool } = await import("../src/lib/db");
  const { syncDatabase } = await import("../src/lib/db/sync");
  let exitCode = 0;
  try {
    await pool.query("SELECT 1");
    console.log("✅ Connexion à PostgreSQL réussie (db:sync)");
    await syncDatabase(pool);
  } catch (err) {
    console.error("❌ db:sync a échoué :", err instanceof Error ? err.message : String(err));
    exitCode = 1;
  } finally {
    await pool.end();
    process.exit(exitCode);
  }
}

main();
