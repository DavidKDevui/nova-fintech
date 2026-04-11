import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { eq, and, isNull, gt } from "drizzle-orm";
import { db } from "../db";
import { users, verifications } from "../db/schema";
import type { MailService } from "./mail.service";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

export function createAuthService(mailService: MailService) {
  function findActiveUser(field: "email" | "id", value: string) {
    return db
      .select()
      .from(users)
      .where(and(eq(users[field], value), isNull(users.deletedAt)));
  }

  return {
    async getMe(userId: string) {
      const [user] = await findActiveUser("id", userId);
      if (!user) throw new Error("User not found");
      return {
        id: user.id,
        email: user.email,
        accountType: user.accountType,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
      };
    },

    async login(email: string, password: string) {
      const [user] = await findActiveUser("email", email);
      if (!user || !user.password) {
        throw new Error("Invalid credentials");
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        throw new Error("Invalid credentials");
      }

      const tokens = await this.generateTokens(user.id);

      return {
        user: {
          id: user.id,
          email: user.email,
          accountType: user.accountType,
          isVerified: user.isVerified,
          createdAt: user.createdAt,
        },
        ...tokens,
      };
    },

    async setupPassword(token: string, password: string) {
      const [verification] = await db
        .select()
        .from(verifications)
        .where(
          and(
            eq(verifications.type, "account_setup"),
            eq(verifications.value, token),
            isNull(verifications.usedAt),
            gt(verifications.expiresAt, new Date()),
          ),
        );

      if (!verification) {
        throw new Error("Invalid or expired setup token");
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      await db
        .update(verifications)
        .set({ usedAt: new Date() })
        .where(eq(verifications.id, verification.id));

      await db
        .update(users)
        .set({
          password: hashedPassword,
          isVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, verification.userId));
    },

    async changePassword(userId: string, currentPassword: string, newPassword: string) {
      const [user] = await findActiveUser("id", userId);
      if (!user || !user.password) {
        throw new Error("User not found");
      }

      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        throw new Error("Invalid current password");
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await db
        .update(users)
        .set({
          password: hashedPassword,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    },

    async refresh(refreshToken: string) {
      try {
        const payload = jwt.verify(refreshToken, JWT_SECRET) as { userId: string };

        const [user] = await findActiveUser("id", payload.userId);
        if (!user) {
          throw new Error("User not found");
        }

        if (!user.refreshToken) {
          throw new Error("No active session");
        }

        const valid = await bcrypt.compare(refreshToken, user.refreshToken);
        if (!valid) {
          throw new Error("Invalid refresh token");
        }

        return this.generateTokens(user.id);
      } catch {
        throw new Error("Invalid refresh token");
      }
    },

    async forgotPassword(email: string) {
      const [user] = await findActiveUser("email", email);
      if (!user) {
        return;
      }

      const token = crypto.randomBytes(32).toString("hex");

      await db.insert(verifications).values({
        userId: user.id,
        type: "password_reset",
        value: token,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h
      });

      await mailService.sendResetPassword(email, token);
    },

    async resetPassword(token: string, newPassword: string) {
      const [verification] = await db
        .select()
        .from(verifications)
        .where(
          and(
            eq(verifications.type, "password_reset"),
            eq(verifications.value, token),
            isNull(verifications.usedAt),
            gt(verifications.expiresAt, new Date()),
          ),
        );

      if (!verification) {
        throw new Error("Invalid or expired reset token");
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await db
        .update(verifications)
        .set({ usedAt: new Date() })
        .where(eq(verifications.id, verification.id));

      await db
        .update(users)
        .set({
          password: hashedPassword,
          refreshToken: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, verification.userId));
    },

    async deleteAccount(userId: string) {
      const [user] = await findActiveUser("id", userId);
      if (!user) {
        throw new Error("User not found");
      }

      await db
        .update(users)
        .set({
          deletedAt: new Date(),
          refreshToken: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    },

    async logout(userId: string) {
      await db
        .update(users)
        .set({ refreshToken: null, updatedAt: new Date() })
        .where(eq(users.id, userId));
    },

    async generateTokens(userId: string) {
      const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
      const refreshToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });

      const hashedRefresh = await bcrypt.hash(refreshToken, 10);
      await db
        .update(users)
        .set({ refreshToken: hashedRefresh, updatedAt: new Date() })
        .where(eq(users.id, userId));

      return { accessToken, refreshToken };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
