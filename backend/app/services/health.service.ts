import { sql } from "drizzle-orm";
import { db } from "../db";

export function createHealthService() {
  return {
    async check() {
      const result = await db.execute(sql`SELECT NOW()`);
      return { status: "ok", time: result.rows[0].now };
    },
  };
}

export type HealthService = ReturnType<typeof createHealthService>;
