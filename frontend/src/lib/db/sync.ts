import pg from "pg";
import { isTable } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import type { PgColumn } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// ── Collect schema objects ──

const drizzleTables = Object.values(schema).filter(isTable);

const drizzleEnums: { enumName: string; enumValues: readonly string[] }[] = [];
for (const v of Object.values(schema)) {
  if (v != null && (typeof v === "object" || typeof v === "function") && "enumName" in v && "enumValues" in v && !isTable(v)) {
    drizzleEnums.push(v as { enumName: string; enumValues: readonly string[] });
  }
}

// ── Index trigram (pg_trgm) ──
// Les filtres `ILIKE '%nom%'` (attribution des passages au praticien) et les
// requêtes `similarity()` (catégorisation automatique) ne peuvent pas utiliser
// un index B-tree : seul un index GIN trigram les accélère.
const RAW_INDEXES: { name: string; sql: string }[] = [
  {
    name: "idx_care_passages_practitioner_trgm",
    sql: `CREATE INDEX IF NOT EXISTS "idx_care_passages_practitioner_trgm" ON "care_passages" USING gin ("practitioner" gin_trgm_ops)`,
  },
  {
    name: "idx_bank_transactions_clean_description_trgm",
    sql: `CREATE INDEX IF NOT EXISTS "idx_bank_transactions_clean_description_trgm" ON "bank_transactions" USING gin ("clean_description" gin_trgm_ops)`,
  },
  {
    name: "idx_bank_transactions_description_trgm",
    sql: `CREATE INDEX IF NOT EXISTS "idx_bank_transactions_description_trgm" ON "bank_transactions" USING gin ("description" gin_trgm_ops)`,
  },
];

// ── Helpers ──

function colToSQL(col: PgColumn): string {
  const ct = col.columnType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = col as any;

  if (ct === "PgUUID") return "uuid";
  if (ct === "PgBoolean") return "boolean";
  if (ct === "PgSmallInt") return "smallint";
  if (ct === "PgInteger") return "integer";
  if (ct === "PgBigInt53") return "bigint";
  if (ct === "PgReal") return "real";
  if (ct === "PgDoublePrecision") return "double precision";
  if (ct === "PgDate") return "date";
  if (ct === "PgDateString") return "date";
  if (ct === "PgTime") return "time";
  if (ct === "PgTimestamp") return "timestamp";
  if (ct === "PgVarchar") return c.length ? `varchar(${c.length})` : "varchar";
  if (ct === "PgText") return "text";
  if (ct === "PgJson") return "json";
  if (ct === "PgJsonb") return "jsonb";
  if (ct === "PgNumeric") {
    if (c.precision != null && c.scale != null) return `numeric(${c.precision},${c.scale})`;
    return "numeric";
  }
  if (ct === "PgEnumColumn") return `"${c.enum.enumName}"`;
  // Fail loud plutôt que retourner le type JS (ex: "number") qui produirait du SQL invalide.
  throw new Error(`[SYNC] Type de colonne non géré: ${ct} (colonne "${col.name}")`);
}

function defaultSQL(col: PgColumn): string | null {
  // Handle defaultFn or default objects for known column types
  if (col.columnType === "PgUUID" && (col.defaultFn || (col.default != null && typeof col.default === "object"))) return "gen_random_uuid()";
  if (col.columnType === "PgTimestamp" && (col.defaultFn || (col.default != null && typeof col.default === "object"))) return "now()";
  if (col.defaultFn) return null;
  if (col.default !== undefined && col.default !== null) {
    const v = col.default;
    if (typeof v === "object") return null; // skip unknown objects
    if (typeof v === "string") return `'${v}'`;
    if (typeof v === "boolean") return v ? "true" : "false";
    return String(v);
  }
  return null;
}

// ── Main sync ──

