import pg from "pg";
import { isTable } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import type { PgColumn } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// ── Collect schema objects ──

const drizzleTables = Object.values(schema).filter(isTable);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const drizzleEnums: { enumName: string; enumValues: readonly string[] }[] = [];
for (const v of Object.values(schema)) {
  if (v != null && (typeof v === "object" || typeof v === "function") && "enumName" in v && "enumValues" in v && !isTable(v)) {
    drizzleEnums.push(v as { enumName: string; enumValues: readonly string[] });
  }
}

// ── Helpers ──

function colToSQL(col: PgColumn): string {
  const ct = col.columnType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = col as any;

  if (ct === "PgUUID") return "uuid";
  if (ct === "PgBoolean") return "boolean";
  if (ct === "PgInteger") return "integer";
  if (ct === "PgBigInt53") return "bigint";
  if (ct === "PgDate") return "date";
  if (ct === "PgTimestamp") return "timestamp";
  if (ct === "PgVarchar") return c.length ? `varchar(${c.length})` : "varchar";
  if (ct === "PgNumeric") {
    if (c.precision != null && c.scale != null) return `numeric(${c.precision},${c.scale})`;
    return "numeric";
  }
  if (ct === "PgEnumColumn") return `"${c.enum.enumName}"`;
  return col.dataType;
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
        await client.query(`CREATE TYPE "${e.enumName}" AS ENUM(${vals})`);
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
        // ── Create table ──
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

        const createSQL = `CREATE TABLE "${tableName}" (\n  ${colDefs.join(",\n  ")}\n)`;
        console.log(`[SYNC] Creating table "${tableName}":`, createSQL);
        await client.query(createSQL);
        changes.push(`+ table "${tableName}" (${columns.length} colonnes)`);

        // Foreign keys
        for (const fk of config.foreignKeys) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ref = fk.reference() as any;
          const localCols = ref.columns.map((c: { name: string }) => `"${c.name}"`).join(", ");
          const foreignTable = getTableConfig(ref.foreignTable).name;
          const foreignCols = ref.foreignColumns.map((c: { name: string }) => `"${c.name}"`).join(", ");
          let fkSQL = `ALTER TABLE "${tableName}" ADD FOREIGN KEY (${localCols}) REFERENCES "${foreignTable}"(${foreignCols})`;
          if (ref.deleteAction) fkSQL += ` ON DELETE ${String(ref.deleteAction).toUpperCase()}`;
          await client.query(`DO $$ BEGIN ${fkSQL}; EXCEPTION WHEN duplicate_object THEN null; END $$`);
        }

        // Indexes
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
