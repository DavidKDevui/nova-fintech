import { createHash } from "node:crypto";

/**
 * Renvoie un identifiant court et déterministe pour un email,
 * destiné aux logs serveur sans exposer la donnée personnelle en clair.
 * Le même email produit toujours le même identifiant (corrélation possible
 * entre lignes de log), mais l'email lui-même n'apparaît jamais dans les logs.
 */
export function emailToLogId(email: string): string {
  if (!email) return "anon";
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex").slice(0, 10);
}
