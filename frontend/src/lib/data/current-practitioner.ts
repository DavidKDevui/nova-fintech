import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { practitioners } from "@/lib/db/schema";

export type Practitioner = typeof practitioners.$inferSelect;

/**
 * Profil praticien d'un utilisateur, mémoïsé PAR REQUÊTE via React `cache()`.
 *
 * Quasiment toutes les server actions commencent par « session → praticien » :
 * un rendu serveur qui en enchaîne une dizaine (dashboard, gestion, layout)
 * refaisait dix fois le même SELECT sur `practitioners`. Le cache est scellé
 * par requête (aucune fuite entre utilisateurs ni entre requêtes) ; hors rendu
 * (server action POST isolée) il n'y a qu'un appel, donc aucun changement de
 * comportement. Les mutations du profil (updateProfileAction…) passent par un
 * `router.refresh()` côté client → nouvelle requête → cache vide.
 */
export const getPractitionerByUserId = cache(async (userId: string): Promise<Practitioner | null> => {
  const [hp] = await db
    .select()
    .from(practitioners)
    .where(eq(practitioners.userId, userId))
    .limit(1);
  return hp ?? null;
});
