import { pgTable, pgEnum, uuid, varchar, boolean, timestamp, date, integer, numeric, bigint, smallint, index, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";

export const accountTypeEnum = pgEnum("account_type", ["practitioner", "admin"]);
export const professionEnum = pgEnum("profession", ["nurse"]);

export const taxRegimeEnum = pgEnum("tax_regime", ["bnc", "micro_bnc"]);

export const paymentFrequencyEnum = pgEnum("payment_frequency", ["monthly", "quarterly"]);
export const urssafPayDayEnum = pgEnum("urssaf_pay_day", ["5", "20"]);
export const carpimkoFrequencyEnum = pgEnum("carpimko_frequency", ["monthly", "semi_annual"]);
export const carpimkoPayDayEnum = pgEnum("carpimko_pay_day", ["5", "10", "15", "20", "25"]);
export const retrocessionTypeEnum = pgEnum("retrocession_type", ["percentage", "fixed"]);

export const recapFrequencyEnum = pgEnum("recap_frequency", ["none", "monthly", "quarterly"]);

export const notificationChannelEnum = pgEnum("notification_channel", ["mail"]);
export const notificationStatusEnum = pgEnum("notification_status", ["sent", "failed"]);

export const categorizationSourceEnum = pgEnum("categorization_source", ["manual", "auto_similarity"]);

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
  carpimkoPayDay: carpimkoPayDayEnum("carpimko_pay_day").notNull().default("10"),
  pasRate: numeric("pas_rate", { precision: 4, scale: 1 }).notNull().default("10"),
  retrocessionType: retrocessionTypeEnum("retrocession_type"),
  retrocessionValue: numeric("retrocession_value", { precision: 10, scale: 2 }),
  rppsNumber: varchar("rpps_number", { length: 11 }).unique(),
  bridgeUserUuid: varchar("bridge_user_uuid", { length: 255 }),
  defaultBankAccountId: uuid("default_bank_account_id").references((): AnyPgColumn => bankAccounts.id, { onDelete: "set null" }),
  daysPerWeekWorked: integer("days_per_week_worked").notNull().default(5),
  recapFrequency: recapFrequencyEnum("recap_frequency").notNull().default("monthly"),
  deadlinesReminderEnabled: boolean("deadlines_reminder_enabled").notNull().default(true),
  rejectionAlertEnabled: boolean("rejection_alert_enabled").notNull().default(false),
  rejectionAlertThreshold: numeric("rejection_alert_threshold", { precision: 5, scale: 2 }).notNull().default("5.00"),
  rejectionAlertLastSentAt: timestamp("rejection_alert_last_sent_at"),
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
  category: varchar("category", { length: 50 }),
  categorizationSource: categorizationSourceEnum("categorization_source"),
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
  uniqueIndex("uniq_bank_alerts_practitioner_account").on(table.practitionerId, table.bankAccountId),
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

// ── Reconciliation entre carePayments (bordereaux) et bankTransactions (virements caisse) ──
// Un même carePayment ne peut être réconcilié qu'une fois (UNIQUE).
// Plusieurs carePayments peuvent pointer la même bankTransaction (virements groupés caisse).
// pass: 1 = match 1-pour-1 exact ; 2 = subset-sum unique sur ±1j.
export const carePaymentReconciliations = pgTable("care_payment_reconciliations", {
  id: uuid("id").primaryKey().defaultRandom(),
  carePaymentId: uuid("care_payment_id")
    .notNull()
    .unique()
    .references(() => carePayments.id, { onDelete: "cascade" }),
  bankTransactionId: uuid("bank_transaction_id")
    .notNull()
    .references(() => bankTransactions.id, { onDelete: "cascade" }),
  pass: smallint("pass").notNull(),
  matchedAt: timestamp("matched_at").notNull().defaultNow(),
}, (table) => [
  index("idx_care_payment_reconciliations_bank_tx").on(table.bankTransactionId),
]);

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

// ── Fiscal situations (per year) ──

export const maritalStatusEnum = pgEnum("marital_status", ["celibataire", "marie", "pacse"]);

export const practitionerFiscalSituations = pgTable("practitioner_fiscal_situations", {
  id: uuid("id").primaryKey().defaultRandom(),
  practitionerId: uuid("practitioner_id")
    .notNull()
    .references(() => practitioners.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  maritalStatus: maritalStatusEnum("marital_status").notNull().default("celibataire"),
  dependentChildren: integer("dependent_children").notNull().default(0),
  isSingleParent: boolean("is_single_parent").notNull().default(false),
  otherIncome: numeric("other_income", { precision: 12, scale: 2 }).notNull().default("0"),
  declaredIr: numeric("declared_ir", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_fiscal_situations_practitioner_year").on(table.practitionerId, table.year),
]);

// ── Notifications log ──

export const logsNotifications = pgTable("logs_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  channel: notificationChannelEnum("channel").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  recipient: varchar("recipient", { length: 255 }).notNull(),
  practitionerId: uuid("practitioner_id").references(() => practitioners.id, { onDelete: "set null" }),
  subject: varchar("subject", { length: 500 }),
  status: notificationStatusEnum("status").notNull(),
  errorMessage: varchar("error_message", { length: 1000 }),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
}, (table) => [
  index("idx_logs_notifications_practitioner").on(table.practitionerId),
  index("idx_logs_notifications_sent_at").on(table.sentAt),
]);

// ── Vacations (per practitioner, per month) ──

export const practitionerVacations = pgTable("practitioner_vacations", {
  id: uuid("id").primaryKey().defaultRandom(),
  practitionerId: uuid("practitioner_id")
    .notNull()
    .references(() => practitioners.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  // `days` = ancien modèle (jours de congés). Conservé pour compat, remplacé par
  // `workedDays` (jours travaillés). NULL = non saisi → défaut = jours ouvrés du mois.
  days: integer("days").notNull().default(0),
  workedDays: integer("worked_days"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_vacations_practitioner_year").on(table.practitionerId, table.year),
]);

// ── Leviers de C.A. pour la prévision (scénarios "what-if" persistés) ──

export const caAdjustmentKindEnum = pgEnum("ca_adjustment_kind", [
  "rate_pct",       // variation de tarif (+/- %)
  "volume_pct",     // variation de volume de patientèle (+/- %)
  "fixed_monthly",  // montant fixe mensuel (ex: nouveau contrat)
  "fixed_oneoff",   // montant ponctuel (ex: prime)
  "month_override", // valeur imposée pour un mois (ex: estimation par actes prévus)
]);

export const practitionerCaAdjustments = pgTable("practitioner_ca_adjustments", {
  id: uuid("id").primaryKey().defaultRandom(),
  practitionerId: uuid("practitioner_id")
    .notNull()
    .references(() => practitioners.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  kind: caAdjustmentKindEnum("kind").notNull(),
  // rate_pct/volume_pct : ratio stocké en décimal (0.10 = +10 %). fixed_* : euros.
  value: numeric("value", { precision: 12, scale: 4 }).notNull(),
  startMonth: integer("start_month").notNull(),
  endMonth: integer("end_month").notNull(),
  label: varchar("label", { length: 200 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_ca_adjustments_practitioner_year").on(table.practitionerId, table.year),
]);
