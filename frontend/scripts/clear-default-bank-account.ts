import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

const practitionerId = process.argv[2];
if (!practitionerId) {
  console.error("Usage: tsx scripts/clear-default-bank-account.ts <practitionerId>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL absent");
  process.exit(1);
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  const result = await db.execute(sql`
    UPDATE practitioners
    SET default_bank_account_id = NULL
    WHERE id = ${practitionerId}
    RETURNING id, first_name, last_name, default_bank_account_id
  `);
  console.log(JSON.stringify(result.rows, null, 2));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
