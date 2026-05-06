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

    return user ?? null;
  } catch {
    return null;
  }
}

/**
 * Read-only session check. Token refresh is handled by the proxy.
 */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("accessToken")?.value;

  if (accessToken) {
    const user = await getUserFromToken(accessToken);
    if (user) return user;
  }

  return null;
}

export async function setSessionCookies(accessToken: string, refreshToken: string) {
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
  const cookieStore = await cookies();
  cookieStore.delete("accessToken");
  cookieStore.delete("refreshToken");
}
