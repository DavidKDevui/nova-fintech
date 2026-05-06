import nodemailer from "nodemailer";
import { type Block, buildMailHtml } from "../mail/template";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const SMTP_FROM = process.env.SMTP_FROM || "noreply@actidec.com";

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

async function sendMail(to: string, subject: string, blocks: Block[]) {
  const html = buildMailHtml(blocks);
  await transporter.sendMail({ from: "Actidec <" + SMTP_FROM + ">", to, subject, html });
}

export async function sendAccountSetup(to: string, token: string) {
  await sendMail(to, "Actidec - Vous avez été invité à rejoindre la plateforme", [
    { type: "title", content: "Vous avez été invité à rejoindre Actidec" },
    { type: "text", content: "Un administrateur vous a invité sur la plateforme Actidec. Configurez votre mot de passe pour accéder à votre espace." },
    { type: "button", label: "Configurer mon compte", url: `${APP_URL}/setup-password?token=${token}`, icon: "arrow-right" },
    { type: "divider" },
    { type: "text", content: "Ce lien expire dans 24 heures. Si vous n'avez pas demandé ce compte, ignorez cet email.", muted: true },
  ]);
}

export async function sendAccountDeleted(to: string) {
  await sendMail(to, "Actidec - Votre compte a été supprimé", [
    { type: "title", content: "Votre compte a été supprimé" },
    { type: "text", content: "Votre compte Actidec ainsi que toutes les données associées ont été définitivement supprimés, conformément à votre demande." },
    { type: "info", content: "Si vous n'êtes pas à l'origine de cette action, contactez-nous immédiatement." },
    { type: "divider" },
    { type: "text", content: "Nous sommes désolés de vous voir partir. Si vous changez d'avis, un administrateur pourra vous inviter à nouveau.", muted: true },
  ]);
}

export async function sendResetPassword(to: string, token: string) {
  await sendMail(to, "Actidec - Réinitialisation de mot de passe", [
    { type: "title", content: "Réinitialisation de mot de passe" },
    { type: "subtitle", content: "Une demande a été effectuée sur votre compte" },
    { type: "text", content: "Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe." },
    { type: "button", label: "Réinitialiser mon mot de passe", url: `${APP_URL}/reset-password?token=${token}`, icon: "lock" },
    { type: "divider" },
    { type: "text", content: "Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.", muted: true },
  ]);
}
