import crypto from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db";
import { users, verifications } from "../db/schema";
import type { MailService } from "./mail.service";

export function createAdminService(mailService: MailService) {
  return {
    async createUser(email: string) {
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), isNull(users.deletedAt)));

      if (existing.length > 0) {
        throw new Error("Email already exists");
      }

      const [user] = await db
        .insert(users)
        .values({ email })
        .returning({
          id: users.id,
          email: users.email,
          accountType: users.accountType,
          createdAt: users.createdAt,
        });

      const token = crypto.randomBytes(32).toString("hex");

      await db.insert(verifications).values({
        userId: user!.id,
        type: "account_setup",
        value: token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      });

      await mailService.sendAccountSetup(email, token);

      return user;
    },

    async listUsers() {
      return db
        .select({
          id: users.id,
          email: users.email,
          accountType: users.accountType,
          isVerified: users.isVerified,
          createdAt: users.createdAt,
          deletedAt: users.deletedAt,
        })
        .from(users);
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
