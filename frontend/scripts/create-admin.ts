/**
 * Crée un compte admin (account_type="admin", isVerified=true).
 *
 * Usage :
 *   npm run admin:create -- <email> <password>
 *
 * Exemple :
 *   npm run admin:create -- alice@nova.fr "MyStr0ng!Pass"
 *
 * Si l'email existe déjà, le script affiche un message et sort sans rien modifier.
 */

import "dotenv/config";
import bcrypt from "bcrypt";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { users } from "../src/lib/db/schema";

function fail(msg: string): never {
  console.error(`Erreur : ${msg}`);
  process.exit(1);
}

const [, , emailArg, passwordArg] = process.argv;

if (!emailArg || !passwordArg) {
  fail("Usage : npm run admin:create -- <email> <password>");
}

const email = emailArg.trim().toLowerCase();
const password = passwordArg;

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  fail(`Email invalide : "${email}"`);
}

if (password.length < 8) {
  fail("Le mot de passe doit faire au moins 8 caractères.");
}

if (!process.env.DATABASE_URL) {
  fail("DATABASE_URL absent — vérifie .env.");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  const existing = await db
    .select({ id: users.id, accountType: users.accountType })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    console.log(`Un compte existe déjà avec l'email "${email}" (type : ${existing[0]!.accountType}). Aucune modification.`);
    return;
  }

  const hashed = await bcrypt.hash(password, 10);

  const [admin] = await db
    .insert(users)
    .values({
      email,
      password: hashed,
      accountType: "admin",
      isVerified: true,
    })
    .returning({ id: users.id, email: users.email });

  if (!admin) fail("Insertion échouée (cas inattendu).");
  console.log(`Admin créé : ${admin.email} (id=${admin.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
