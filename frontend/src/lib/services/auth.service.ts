import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq, and, isNull, gt, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  invitations,
  verifications,
  practitioners,
  bankAccounts,
  bankTransactions,
  bankAlerts,
  practiceLinks,
  practiceLinkSuggestions,
  practitionerFiscalSituations,
  practitionerVacations,
  carePassages,
  logsNotifications,
} from "../db/schema";
import { JWT_SECRET } from "../env";
import { validateEmail, validatePassword } from "../validation";
import { namesMatch } from "../name-matching";
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

  if (currentPassword === newPassword) {
    throw new Error("Same password");
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
    console.log("[REFRESH] verify OK", {
      userId: user.id,
      matchesCurrent: tokenHash === user.refreshToken,
      matchesPrevious: tokenHash === user.previousRefreshToken,
      prevExpiresAt: user.previousRefreshTokenExpiresAt,
    });

    // Check current refresh token — rotation ATOMIQUE (compare-and-swap) pour éviter
    // les races de concurrence : le dashboard praticien déclenche plusieurs refresh
    // simultanés (prefetch + actions). Sans CAS, une double rotation concurrente perd
    // le token → une requête échoue → cookies effacés → déconnexion (pas l'admin, qui
    // fait moins de requêtes simultanées).
    if (tokenHash === user.refreshToken) {
      const accessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
      const newRefreshToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
      const rotated = await db
        .update(users)
        .set({
          refreshToken: hashToken(newRefreshToken),
          previousRefreshToken: tokenHash,
          previousRefreshTokenExpiresAt: new Date(Date.now() + GRACE_PERIOD_SECONDS * 1000),
          updatedAt: new Date(),
        })
        // Ne tourne que si le token courant est TOUJOURS celui-ci (sinon une autre
        // requête a déjà tourné depuis ce même token).
        .where(and(eq(users.id, user.id), eq(users.refreshToken, tokenHash)))
        .returning({ id: users.id });

      if (rotated.length > 0) {
        console.log("[REFRESH] CAS rotated ✅ (new refresh issued)", { userId: user.id });
        return { accessToken, refreshToken: newRefreshToken };
      }
      // Race perdue : une concurrente a déjà tourné depuis ce token. Le nôtre est
      // devenu "previous" → on émet juste un access token, sans toucher au cookie refresh.
      console.log("[REFRESH] CAS lost (concurrent rotation) → access-only, cookie unchanged", { userId: user.id });
      return { accessToken, refreshToken: null };
    }

    // Grace period: accept the previous token for 30s after rotation
    if (
      user.previousRefreshToken &&
      user.previousRefreshTokenExpiresAt &&
      user.previousRefreshTokenExpiresAt > new Date() &&
      tokenHash === user.previousRefreshToken
    ) {
      // Don't rotate again — just issue a fresh access token
      console.log("[REFRESH] token === previous within grace → access-only", { userId: user.id });
      const accessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
      return { accessToken, refreshToken: null };
    }

    console.log("[REFRESH] ❌ token matches NEITHER current NOR valid previous → INVALID (will logout)");
    throw new Error("Invalid refresh token");
  } catch (err) {
    console.log("[REFRESH] ❌ threw:", err instanceof Error ? err.message : String(err));
    throw new Error("Invalid refresh token");
  }
}

export async function logout(userId: string) {
  await db.update(users).set({ refreshToken: null, previousRefreshToken: null, previousRefreshTokenExpiresAt: null, updatedAt: new Date() }).where(eq(users.id, userId));
}

const ANONYMIZED_PRACTITIONER_LABEL = "PRAT_ANONYMISE";
const ANONYMIZED_EMAIL_LABEL = "anonymized@deleted.local";

