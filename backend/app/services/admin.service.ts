import crypto from "crypto";
import bcrypt from "bcrypt";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
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

      const tempPassword = crypto.randomBytes(8).toString("hex");
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      const [user] = await db
        .insert(users)
        .values({
          email,
          password: hashedPassword,
          isVerified: true,
          mustChangePassword: true,
        })
        .returning({
          id: users.id,
          email: users.email,
          accountType: users.accountType,
          createdAt: users.createdAt,
        });

      await mailService.sendWelcome(email, tempPassword);

      return user;
    },

    async listUsers() {
      return db
        .select({
          id: users.id,
          email: users.email,
          accountType: users.accountType,
          isVerified: users.isVerified,
          mustChangePassword: users.mustChangePassword,
          createdAt: users.createdAt,
          deletedAt: users.deletedAt,
        })
        .from(users);
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
