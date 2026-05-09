"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { practitioners } from "@/lib/db/schema";

const ANS_FHIR_BASE = "https://gateway.api.esante.gouv.fr/fhir/v1";

export async function verifyRppsAction(rppsNumber: string) {
  if (!/^\d{11}$/.test(rppsNumber)) {
    return { error: "Le numéro RPPS doit contenir exactement 11 chiffres." };
  }

  // Check uniqueness in DB
  const existing = await db
    .select({ id: practitioners.id })
    .from(practitioners)
    .where(eq(practitioners.rppsNumber, rppsNumber))
    .limit(1);

  if (existing.length > 0) {
    return { error: "Ce numéro RPPS est déjà associé à un autre compte." };
  }

  // Verify existence in ANS directory
  try {
    const apiKey = process.env.FHIR_API_KEY;
    const res = await fetch(
      `${ANS_FHIR_BASE}/Practitioner?identifier=${encodeURIComponent(rppsNumber)}&_format=json`,
      {
        headers: {
          Accept: "application/fhir+json",
          ...(apiKey && { "ESANTE-API-KEY": apiKey }),
        },
      }
    );

    if (!res.ok) {
      return { error: "Impossible de vérifier le numéro RPPS. Veuillez réessayer." };
    }

    const data = await res.json();

    if (!data.entry || data.entry.length === 0) {
      return { error: "Aucun praticien trouvé avec ce numéro RPPS." };
    }

    return { success: true };
  } catch {
    return { error: "Erreur de connexion à l'annuaire santé. Veuillez réessayer." };
  }
}
