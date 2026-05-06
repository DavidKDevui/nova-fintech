import crypto from "crypto";
import { eq, and, isNull, gt } from "drizzle-orm";
import { db } from "../db";
import { users, practitioners, invitations } from "../db/schema";
import * as mail from "./mail.service";

export async function inviteUser(email: string, accountType: "practitioner" | "admin" = "practitioner") {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)));

  if (existing.length > 0) {
    throw new Error("Email already exists");
  }

  const token = crypto.randomBytes(32).toString("hex");

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [invitation] = await db.insert(invitations).values({
    email,
    accountType,
    token,
    expiresAt,
  }).returning({
    id: invitations.id,
    email: invitations.email,
    accountType: invitations.accountType,
    createdAt: invitations.createdAt,
    expiresAt: invitations.expiresAt,
  });

  await mail.sendAccountSetup(email, token);

  return invitation;
}

export async function listUsers() {
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
}

export async function listPendingInvitations(accountType?: "practitioner" | "admin") {
  const conditions = [
    isNull(invitations.usedAt),
    gt(invitations.expiresAt, new Date()),
  ];
  if (accountType) {
    conditions.push(eq(invitations.accountType, accountType));
  }

  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      accountType: invitations.accountType,
      createdAt: invitations.createdAt,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .where(and(...conditions));
}

export async function cancelInvitation(id: string) {
  await db
    .update(invitations)
    .set({ usedAt: new Date() })
    .where(eq(invitations.id, id));
}

export async function listPractitioners() {
  return db
    .select({
      id: practitioners.id,
      firstName: practitioners.firstName,
      lastName: practitioners.lastName,
      profession: practitioners.profession,
      taxRegime: practitioners.taxRegime,
      activityStartDate: practitioners.activityStartDate,
      retrocessionType: practitioners.retrocessionType,
      retrocessionValue: practitioners.retrocessionValue,
      urssafFrequency: practitioners.urssafFrequency,
      pasFrequency: practitioners.pasFrequency,
      carpimkoFrequency: practitioners.carpimkoFrequency,
      email: users.email,
      isVerified: users.isVerified,
      deletedAt: users.deletedAt,
      createdAt: practitioners.createdAt,
    })
    .from(practitioners)
    .innerJoin(users, eq(practitioners.userId, users.id));
}
