const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Vrai si `s` est un UUID v1-v5 (RFC 4122). À utiliser en entrée de Server
 * Action sur tout ID reçu du client pour éviter qu'une chaîne arbitraire
 * arrive jusqu'aux requêtes DB.
 */
export function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_REGEX.test(s);
}

/**
 * Renvoie `value` si c'est un UUID valide, sinon `null`. Pratique en garde
 * courte : `const id = parseUuid(input); if (!id) return { error: ... };`
 */
export function parseUuid(value: unknown): string | null {
  return isUuid(value) ? value : null;
}

export function validateEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !EMAIL_REGEX.test(normalized)) {
    throw new Error("Format d'email invalide");
  }
  if (normalized.length > 255) {
    throw new Error("Email trop long");
  }
  return normalized;
}

export function validatePassword(password: string): void {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error("Le mot de passe doit contenir au moins une majuscule");
  }
  if (!/[a-z]/.test(password)) {
    throw new Error("Le mot de passe doit contenir au moins une minuscule");
  }
  if (!/[0-9]/.test(password)) {
    throw new Error("Le mot de passe doit contenir au moins un chiffre");
  }
}