export async function deleteAccount(userId: string) {
  const [user] = await findActiveUser("id", userId);
  if (!user) throw new Error("User not found");

  // Capture l'identité avant toute suppression pour pouvoir anonymiser
  // les enregistrements indirectement liés (logs de notifications, bordereaux).
  const originalEmail = user.email;

  const [practitioner] = await db
    .select({
      id: practitioners.id,
      firstName: practitioners.firstName,
      lastName: practitioners.lastName,
    })
    .from(practitioners)
    .where(eq(practitioners.userId, userId));

  if (practitioner) {
    const fullName = `${practitioner.firstName} ${practitioner.lastName}`;
    const lastNamePattern = `%${practitioner.lastName}%`;

    // ── RGPD Art. 17 : anonymise le nom du praticien dans care_passages ──
    // Les bordereaux Ozzen sont importés au niveau du cabinet (practiceId),
    // pas du praticien. Le cabinet a une obligation de conservation comptable
    // (CGI, 10 ans) : on garde donc les passages mais on efface le nom du
    // praticien qui les a réalisés. On capture les practiceIds AVANT de
    // supprimer practice_links.
    const links = await db
      .select({ practiceId: practiceLinks.practiceId })
      .from(practiceLinks)
      .where(eq(practiceLinks.practitionerId, practitioner.id));

    if (links.length > 0) {
      const practiceIds = links.map((l) => l.practiceId);
      // Pré-filtre SQL sur le nom + matching exact JS via namesMatch (même
      // approche que cotisations-estimate.ts pour éviter les faux positifs
      // sur les noms courants).
      const candidates = await db
        .select({ id: carePassages.id, practitioner: carePassages.practitioner })
        .from(carePassages)
        .where(and(
          inArray(carePassages.practiceId, practiceIds),
          sql`${carePassages.practitioner} ILIKE ${lastNamePattern}`,
        ));
      const matchedIds = candidates
        .filter((c) => namesMatch(fullName, c.practitioner))
        .map((c) => c.id);
      if (matchedIds.length > 0) {
        await db
          .update(carePassages)
          .set({ practitioner: ANONYMIZED_PRACTITIONER_LABEL })
          .where(inArray(carePassages.id, matchedIds));
      }
    }

    // Delete bank transactions (via bank accounts)
    const accs = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(eq(bankAccounts.practitionerId, practitioner.id));

    for (const acc of accs) {
      await db.delete(bankTransactions).where(eq(bankTransactions.bankAccountId, acc.id));
    }

    // Delete bank alerts (référencent practitioner et bank_accounts)
    await db.delete(bankAlerts).where(eq(bankAlerts.practitionerId, practitioner.id));

    // Delete bank accounts
    await db.delete(bankAccounts).where(eq(bankAccounts.practitionerId, practitioner.id));

    // Delete fiscal situations & vacations (données RGPD personnelles)
    await db.delete(practitionerFiscalSituations).where(eq(practitionerFiscalSituations.practitionerId, practitioner.id));
    await db.delete(practitionerVacations).where(eq(practitionerVacations.practitionerId, practitioner.id));

    // Delete practice links & suggestions
    await db.delete(practiceLinks).where(eq(practiceLinks.practitionerId, practitioner.id));
    await db.delete(practiceLinkSuggestions).where(eq(practiceLinkSuggestions.practitionerId, practitioner.id));

    // Delete practitioner profile (déclenche ON DELETE SET NULL sur
    // logs_notifications.practitioner_id).
    await db.delete(practitioners).where(eq(practitioners.id, practitioner.id));
  }

  // Delete verifications
  await db.delete(verifications).where(eq(verifications.userId, userId));

  // ── RGPD Art. 17 : anonymise l'email destinataire dans logs_notifications ──
  // L'historique des mails envoyés (rappels échéances, alertes trésorerie,
  // recap mensuel) est conservé pour traçabilité opérationnelle, mais l'email
  // du destinataire est une donnée personnelle qui doit être effacée.
  await db
    .update(logsNotifications)
    .set({ recipient: ANONYMIZED_EMAIL_LABEL })
    .where(eq(logsNotifications.recipient, originalEmail));

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
