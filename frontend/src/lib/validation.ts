const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

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
