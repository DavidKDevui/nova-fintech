import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL absent");
  process.exit(1);
}

const PRACTITIONER_ID = "9c7b864a-d548-4da3-9a16-a84f158c621f";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const accounts = await pool.query(
    `SELECT ba.id, ba.name, ba.status, COUNT(bt.id)::int AS tx_count
     FROM bank_accounts ba
     LEFT JOIN bank_transactions bt ON bt.bank_account_id = ba.id
     WHERE ba.practitioner_id = $1
     GROUP BY ba.id, ba.name, ba.status
     ORDER BY ba.name`,
    [PRACTITIONER_ID],
  );
  console.log("Comptes :", JSON.stringify(accounts.rows, null, 2));

  const total = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM bank_transactions bt
     JOIN bank_accounts ba ON ba.id = bt.bank_account_id
     WHERE ba.practitioner_id = $1`,
    [PRACTITIONER_ID],
  );
  console.log("TOTAL bank_transactions :", total.rows[0].total);

  const recon = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM care_payment_bank_transactions cpbt
     JOIN bank_transactions bt ON bt.id = cpbt.bank_transaction_id
     JOIN bank_accounts ba ON ba.id = bt.bank_account_id
     WHERE ba.practitioner_id = $1`,
    [PRACTITIONER_ID],
  ).catch(() => ({ rows: [{ total: "(table absente)" }] }));
  console.log("Réconciliations liées :", recon.rows[0].total);

  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
