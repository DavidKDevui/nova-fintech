import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { eq, and, isNull, gt } from "drizzle-orm";
import { db } from "../db";
import { users, invitations, verifications, practitioners, bankAccounts, bankTransactions, practiceLinks, practiceLinkSuggestions } from "../db/schema";
import { JWT_SECRET } from "../env";
import { validateEmail, validatePassword } from "../validation";
import * as mail from "./mail.service";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function findActiveUser(field: "email" | "id", value: string) {
  return db
    .select()
    .from(users)
    .where(and(eq(users[field], value), isNull(users.deletedAt)));
}

export async function login(email: string, password: string) {
  const normalizedEmail = validateEmail(email);
  const [user] = await findActiveUser("email", normalizedEmail);
  if (!user || !user.password) {
    throw new Error("Invalid credentials");
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new Error("Invalid credentials");
  }

  const tokens = await generateTokens(user.id);

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
}

export async function isTokenValid(token: string): Promise<boolean> {
  const [invitation] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.token, token),
        isNull(invitations.usedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    );
  return !!invitation;
}

export async function setupPassword(token: string, password: string) {
  validatePassword(password);

  const [invitation] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.token, token),
        isNull(invitations.usedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    );

  if (!invitation) {
    throw new Error("Invalid or expired invitation");
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  // Check if user already exists (could be soft-deleted)
  const [existing] = await db
    .select({ id: users.id, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.email, invitation.email));

  let user;

  if (existing) {
    // Reactivate existing user (soft-deleted or not)
    [user] = await db
      .update(users)
      .set({
        password: hashedPassword,
        accountType: invitation.accountType,
        isVerified: true,
        deletedAt: null,
        refreshToken: null,
        previousRefreshToken: null,
        previousRefreshTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning({ id: users.id });
  } else {
    [user] = await db
      .insert(users)
      .values({
        email: invitation.email,
        password: hashedPassword,
        accountType: invitation.accountType,
        isVerified: true,
      })
      .returning({ id: users.id });
  }

  // Mark invitation as used
  await db.update(invitations).set({ usedAt: new Date() }).where(eq(invitations.id, invitation.id));

  return user;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  validatePassword(newPassword);

  const [user] = await findActiveUser("id", userId);
  if (!user || !user.password) {
    throw new Error("User not found");
  }

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) {
    throw new Error("Invalid current password");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await db.update(users).set({ password: hashedPassword, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function forgotPassword(email: string) {
  const normalizedEmail = validateEmail(email);
  const [user] = await findActiveUser("email", normalizedEmail);
  if (!user) return;

  const token = crypto.randomBytes(32).toString("hex");

  await db.insert(verifications).values({
    userId: user.id,
    type: "password_reset",
    value: token,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h
  });

  await mail.sendResetPassword(email, token);
}

export async function isResetTokenValid(token: string): Promise<boolean> {
  const [verification] = await db
    .select({ id: verifications.id })
    .from(verifications)
    .where(
      and(
        eq(verifications.type, "password_reset"),
        eq(verifications.value, token),
        isNull(verifications.usedAt),
        gt(verifications.expiresAt, new Date()),
      ),
    );
  return !!verification;
}

export async function resetPassword(token: string, newPassword: string) {
  validatePassword(newPassword);

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

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await db.update(verifications).set({ usedAt: new Date() }).where(eq(verifications.id, verification.id));
  await db.update(users).set({ password: hashedPassword, refreshToken: null, previousRefreshToken: null, previousRefreshTokenExpiresAt: null, updatedAt: new Date() }).where(eq(users.id, verification.userId));
}

export async function refreshSession(refreshToken: string) {
  try {
    const payload = jwt.verify(refreshToken, JWT_SECRET) as { userId: string };

    const [user] = await findActiveUser("id", payload.userId);
    if (!user || !user.refreshToken) {
      throw new Error("Invalid session");
    }

    const tokenHash = hashToken(refreshToken);

    // Check current refresh token
    if (tokenHash === user.refreshToken) {
      return generateTokens(user.id);
    }

    // Grace period: accept the previous token for 30s after rotation
    if (
      user.previousRefreshToken &&
      user.previousRefreshTokenExpiresAt &&
      user.previousRefreshTokenExpiresAt > new Date() &&
      tokenHash === user.previousRefreshToken
    ) {
      // Don't rotate again — just issue a fresh access token
      const accessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
      return { accessToken, refreshToken: null };
    }

    throw new Error("Invalid refresh token");
  } catch {
    throw new Error("Invalid refresh token");
  }
}

export async function logout(userId: string) {
  await db.update(users).set({ refreshToken: null, previousRefreshToken: null, previousRefreshTokenExpiresAt: null, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function deleteAccount(userId: string) {
  const [user] = await findActiveUser("id", userId);
  if (!user) throw new Error("User not found");

  // Find practitioner profile
  const [practitioner] = await db
    .select({ id: practitioners.id })
    .from(practitioners)
    .where(eq(practitioners.userId, userId));

  if (practitioner) {
    // Delete bank transactions (via bank accounts)
    const accs = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(eq(bankAccounts.practitionerId, practitioner.id));

    for (const acc of accs) {
      await db.delete(bankTransactions).where(eq(bankTransactions.bankAccountId, acc.id));
    }

    // Delete bank accounts
    await db.delete(bankAccounts).where(eq(bankAccounts.practitionerId, practitioner.id));

    // Delete practice links & suggestions
    await db.delete(practiceLinks).where(eq(practiceLinks.practitionerId, practitioner.id));
    await db.delete(practiceLinkSuggestions).where(eq(practiceLinkSuggestions.practitionerId, practitioner.id));

    // Delete practitioner profile
    await db.delete(practitioners).where(eq(practitioners.id, practitioner.id));
  }

  // Delete verifications
  await db.delete(verifications).where(eq(verifications.userId, userId));

  // Anonymize & soft-delete user
  const anonymized = `deleted_${crypto.randomBytes(8).toString("hex")}@anonymous.local`;
  await db.update(users).set({
    email: anonymized,
    password: null,
    refreshToken: null,
    previousRefreshToken: null,
    previousRefreshTokenExpiresAt: null,
    deletedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(users.id, userId));
}

const GRACE_PERIOD_SECONDS = 30;

async function generateTokens(userId: string) {
  // Get current token hash to save as previous (grace period)
  const [user] = await db.select({ refreshToken: users.refreshToken }).from(users).where(eq(users.id, userId));

  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });

  const hashedRefresh = hashToken(refreshToken);
  await db
    .update(users)
    .set({
      refreshToken: hashedRefresh,
      previousRefreshToken: user?.refreshToken ?? null,
      previousRefreshTokenExpiresAt: user?.refreshToken ? new Date(Date.now() + GRACE_PERIOD_SECONDS * 1000) : null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return { accessToken, refreshToken };
}
