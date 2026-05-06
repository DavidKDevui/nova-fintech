import { eq } from "drizzle-orm";
import { db } from "../db";
import { practices } from "../db/schema";

export async function listPractices() {
  return db
    .select({
      id: practices.id,
      name: practices.name,
      finess: practices.finess,
      createdAt: practices.createdAt,
    })
    .from(practices);
}

export async function createPractice(name: string, finess: string) {
  const [practice] = await db
    .insert(practices)
    .values({ name, finess })
    .returning({
      id: practices.id,
      name: practices.name,
      finess: practices.finess,
      createdAt: practices.createdAt,
    });

  return practice;
}

export async function updatePractice(id: string, name: string, finess: string) {
  const [practice] = await db
    .update(practices)
    .set({ name, finess, updatedAt: new Date() })
    .where(eq(practices.id, id))
    .returning({
      id: practices.id,
      name: practices.name,
      finess: practices.finess,
      createdAt: practices.createdAt,
    });

  return practice;
}

export async function deletePractice(id: string) {
  await db.delete(practices).where(eq(practices.id, id));
}
