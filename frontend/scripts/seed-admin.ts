import bcrypt from "bcryptjs";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { users } from "../src/lib/db/schema";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function seed() {
  const email = "ddkonate54@gmail.com";
  const password = await bcrypt.hash("Azerty123*", 10);

  const [admin] = await db
    .insert(users)
    .values({
      email,
      password,
      accountType: "admin",
      isVerified: true,
    })
    .onConflictDoNothing()
    .returning({ id: users.id, email: users.email });

  if (admin) {
    console.log(`Admin created: ${admin.email}`);
  } else {
    console.log("Admin already exists");
  }

  await pool.end();
}

seed().catch(console.error);
