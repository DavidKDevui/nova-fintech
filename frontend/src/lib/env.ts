function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const JWT_SECRET = process.env.NODE_ENV === "production"
  ? requireEnv("JWT_SECRET")
  : (process.env.JWT_SECRET || "dev-secret");

export const DATABASE_URL = requireEnv("DATABASE_URL");

export const BRIDGE_CLIENT_ID = requireEnv("BRIDGE_CLIENT_ID");
export const BRIDGE_CLIENT_SECRET = requireEnv("BRIDGE_CLIENT_SECRET");
export const BRIDGE_API_URL = process.env.BRIDGE_API_URL || "https://api.bridgeapi.io/v3";
