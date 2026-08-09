"use server";

import { eq } from "drizzle-orm";
import { db } from "../db";
import { practitioners, bankAccounts } from "../db/schema";

export async function getByUserId(userId: string) {
  const [profile] = await db
    .select()
    .from(practitioners)
    .where(eq(practitioners.userId, userId));

  return profile ?? null;
}

// Seul marqueur fiable d'une connexion bancaire aboutie : bridgeUserUuid est posé
// dès le clic sur « connecter » (avant même le choix de la banque), alors qu'une
// ligne bank_accounts n'existe qu'après la synchro initiale.
export async function hasBankAccount(practitionerId: string) {
  const [account] = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(eq(bankAccounts.practitionerId, practitionerId))
    .limit(1);

  return !!account;
}
