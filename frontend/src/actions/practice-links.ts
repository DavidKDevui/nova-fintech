"use server";

import { eq, and, count } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners, practices, practiceLinks, practiceLinkSuggestions, carePassages } from "@/lib/db/schema";
import { namesMatch } from "@/lib/name-matching";

export async function detectAndCreateSuggestions(practitionerId: string, fullName: string) {
  // Get practice IDs already suggested or linked
  const existingSuggestions = await db
    .select({ practiceId: practiceLinkSuggestions.practiceId })
    .from(practiceLinkSuggestions)
    .where(eq(practiceLinkSuggestions.practitionerId, practitionerId));

  const existingLinks = await db
    .select({ practiceId: practiceLinks.practiceId })
    .from(practiceLinks)
    .where(eq(practiceLinks.practitionerId, practitionerId));

  const excludedPracticeIds = new Set([
    ...existingSuggestions.map((s) => s.practiceId),
    ...existingLinks.map((l) => l.practiceId),
  ]);

  // Get all distinct practitioner names + practice IDs from care_passages
  const allPassages = await db
    .selectDistinct({
      practiceId: carePassages.practiceId,
      practitioner: carePassages.practitioner,
    })
    .from(carePassages);

  // Filter matches using our name matching logic
  const matchedPracticeIds = new Set<string>();
  for (const passage of allPassages) {
    if (excludedPracticeIds.has(passage.practiceId)) continue;
    if (namesMatch(fullName, passage.practitioner)) {
      matchedPracticeIds.add(passage.practiceId);
    }
  }

  // Create new suggestions
  if (matchedPracticeIds.size > 0) {
    await db.insert(practiceLinkSuggestions).values(
      Array.from(matchedPracticeIds).map((practiceId) => ({
        practiceId,
        practitionerId,
      }))
    );
  }
}

export async function getPendingSuggestions() {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return [];
  }

  const [practitioner] = await db
    .select({
      id: practitioners.id,
      firstName: practitioners.firstName,
      lastName: practitioners.lastName,
    })
    .from(practitioners)
    .where(eq(practitioners.userId, session.id));

  if (!practitioner) return [];

  // Read-only: just return existing pending suggestions
  // Detection is done at onboarding and bordereau import
  return db
    .select({
      suggestionId: practiceLinkSuggestions.id,
      practiceId: practices.id,
      practiceName: practices.name,
      finess: practices.finess,
    })
    .from(practiceLinkSuggestions)
    .innerJoin(practices, eq(practiceLinkSuggestions.practiceId, practices.id))
    .where(
      and(
        eq(practiceLinkSuggestions.practitionerId, practitioner.id),
        eq(practiceLinkSuggestions.status, "pending")
      )
    );
}

export async function respondToSuggestion(suggestionId: string, accept: boolean) {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorise" };
  }

  const [practitioner] = await db
    .select({ id: practitioners.id })
    .from(practitioners)
    .where(eq(practitioners.userId, session.id));

  if (!practitioner) return { error: "Profil requis" };

  const [suggestion] = await db
    .select()
    .from(practiceLinkSuggestions)
    .where(
      and(
        eq(practiceLinkSuggestions.id, suggestionId),
        eq(practiceLinkSuggestions.practitionerId, practitioner.id)
      )
    );

  if (!suggestion) return { error: "Suggestion introuvable" };

  if (accept) {
    await db.insert(practiceLinks).values({
      practiceId: suggestion.practiceId,
      practitionerId: practitioner.id,
    });
  }

  await db
    .update(practiceLinkSuggestions)
    .set({
      status: accept ? "accepted" : "dismissed",
      updatedAt: new Date(),
    })
    .where(eq(practiceLinkSuggestions.id, suggestionId));

  return { success: true };
}

export async function getPendingSuggestionsCount(): Promise<number> {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") return 0;

  const [practitioner] = await db
    .select({ id: practitioners.id })
    .from(practitioners)
    .where(eq(practitioners.userId, session.id));

  if (!practitioner) return 0;

  const [result] = await db
    .select({ count: count() })
    .from(practiceLinkSuggestions)
    .where(
      and(
        eq(practiceLinkSuggestions.practitionerId, practitioner.id),
        eq(practiceLinkSuggestions.status, "pending")
      )
    );

  return result?.count ?? 0;
}
