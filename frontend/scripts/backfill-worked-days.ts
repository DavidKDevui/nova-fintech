// Backfill des jours travaillés à partir de l'ancien modèle "jours de congés".
// Pour chaque ligne practitioner_vacations qui a des congés saisis (days > 0)
// mais pas encore de worked_days, calcule worked_days = joursOuvrés − congés,
// en réutilisant le vrai countWorkingDays (lundi-vendredi hors fériés, mappé
// sur le rythme du praticien).
//
// Usage :
//   DATABASE_URL=... tsx scripts/backfill-worked-days.ts          # dry run
//   DATABASE_URL=... tsx scripts/backfill-worked-days.ts --apply  # écrit
//
// En prod : docker exec -it actidec-app-prod tsx scripts/backfill-worked-days.ts --apply

import pg from "pg";
import { countWorkingDays } from "../src/lib/data/fr-holidays";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL absent");
  process.exit(1);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const { rows } = await pool.query<{
    id: string; year: number; month: number; days: number; dpw: number | null;
  }>(`
    SELECT v.id, v.year, v.month, v.days, p.days_per_week_worked AS dpw
    FROM practitioner_vacations v
    JOIN practitioners p ON p.id = v.practitioner_id
    WHERE v.worked_days IS NULL AND v.days > 0
    ORDER BY v.year, v.month
  `);

  console.log(`${rows.length} ligne(s) à backfiller${apply ? "" : "  (DRY RUN — ajoute --apply pour écrire)"}`);

  for (const r of rows) {
    const full = countWorkingDays(r.year, r.month, r.dpw ?? 5);
    const worked = Math.max(0, full - r.days);
    console.log(`  ${r.year}-${String(r.month).padStart(2, "0")}: plein=${full} − congés=${r.days} → travaillés=${worked}`);
    if (apply) {
      await pool.query(
        `UPDATE practitioner_vacations SET worked_days = $1, updated_at = now() WHERE id = $2`,
        [worked, r.id],
      );
    }
  }

  console.log(apply ? "✓ Backfill terminé." : "Aucune écriture (dry run).");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
