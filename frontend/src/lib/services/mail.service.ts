import nodemailer from "nodemailer";
import { type Block, buildMailHtml } from "../mail/template";
import { db } from "../db";
import { logsNotifications } from "../db/schema";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const SMTP_FROM = process.env.SMTP_FROM || "noreply@actidec.com";

export type NotificationType =
  | "account_setup"
  | "account_deleted"
  | "password_reset"
  | "treasury_alert"
  | "rejection_alert"
  | "monthly_recap"
  | "deadlines_reminder";

export type SendMeta = { type: NotificationType; practitionerId?: string };

function createTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn("SMTP not configured — emails will be logged but not sent");
    return nodemailer.createTransport({ jsonTransport: true });
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const transporter = createTransporter();

async function logNotification(row: {
  type: NotificationType;
  recipient: string;
  subject: string;
  status: "sent" | "failed";
  errorMessage?: string;
  practitionerId?: string;
}) {
  try {
    await db.insert(logsNotifications).values({
      channel: "mail",
      type: row.type,
      recipient: row.recipient,
      subject: row.subject,
      status: row.status,
      errorMessage: row.errorMessage ?? null,
      practitionerId: row.practitionerId ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[notification-log] failed to persist:", msg);
  }
}

async function sendMail(to: string, subject: string, blocks: Block[], meta: SendMeta) {
  const html = buildMailHtml(blocks);
  try {
    await transporter.sendMail({ from: "Actidec <" + SMTP_FROM + ">", to, subject, html });
    await logNotification({ type: meta.type, recipient: to, subject, status: "sent", practitionerId: meta.practitionerId });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await logNotification({ type: meta.type, recipient: to, subject, status: "failed", errorMessage, practitionerId: meta.practitionerId });
    throw err;
  }
}

export async function sendAccountSetup(to: string, token: string) {
  await sendMail(to, "Actidec - Vous avez été invité à rejoindre la plateforme", [
    { type: "title", content: "Vous avez été invité à rejoindre Actidec" },
    { type: "text", content: "Un administrateur vous a invité sur la plateforme Actidec. Configurez votre mot de passe pour accéder à votre espace." },
    { type: "button", label: "Configurer mon compte", url: `${APP_URL}/setup-password?token=${token}`, icon: "arrow-right" },
    { type: "divider" },
    { type: "text", content: "Ce lien expire dans 24 heures. Si vous n'avez pas demandé ce compte, ignorez cet email.", muted: true },
  ], { type: "account_setup" });
}

export async function sendAccountDeleted(to: string) {
  await sendMail(to, "Actidec - Votre compte a été supprimé", [
    { type: "title", content: "Votre compte a été supprimé" },
    { type: "text", content: "Votre compte Actidec ainsi que toutes les données associées ont été définitivement supprimés, conformément à votre demande." },
    { type: "info", content: "Si vous n'êtes pas à l'origine de cette action, contactez-nous immédiatement." },
    { type: "divider" },
    { type: "text", content: "Nous sommes désolés de vous voir partir. Si vous changez d'avis, un administrateur pourra vous inviter à nouveau.", muted: true },
  ], { type: "account_deleted" });
}

export async function sendResetPassword(to: string, token: string) {
  await sendMail(to, "Actidec - Réinitialisation de mot de passe", [
    { type: "title", content: "Réinitialisation de mot de passe" },
    { type: "subtitle", content: "Une demande a été effectuée sur votre compte" },
    { type: "text", content: "Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe." },
    { type: "button", label: "Réinitialiser mon mot de passe", url: `${APP_URL}/reset-password?token=${token}`, icon: "lock" },
    { type: "divider" },
    { type: "text", content: "Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.", muted: true },
  ], { type: "password_reset" });
}

export async function sendTreasuryAlert(to: string, data: {
  accountName: string;
  currentBalance: string;
  threshold: string;
}, practitionerId?: string) {
  await sendMail(to, "Actidec - Alerte trésorerie", [
    { type: "title", content: "Alerte trésorerie" },
    { type: "text", content: `Le solde de votre compte « ${data.accountName} » est passé sous votre seuil d'alerte.` },
    { type: "list", items: [
      `Solde actuel : ${fmtCurrency(data.currentBalance)}`,
      `Seuil configuré : ${fmtCurrency(data.threshold)}`,
    ]},
    { type: "button", label: "Voir mes transactions", url: `${APP_URL}/transactions`, icon: "arrow-right" },
    { type: "divider" },
    { type: "text", content: "Vous recevez cet email car vous avez configuré une alerte de trésorerie sur Actidec. Vous ne serez pas notifié à nouveau avant 7 jours.", muted: true },
  ], { type: "treasury_alert", practitionerId });
}

export async function sendRejectionAlert(to: string, data: {
  firstName: string;
  rejectionRate: number;
  threshold: number;
  rejectedCount: number;
  totalCount: number;
  periodDays: number;
}, practitionerId?: string) {
  const fmtPct = (n: number) => `${(n * 100).toFixed(1)} %`;
  await sendMail(to, "Actidec - Taux de rejet élevé", [
    { type: "title", content: "Taux de rejet élevé" },
    { type: "subtitle", content: `Bonjour ${data.firstName}` },
    { type: "text", content: `Votre taux de rejet bordereaux sur les ${data.periodDays} derniers jours a dépassé votre seuil d'alerte. Identifier les causes des rejets permet souvent de récupérer du chiffre d'affaires.` },
    { type: "list", items: [
      `Taux de rejet actuel : ${fmtPct(data.rejectionRate)}`,
      `Seuil configuré : ${fmtPct(data.threshold)}`,
      `Bordereaux rejetés : ${data.rejectedCount} sur ${data.totalCount}`,
    ]},
    { type: "button", label: "Voir ma facturation", url: `${APP_URL}/facturation`, icon: "arrow-right" },
    { type: "divider" },
    { type: "text", content: "Vous recevez cet email car vous avez activé l'alerte de taux de rejet sur Actidec. Vous ne serez pas notifié à nouveau avant 14 jours.", muted: true },
  ], { type: "rejection_alert", practitionerId });
}

function fmtCurrency(v: number | string): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(v));
}

