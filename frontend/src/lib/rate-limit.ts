/**
 * Rate limiter en mémoire pour serveur Next.js.
 * Note : la map est par instance — pour un déploiement multi-instance (Vercel),
 * remplacer par Redis / Upstash. Tient quand même pour un MVP mono-instance.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
};

/**
 * Vérifie et incrémente le compteur pour une clé donnée.
 * Retourne { allowed: false } si la limite est dépassée.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetInSeconds: Math.ceil(windowMs / 1000) };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetInSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetInSeconds: Math.ceil((entry.resetAt - now) / 1000) };
}

/**
 * Nettoyage périodique des entrées expirées (optionnel).
 * À appeler depuis un cron léger si la map grossit trop.
 */
export function pruneRateLimit() {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (now > v.resetAt) buckets.delete(k);
  }
}