export async function syncDatabase(pool: pg.Pool) {
  const client = await pool.connect();
  const changes: string[] = [];

  try {
    // 0 — Extensions
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // 1 — Enums
    for (const e of drizzleEnums) {
      const { rows } = await client.query(`SELECT 1 FROM pg_type WHERE typname = $1`, [e.enumName]);
      if (rows.length === 0) {
        const vals = e.enumValues.map((v) => `'${v}'`).join(", ");
        // DO/EXCEPTION : idempotent face aux courses (ex: workers de build
        // concurrents qui tentent tous de créer le type en même temps).
        await client.query(`DO $$ BEGIN CREATE TYPE "${e.enumName}" AS ENUM(${vals}); EXCEPTION WHEN duplicate_object THEN null; END $$`);
        changes.push(`+ enum "${e.enumName}"`);
      } else {
        const { rows: existing } = await client.query(
          `SELECT e.enumlabel AS val FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = $1`,
          [e.enumName],
        );
        const existingVals = new Set(existing.map((r: { val: string }) => r.val));
        for (const val of e.enumValues) {
          if (!existingVals.has(val)) {
            await client.query(`ALTER TYPE "${e.enumName}" ADD VALUE IF NOT EXISTS '${val}'`);
            changes.push(`+ enum value "${e.enumName}".'${val}'`);
          }
        }
      }
    }

    // 2 — Tables & columns
    for (const tableObj of drizzleTables) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = getTableConfig(tableObj as any);
      const tableName = config.name;
      const columns = config.columns;

      const { rows: tableExists } = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
        [tableName],
      );

      if (tableExists.length === 0) {
        // ── Create table (sans FK : on les ajoutera en pass 2 quand toutes
        //    les tables referencees existent) ──
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const colDefs = columns.map((col: any) => {
          let def = `"${col.name}" ${colToSQL(col)}`;
          if (col.primary) def += " PRIMARY KEY";
          const d = defaultSQL(col);
          if (d) def += ` DEFAULT ${d}`;
          if (col.notNull && !col.primary) def += " NOT NULL";
          return def;
        });

        const uniques = columns.filter((c) => c.isUnique);
        for (const u of uniques) {
          colDefs.push(`CONSTRAINT "${tableName}_${u.name}_unique" UNIQUE("${u.name}")`);
        }

        const createSQL = `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${colDefs.join(",\n  ")}\n)`;
        console.log(`[SYNC] Creating table "${tableName}":`, createSQL);
        await client.query(createSQL);
        changes.push(`+ table "${tableName}" (${columns.length} colonnes)`);

        // Indexes (pas de dependance entre tables)
        for (const idx of config.indexes) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ic = idx.config as any;
          if (!ic?.name || !ic?.columns) continue;
          const idxCols = ic.columns.map((c: { name: string }) => `"${c.name}"`).join(", ");
          await client.query(`CREATE INDEX IF NOT EXISTS "${ic.name}" ON "${tableName}"(${idxCols})`);
        }
      } else {
        // ── Table exists — add missing columns ──
        const { rows: existingCols } = await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
          [tableName],
        );
        const existingSet = new Set(existingCols.map((r: { column_name: string }) => r.column_name));

        for (const col of columns) {
          if (existingSet.has(col.name)) continue;

          let sql = `ALTER TABLE "${tableName}" ADD COLUMN "${col.name}" ${colToSQL(col)}`;
          const d = defaultSQL(col);
          if (d) sql += ` DEFAULT ${d}`;
          if (col.notNull) sql += ` NOT NULL`;
          await client.query(sql);
          changes.push(`+ colonne "${tableName}"."${col.name}"`);

          if (col.isUnique) {
            await client.query(
              `DO $$ BEGIN ALTER TABLE "${tableName}" ADD CONSTRAINT "${tableName}_${col.name}_unique" UNIQUE("${col.name}"); EXCEPTION WHEN duplicate_object THEN null; END $$`,
            );
          }
        }

        // Missing indexes
        for (const idx of config.indexes) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ic = idx.config as any;
          if (!ic?.name || !ic?.columns) continue;
          const { rows: idxExists } = await client.query(
            `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
            [ic.name],
          );
          if (idxExists.length === 0) {
            const idxCols = ic.columns.map((c: { name: string }) => `"${c.name}"`).join(", ");
            await client.query(`CREATE INDEX "${ic.name}" ON "${tableName}"(${idxCols})`);
            changes.push(`+ index "${ic.name}"`);
          }
        }
      }
    }

    // 2bis — Foreign keys (pass 2 : toutes les tables existent maintenant)
    //
    // INCIDENT 10/09/2026 : l'ancienne version faisait `ADD FOREIGN KEY` SANS
    // nom, entouré d'un DO/EXCEPTION duplicate_object. Or Postgres ne lève
    // jamais cette erreur pour une contrainte anonyme : il génère un nouveau
    // nom (…_fkey1, _fkey2, …) et AJOUTE UNE COPIE. Chaque démarrage de l'app
    // et chaque cron (toutes les 15 min) ajoutait donc ~24 clés étrangères :
    // 140 399 contraintes en prod, 5 000 à 11 000 par table. Effets : chaque
    // écriture déclenchait des milliers de triggers RI (UPDATE de `users` en
    // 4,4 s), et chaque sync posait 24 verrous ACCESS EXCLUSIVE pendant ~25 s
    // (validation des contraintes), figeant l'app à chaque cron.
    //
    // Désormais : on vérifie l'existence par DÉFINITION (table, colonnes,
    // table référencée) dans pg_constraint, et on ne crée qu'en son absence,
    // avec un nom explicite. Voir .ssh pour le nettoyage des doublons.
    for (const tableObj of drizzleTables) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = getTableConfig(tableObj as any);
      const tableName = config.name;

      for (const fk of config.foreignKeys) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ref = fk.reference() as any;
        const localColNames: string[] = ref.columns.map((c: { name: string }) => c.name);
        const localCols = localColNames.map((n) => `"${n}"`).join(", ");
        const foreignTable = getTableConfig(ref.foreignTable).name;
        const foreignCols = ref.foreignColumns.map((c: { name: string }) => `"${c.name}"`).join(", ");

        const { rows: fkExists } = await client.query(
          `SELECT 1 FROM pg_constraint c
           WHERE c.contype = 'f'
             AND c.conrelid = $1::regclass
             AND c.confrelid = $2::regclass
             AND (SELECT array_agg(a.attname::text ORDER BY u.ord)
                    FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
                    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum) = $3::text[]
           LIMIT 1`,
          [`"public"."${tableName}"`, `"public"."${foreignTable}"`, localColNames],
        );
        if (fkExists.length > 0) continue;

        const fkName = `${tableName}_${localColNames.join("_")}_fkey`;
        let fkSQL = `ALTER TABLE "${tableName}" ADD CONSTRAINT "${fkName}" FOREIGN KEY (${localCols}) REFERENCES "${foreignTable}"(${foreignCols})`;
        if (ref.deleteAction) fkSQL += ` ON DELETE ${String(ref.deleteAction).toUpperCase()}`;
        // Nom explicite → duplicate_object est bien levé si le nom existe déjà
        // (contrainte de même nom mais de définition différente) : on l'ignore.
        await client.query(`DO $$ BEGIN ${fkSQL}; EXCEPTION WHEN duplicate_object THEN null; END $$`);
        changes.push(`+ FK "${fkName}"`);
      }
    }

    // 2ter — Index « spéciaux » (non exprimables dans le schéma Drizzle lu par
    // ce sync : GIN trigram). Idempotents via IF NOT EXISTS.
    for (const raw of RAW_INDEXES) {
      const { rows: idxExists } = await client.query(
        `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
        [raw.name],
      );
      if (idxExists.length === 0) {
        await client.query(raw.sql);
        changes.push(`+ index "${raw.name}"`);
      }
    }

    // 3 — Report
    if (changes.length === 0) {
      console.log("✅ Base de données synchronisée (aucun changement)");
    } else {
      console.log(`✅ Base de données synchronisée (${changes.length} changement${changes.length > 1 ? "s" : ""}) :`);
      for (const c of changes) console.log(`  ${c}`);
    }
  } catch (err) {
    console.error("❌ Erreur sync DB :", (err as Error).message, (err as Error).stack);
    throw err;
  } finally {
    client.release();
  }
}
