import { cache } from "react";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";
import { JWT_SECRET } from "./env";
const IS_PROD = process.env.NODE_ENV === "production";

export interface SessionUser {
  id: string;
  email: string;
  accountType: "practitioner" | "admin";
  isVerified: boolean;
  createdAt: Date;
}

async function getUserFromToken(token: string): Promise<SessionUser | null> {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        accountType: users.accountType,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.id, payload.userId), isNull(users.deletedAt)));

    if (!user) console.log("[SESSION] getUserFromToken: token valide mais user introuvable en DB", { userId: payload.userId });
    return user ?? null;
  } catch (err) {
    console.log("[SESSION] getUserFromToken: jwt.verify / DB a échoué →", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Read-only session check. Token refresh is handled by the proxy.
 *
 * Mémoïsé par requête via React `cache()` : un rendu serveur qui précharge N
 * actions (page.tsx / layout) les voit toutes appeler getSession() → sans cache,
 * c'est N vérifs JWT + N lookups user en DB pour une seule requête. Le cache est
 * scellé par requête (pas de fuite entre utilisateurs) ; hors rendu (server action
 * POST isolée) il n'y a qu'un appel, donc aucun changement de comportement.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("accessToken")?.value;
  console.log("[SESSION] getSession", { hasAccessToken: !!accessToken });

  if (accessToken) {
    const user = await getUserFromToken(accessToken);
    if (user) {
      console.log("[SESSION] getSession → user ✅", { userId: user.id, accountType: user.accountType });
      return user;
    }
  }

  console.log("[SESSION] getSession → NULL (le layout protégé va rediriger vers /login)");
  return null;
});

export async function setSessionCookies(accessToken: string, refreshToken: string) {
  console.log("[SESSION] setSessionCookies → pose accessToken + refreshToken", { secure: IS_PROD, sameSite: "lax", env: process.env.NODE_ENV });
  const cookieStore = await cookies();

  cookieStore.set("accessToken", accessToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    maxAge: 15 * 60, // 15 min
    path: "/",
  });

  cookieStore.set("refreshToken", refreshToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: "/",
  });
}

export async function clearSessionCookies() {
  console.log("[SESSION] clearSessionCookies → suppression accessToken + refreshToken");
  const cookieStore = await cookies();
  cookieStore.delete("accessToken");
  cookieStore.delete("refreshToken");
}
