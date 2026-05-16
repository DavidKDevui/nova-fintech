import { runSyncBank } from "../src/lib/jobs/sync-bank";
import { pool } from "../src/lib/db";

async function main() {
  let exitCode = 0;
  try {
    const result = await runSyncBank();
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length > 0) exitCode = 1;
  } catch (err) {
    console.error("[sync-bank] fatal:", err);
    exitCode = 1;
  } finally {
    await pool.end();
    process.exit(exitCode);
  }
}

main();
