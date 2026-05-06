import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  practices,
  practiceLinks,
  practiceLinkSuggestions,
  carePassages,
  carePayments,
  statementUploads,
} from "../db/schema";

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
  // Check if there are care passages or payments linked to this practice
  const [passageCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(carePassages)
    .where(eq(carePassages.practiceId, id));
  const [paymentCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(carePayments)
    .where(eq(carePayments.practiceId, id));

  if (Number(passageCount?.count) > 0 || Number(paymentCount?.count) > 0) {
    throw new Error(
      "Impossible de supprimer ce cabinet : des passages de soins ou des paiements y sont rattachés."
    );
  }

  await db.transaction(async (tx) => {
    await tx.delete(statementUploads).where(eq(statementUploads.practiceId, id));
    await tx.delete(practiceLinkSuggestions).where(eq(practiceLinkSuggestions.practiceId, id));
    await tx.delete(practiceLinks).where(eq(practiceLinks.practiceId, id));
    await tx.delete(practices).where(eq(practices.id, id));
  });
}