function fmtVariation(current: number, previous: number): string | undefined {
  if (previous === 0) return undefined;
  const pct = ((current - previous) / previous) * 100;
  if (!Number.isFinite(pct)) return undefined;
  const sign = pct >= 0 ? "+" : "";
  const arrow = pct >= 0 ? "↑" : "↓";
  return `${arrow} ${sign}${pct.toFixed(0)}% vs période précédente`;
}

export type MonthlyRecapData = {
  firstName: string;
  periodLabel: string;
  isQuarterly: boolean;
  ca?: number;
  caPrev?: number;
  totalBalance?: number;
  cotisationsPaid?: number;
  professionalExpenses?: number;
  bordereaux?: { count: number; rejectedCount: number; totalAmount: number };
  underThresholdAccounts?: string[];
  staleAccountsCount?: number;
};

export async function sendMonthlyRecap(to: string, data: MonthlyRecapData, practitionerId?: string) {
  const kind = data.isQuarterly ? "trimestriel" : "mensuel";
  const blocks: Block[] = [
    { type: "title", content: `Récap ${kind} — ${data.periodLabel}` },
    { type: "subtitle", content: `Bonjour ${data.firstName}` },
    { type: "text", content: `Voici la synthèse de votre activité ${data.isQuarterly ? "trimestrielle" : "mensuelle"}.` },
  ];

  // ── Bloc activité ──
  const activityStats: Block[] = [];
  if (data.ca !== undefined) {
    const variation = data.caPrev !== undefined ? fmtVariation(data.ca, data.caPrev) : undefined;
    activityStats.push({
      type: "stat",
      label: "Chiffre d'affaires",
      value: fmtCurrency(data.ca),
      sublabel: variation,
    });
  }
  if (data.totalBalance !== undefined) {
    activityStats.push({
      type: "stat",
      label: "Solde des comptes",
      value: fmtCurrency(data.totalBalance),
    });
  }
  if (activityStats.length > 0) {
    blocks.push({ type: "sectionTitle", content: "Activité" }, ...activityStats);
  }

  // ── Bloc charges ──
  const chargeStats: Block[] = [];
  if (data.cotisationsPaid !== undefined && data.cotisationsPaid > 0) {
    chargeStats.push({
      type: "stat",
      label: "Cotisations payées",
      value: fmtCurrency(data.cotisationsPaid),
      sublabel: "URSSAF + CARPIMKO",
    });
  }
  if (data.professionalExpenses !== undefined && data.professionalExpenses > 0) {
    chargeStats.push({
      type: "stat",
      label: "Frais professionnels",
      value: fmtCurrency(data.professionalExpenses),
    });
  }
  if (chargeStats.length > 0) {
    blocks.push({ type: "sectionTitle", content: "Charges" }, ...chargeStats);
  }

  // ── Bordereaux ──
  if (data.bordereaux && data.bordereaux.count > 0) {
    blocks.push({ type: "sectionTitle", content: "Bordereaux" });
    const items = [
      `${data.bordereaux.count} passage${data.bordereaux.count > 1 ? "s" : ""} encaissé${data.bordereaux.count > 1 ? "s" : ""} — ${fmtCurrency(data.bordereaux.totalAmount)}`,
    ];
    if (data.bordereaux.rejectedCount > 0) {
      items.push(`${data.bordereaux.rejectedCount} passage${data.bordereaux.rejectedCount > 1 ? "s" : ""} rejeté${data.bordereaux.rejectedCount > 1 ? "s" : ""} à traiter`);
    }
    blocks.push({ type: "list", items });
  }

  // ── Alertes ──
  if (data.underThresholdAccounts && data.underThresholdAccounts.length > 0) {
    blocks.push(
      { type: "sectionTitle", content: "À surveiller" },
      {
        type: "info",
        content: `Compte${data.underThresholdAccounts.length > 1 ? "s" : ""} sous seuil d'alerte : ${data.underThresholdAccounts.join(", ")}.`,
      },
    );
  }

  // ── Comptes pas à jour ──
  if (data.staleAccountsCount && data.staleAccountsCount > 0) {
    blocks.push({
      type: "info",
      content: `${data.staleAccountsCount} compte${data.staleAccountsCount > 1 ? "s" : ""} bancaire${data.staleAccountsCount > 1 ? "s" : ""} non synchronisé${data.staleAccountsCount > 1 ? "s" : ""} depuis plus de 15 jours. Pensez à reconnecter votre banque.`,
    });
  }

  blocks.push(
    { type: "divider" },
    { type: "button", label: "Voir le détail", url: `${APP_URL}/dashboard`, icon: "arrow-right" },
    { type: "text", content: "Vous pouvez modifier la fréquence ou désactiver ces récapitulatifs depuis votre profil.", muted: true },
  );

  await sendMail(to, `Actidec — Récap ${kind} ${data.periodLabel}`, blocks, { type: "monthly_recap", practitionerId });
}

