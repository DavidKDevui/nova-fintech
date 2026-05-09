"use server";

import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners, bankAccounts } from "@/lib/db/schema";

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

export async function deleteBankAccountAction(bankAccountId: string) {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorisé" };
  }

  try {
    const [hp] = await db
      .select()
      .from(practitioners)
      .where(eq(practitioners.userId, session.id));

    if (!hp) return { error: "Profil professionnel requis" };

    // Verify ownership
    const [account] = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.practitionerId, hp.id)));

    if (!account) return { error: "Compte introuvable" };

    // Reset default if deleting the default account
    if (hp.defaultBankAccountId === bankAccountId) {
      await db
        .update(practitioners)
        .set({ defaultBankAccountId: null, updatedAt: new Date() })
        .where(eq(practitioners.id, hp.id));
    }

    await db.delete(bankAccounts).where(eq(bankAccounts.id, bankAccountId));

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur lors de la suppression";
    return { error: message };
  }
}
