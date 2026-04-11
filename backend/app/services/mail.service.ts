import nodemailer from "nodemailer";
import { logger } from "../logger";
import { buildMailHtml } from "./mail.template";

function createTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    logger.warn("SMTP not configured — emails will be logged but not sent");
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

export function createMailService() {
  return {
    async sendResetPassword(to: string, resetToken: string) {
      const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:3001"}/reset-password?token=${resetToken}`;

      const html = buildMailHtml([
        { type: "title", content: "Reset your password" },
        { type: "text", content: "You requested a password reset. Click the button below to set a new password." },
        { type: "button", label: "Reset my password", url: resetUrl },
        { type: "divider" },
        { type: "text", content: "This link expires in 1 hour. If you didn't request this, you can ignore this email." },
      ]);

      await transporter.sendMail({
        from: process.env.SMTP_FROM || "noreply@nova-fintech.com",
        to,
        subject: "Reset your password",
        html,
      });

      logger.info({ to }, "Reset password email sent");
    },

    async sendEmailVerification(to: string, code: string) {
      const html = buildMailHtml([
        { type: "title", content: "Verify your email" },
        { type: "text", content: "Use the code below to verify your email address:" },
        { type: "title", content: code },
        { type: "divider" },
        { type: "text", content: "This code expires in 15 minutes. If you didn't create an account, you can ignore this email." },
      ]);

      await transporter.sendMail({
        from: process.env.SMTP_FROM || "noreply@nova-fintech.com",
        to,
        subject: "Verify your email",
        html,
      });

      logger.info({ to }, "Email verification code sent");
    },

    async sendWelcome(to: string, tempPassword: string) {
      const loginUrl = `${process.env.FRONTEND_URL || "http://localhost:3001"}/login`;

      const html = buildMailHtml([
        { type: "title", content: "Bienvenue sur Nova" },
        { type: "text", content: "Votre compte a ete cree. Voici vos identifiants de connexion :" },
        { type: "text", content: `Email : ${to}` },
        { type: "text", content: `Mot de passe temporaire : ${tempPassword}` },
        { type: "button", label: "Se connecter", url: loginUrl },
        { type: "divider" },
        { type: "text", content: "Vous devrez changer votre mot de passe lors de votre premiere connexion." },
      ]);

      await transporter.sendMail({
        from: process.env.SMTP_FROM || "noreply@nova-fintech.com",
        to,
        subject: "Bienvenue sur Nova - Vos identifiants",
        html,
      });

      logger.info({ to }, "Welcome email sent");
    },
  };
}

export type MailService = ReturnType<typeof createMailService>;