export type DeadlineEvent = {
  dayLabel: string; // "Mardi 19 mai"
  label: string;    // "URSSAF", "CARPIMKO", "Date limite déclaration 2035", …
};

export type DeadlinesReminderData = {
  firstName: string;
  periodLabel: string; // "Du 18 mai au 1er juin 2026"
  weekGroups: Array<{
    weekLabel: string; // "Semaine du 18 mai"
    events: DeadlineEvent[];
  }>;
};

export async function sendDeadlinesReminder(to: string, data: DeadlinesReminderData, practitionerId?: string) {
  const blocks: Block[] = [
    { type: "title", content: "Vos échéances à venir" },
    { type: "subtitle", content: data.periodLabel },
    { type: "text", content: `Bonjour ${data.firstName}, voici les échéances prévues sur les 2 prochaines semaines.` },
  ];

  for (const group of data.weekGroups) {
    blocks.push(
      { type: "sectionTitle", content: group.weekLabel },
      { type: "list", items: group.events.map((e) => `${e.dayLabel} — ${e.label}`) },
    );
  }

  blocks.push(
    { type: "divider" },
    { type: "button", label: "Voir mon calendrier", url: `${APP_URL}/deadlines`, icon: "arrow-right" },
    { type: "text", content: "Vous pouvez désactiver ces rappels depuis votre profil.", muted: true },
  );

  await sendMail(to, "Actidec — Vos échéances à venir", blocks, { type: "deadlines_reminder", practitionerId });
}
