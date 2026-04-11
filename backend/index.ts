import "dotenv/config";
import { logger } from "./app/logger";
import { pool } from "./app/db";
import { createApp } from "./app/app";

const app = createApp();
const port = process.env.PORT || 3000;

async function start() {
  try {
    const client = await pool.connect();
    logger.info("Connected to PostgreSQL");
    client.release();

    app.listen(port, () => {
      logger.info(`Server running on http://localhost:${port}`);
    });
  } catch (err) {
    logger.error(err, "Failed to connect to PostgreSQL");
    process.exit(1);
  }
}

start();
