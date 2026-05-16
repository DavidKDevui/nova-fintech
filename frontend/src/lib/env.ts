// Pendant `next build`, les modules serveur sont evalues sans env du container.
// On retourne alors un placeholder pour ne pas faire crasher le build ;
// la validation stricte reste appliquee au runtime (start du container).
const IS_BUILD_PHASE = process.env.NEXT_PHASE === "phase-production-build";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    if (IS_BUILD_PHASE) return `__BUILD_PLACEHOLDER_${name}__`;
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const JWT_SECRET = process.env.NODE_ENV === "production" && !IS_BUILD_PHASE
  ? requireEnv("JWT_SECRET")
  : (process.env.JWT_SECRET || "dev-secret");

export const DATABASE_URL = requireEnv("DATABASE_URL");

export const BRIDGE_CLIENT_ID = requireEnv("BRIDGE_CLIENT_ID");
export const BRIDGE_CLIENT_SECRET = requireEnv("BRIDGE_CLIENT_SECRET");
export const BRIDGE_API_URL = process.env.BRIDGE_API_URL || "https://api.bridgeapi.io/v3";
