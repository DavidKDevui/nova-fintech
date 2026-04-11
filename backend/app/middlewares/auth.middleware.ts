import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export interface AuthRequest extends Request {
  userId: string;
  accountType: string;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Read token from cookie first, fallback to Authorization header
  const token = req.cookies?.accessToken
    || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);

  if (!token) {
    res.status(401).json({ error: "Missing or invalid token" });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };

    const [user] = await db
      .select({ id: users.id, accountType: users.accountType })
      .from(users)
      .where(and(eq(users.id, payload.userId), isNull(users.deletedAt)));

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    (req as AuthRequest).userId = user.id;
    (req as AuthRequest).accountType = user.accountType;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  if ((req as AuthRequest).accountType !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
