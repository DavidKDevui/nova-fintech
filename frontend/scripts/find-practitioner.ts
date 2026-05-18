import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

const search = process.argv[2];
if (!search) {
  console.error("Usage: tsx scripts/find-practitioner.ts <name fragment>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL absent");
  process.exit(1);
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  const pat = `%${search!.toLowerCase()}%`;
  const result = await db.execute(sql`
    SELECT p.id, p.first_name, p.last_name, u.email, p.default_bank_account_id,
           (SELECT name FROM bank_accounts WHERE id = p.default_bank_account_id) AS default_account_name,
           EXISTS(SELECT 1 FROM bank_accounts WHERE id = p.default_bank_account_id) AS account_exists
    FROM practitioners p
    JOIN users u ON u.id = p.user_id
    WHERE lower(p.last_name) LIKE ${pat} OR lower(p.first_name) LIKE ${pat} OR lower(u.email) LIKE ${pat}
  `);
  console.log(JSON.stringify(result.rows, null, 2));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
