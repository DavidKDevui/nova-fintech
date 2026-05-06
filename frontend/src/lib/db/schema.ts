import { pgTable, pgEnum, uuid, varchar, boolean, timestamp, date, integer, numeric, bigint, index } from "drizzle-orm/pg-core";

export const accountTypeEnum = pgEnum("account_type", ["practitioner", "admin"]);
export const professionEnum = pgEnum("profession", ["nurse"]);

export const taxRegimeEnum = pgEnum("tax_regime", ["bnc", "micro_bnc"]);

export const paymentFrequencyEnum = pgEnum("payment_frequency", ["monthly", "quarterly"]);
export const urssafPayDayEnum = pgEnum("urssaf_pay_day", ["5", "20"]);
export const carpimkoFrequencyEnum = pgEnum("carpimko_frequency", ["monthly", "semi_annual"]);
export const retrocessionTypeEnum = pgEnum("retrocession_type", ["percentage", "fixed"]);

export const verificationTypeEnum = pgEnum("verification_type", [
  "email_verification",
  "password_reset",
  "account_setup",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }),
  accountType: accountTypeEnum("account_type").notNull().default("practitioner"),
  refreshToken: varchar("refresh_token", { length: 500 }),
  previousRefreshToken: varchar("previous_refresh_token", { length: 500 }),
  previousRefreshTokenExpiresAt: timestamp("previous_refresh_token_expires_at"),
  isVerified: boolean("is_verified").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const practitioners = pgTable("practitioners", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  profession: professionEnum("profession").notNull(),
  activityStartDate: date("activity_start_date").notNull(),
  taxRegime: taxRegimeEnum("tax_regime").notNull(),
  urssafFrequency: paymentFrequencyEnum("urssaf_frequency").notNull().default("monthly"),
  urssafPayDay: urssafPayDayEnum("urssaf_pay_day").notNull().default("5"),
  pasFrequency: paymentFrequencyEnum("pas_frequency").notNull().default("monthly"),
  carpimkoFrequency: carpimkoFrequencyEnum("carpimko_frequency").notNull().default("monthly"),
  pasRate: numeric("pas_rate", { precision: 4, scale: 1 }).notNull().default("10"),
  retrocessionType: retrocessionTypeEnum("retrocession_type"),
  retrocessionValue: numeric("retrocession_value", { precision: 10, scale: 2 }),
  bridgeUserUuid: varchar("bridge_user_uuid", { length: 255 }),
  defaultBankAccountId: uuid("default_bank_account_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Bank data (synced from Bridge API) ──

export const bankAccounts = pgTable("bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  practitionerId: uuid("practitioner_id")
    .notNull()
    .references(() => practitioners.id),
  bridgeAccountId: integer("bridge_account_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  balance: numeric("balance", { precision: 12, scale: 2 }),
  currencyCode: varchar("currency_code", { length: 3 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_bank_accounts_practitioner").on(table.practitionerId),
  index("idx_bank_accounts_last_sync").on(table.lastSyncAt),
]);

export const bankTransactions = pgTable("bank_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => bankAccounts.id, { onDelete: "cascade" }),
  bridgeTransactionId: bigint("bridge_transaction_id", { mode: "number" }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).notNull(),
  date: date("date").notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  cleanDescription: varchar("clean_description", { length: 500 }),
  operationType: varchar("operation_type", { length: 100 }),
  categoryId: integer("category_id"),
  bridgeUpdatedAt: timestamp("bridge_updated_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_bank_transactions_account").on(table.bankAccountId),
  index("idx_bank_transactions_bridge_id").on(table.bridgeTransactionId),
  index("idx_bank_transactions_date").on(table.date),
]);

// ── Bank alerts ──

export const bankAlerts = pgTable("bank_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  practitionerId: uuid("practitioner_id")
    .notNull()
    .references(() => practitioners.id, { onDelete: "cascade" }),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => bankAccounts.id, { onDelete: "cascade" }),
  threshold: numeric("threshold", { precision: 12, scale: 2 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_bank_alerts_practitioner").on(table.practitionerId),
]);

// ── Practices (cabinets infirmiers) ──

export const practices = pgTable("practices", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  finess: varchar("finess", { length: 9 }).notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const practiceLinks = pgTable("practices_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  practiceId: uuid("practice_id")
    .notNull()
    .references(() => practices.id),
  practitionerId: uuid("practitioner_id")
    .notNull()
    .references(() => practitioners.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const practiceLinkSuggestionStatusEnum = pgEnum("practice_link_suggestion_status", [
  "pending",
  "accepted",
  "dismissed",
]);

export const practiceLinkSuggestions = pgTable("practices_links_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  practiceId: uuid("practice_id")
    .notNull()
    .references(() => practices.id),
  practitionerId: uuid("practitioner_id")
    .notNull()
    .references(() => practitioners.id),
  status: practiceLinkSuggestionStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const statementUploads = pgTable("statement_uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  practiceId: uuid("practice_id")
    .notNull()
    .references(() => practices.id),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  fileHash: varchar("file_hash", { length: 64 }).notNull().unique(),
  documentType: varchar("document_type", { length: 50 }).notNull(), // "rattrapage" | "noemie"
  passageCount: integer("passage_count").notNull(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const carePassageStatusEnum = pgEnum("care_passage_status", [
  "a_securiser",
  "a_envoyer",
  "paye",
  "rejete",
]);

export const carePassages = pgTable("care_passages", {
  id: uuid("id").primaryKey().defaultRandom(),
  practiceId: uuid("practice_id")
    .notNull()
    .references(() => practices.id),
  importId: uuid("import_id")
    .references(() => statementUploads.id),
  clientName: varchar("client_name", { length: 500 }),
  invoiceNumber: varchar("invoice_number", { length: 20 }).notNull(),
  careDate: date("care_date").notNull(),
  careMoment: varchar("care_moment", { length: 20 }).notNull(),
  practitioner: varchar("practitioner", { length: 255 }).notNull(),
  cotation: varchar("cotation", { length: 500 }).notNull(),
  status: carePassageStatusEnum("status").notNull(),
  baseAmount: numeric("base_amount", { precision: 10, scale: 2 }).notNull(),
  adj1: numeric("adj_1", { precision: 10, scale: 2 }).notNull(),
  adj2: numeric("adj_2", { precision: 10, scale: 2 }).notNull(),
  adj3: numeric("adj_3", { precision: 10, scale: 2 }).notNull(),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const carePaymentStatusEnum = pgEnum("care_payment_status", [
  "paid",
  "rejected",
]);

export const carePaymentPayerTypeEnum = pgEnum("care_payment_payer_type", [
  "c",
  "m",
]);

export const carePayments = pgTable("care_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  practiceId: uuid("practice_id")
    .notNull()
    .references(() => practices.id),
  uploadId: uuid("upload_id")
    .references(() => statementUploads.id),
  invoiceNumber: varchar("invoice_number", { length: 20 }).notNull(),
  invoiceType: varchar("invoice_type", { length: 10 }),
  payerType: carePaymentPayerTypeEnum("payer_type").notNull(),
  paymentDate: date("payment_date").notNull(),
  paymentRef: varchar("payment_ref", { length: 500 }),
  amountBilled: numeric("amount_billed", { precision: 10, scale: 2 }).notNull(),
  amountPaid: numeric("amount_paid", { precision: 10, scale: 2 }).notNull(),
  status: carePaymentStatusEnum("status").notNull(),
  rejectionReason: varchar("rejection_reason", { length: 500 }),
  clientName: varchar("client_name", { length: 500 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull(),
  accountType: accountTypeEnum("account_type").notNull().default("practitioner"),
  token: varchar("token", { length: 500 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  type: verificationTypeEnum("type").notNull(),
  value: varchar("value", { length: 500 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
