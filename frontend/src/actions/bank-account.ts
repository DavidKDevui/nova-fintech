"use server";

import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners } from "@/lib/db/schema";

export async function setDefaultBankAccountAction(bankAccountId: string) {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorisé" };
  }

  try {
    await db
      .update(practitioners)
      .set({
        defaultBankAccountId: bankAccountId,
        updatedAt: new Date(),
      })
      .where(eq(practitioners.userId, session.id));

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur lors de la mise à jour";
    return { error: message };
  }
}
