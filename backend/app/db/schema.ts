import { pgTable, pgEnum, uuid, varchar, boolean, timestamp } from "drizzle-orm/pg-core";

export const accountTypeEnum = pgEnum("account_type", ["user", "admin"]);
export const verificationTypeEnum = pgEnum("verification_type", ["email_verification", "password_reset"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  accountType: accountTypeEnum("account_type").notNull().default("user"),
  refreshToken: varchar("refresh_token", { length: 500 }),
  isVerified: boolean("is_verified").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  type: verificationTypeEnum("type").notNull(),
  value: varchar("value", { length: 500 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});