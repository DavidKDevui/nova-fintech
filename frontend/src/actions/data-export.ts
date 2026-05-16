"use server";

import { eq, inArray } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import {
  users,
  practitioners,
  bankAccounts,
  bankTransactions,
  bankAlerts,
  practiceLinks,
  practiceLinkSuggestions,
  practitionerFiscalSituations,
  practitionerVacations,
} from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";

// Limite : 3 exports par heure par compte (idem ancien endpoint REST).
const EXPORT_LIMIT = 3;
const EXPORT_WINDOW_MS = 60 * 60_000;

export type ExportResult =
  | { success: true; filename: string; payload: unknown }
  | { error: string };

/**
 * Export RGPD (Art. 20 — Droit à la portabilité).
 * Renvoie un payload sérialisable contenant TOUTES les données personnelles de
 * l'utilisateur connecté. Le client se charge ensuite de générer le Blob et le download.
 */
export async function exportMyDataAction(): Promise<ExportResult> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorisé" };
  }

  const rl = checkRateLimit(`export:${session.id}`, EXPORT_LIMIT, EXPORT_WINDOW_MS);
  if (!rl.allowed) {
    const minutes = Math.ceil(rl.resetInSeconds / 60);
    return { error: `Trop d'exports. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.` };
  }

  try {
    // Compte utilisateur (sans hash de mot de passe ni tokens — ce sont des secrets)
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        accountType: users.accountType,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, session.id));

    if (!user) return { error: "Utilisateur introuvable" };

    // Profil praticien
    const [practitioner] = await db
      .select()
      .from(practitioners)
      .where(eq(practitioners.userId, session.id));

    let banking: { accounts: unknown[]; transactions: unknown[]; alerts: unknown[] } = { accounts: [], transactions: [], alerts: [] };
    let fiscalSituations: unknown[] = [];
    let vacations: unknown[] = [];
    let practices: { links: unknown[]; suggestions: unknown[] } = { links: [], suggestions: [] };

    if (practitioner) {
      const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.practitionerId, practitioner.id));
      const accountIds = accounts.map((a) => a.id);
      const transactions = accountIds.length > 0
        ? await db.select().from(bankTransactions).where(inArray(bankTransactions.bankAccountId, accountIds))
        : [];
      const alerts = await db.select().from(bankAlerts).where(eq(bankAlerts.practitionerId, practitioner.id));
      banking = { accounts, transactions, alerts };

      fiscalSituations = await db.select().from(practitionerFiscalSituations).where(eq(practitionerFiscalSituations.practitionerId, practitioner.id));
      vacations = await db.select().from(practitionerVacations).where(eq(practitionerVacations.practitionerId, practitioner.id));

      const links = await db.select().from(practiceLinks).where(eq(practiceLinks.practitionerId, practitioner.id));
      const suggestions = await db.select().from(practiceLinkSuggestions).where(eq(practiceLinkSuggestions.practitionerId, practitioner.id));
      practices = { links, suggestions };
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      gdpr: {
        article: "20 — Droit à la portabilité des données",
        description: "Toutes les données personnelles qu'Actidec traite à votre sujet.",
        format: "JSON structuré, machine-readable",
      },
      user,
      practitioner: practitioner ?? null,
      banking,
      fiscalSituations,
      vacations,
      practices,
    };

    const filename = `actidec-export_${user.id}_${new Date().toISOString().slice(0, 10)}.json`;
    return { success: true, filename, payload };
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[EXPORT_RGPD] ${detail}`, err);
    return { error: "Erreur lors de la génération de l'export." };
  }
}
