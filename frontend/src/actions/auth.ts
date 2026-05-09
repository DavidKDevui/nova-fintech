"use server";

import { redirect } from "next/navigation";
import * as authService from "@/lib/services/auth.service";
import { getSession, setSessionCookies, clearSessionCookies } from "@/lib/session";

export async function loginAction(_prevState: unknown, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email et mot de passe requis" };
  }

  let accountType: string;

  try {
    console.log(`[LOGIN] Tentative de connexion pour : ${email}`);
    const data = await authService.login(email, password);
    console.log(`[LOGIN] Connexion réussie pour : ${email}`);
    await setSessionCookies(data.accessToken, data.refreshToken);
    accountType = data.user.accountType;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[LOGIN] Échec pour ${email} :`, message);
    if (message === "Invalid credentials") {
      return { error: "Identifiants invalides" };
    }
    return { error: "Une erreur est survenue, veuillez réessayer plus tard" };
  }

  if (accountType === "admin") {
    redirect("/admin/users?toast=login");
  } else if (accountType === "practitioner") {
    redirect("/dashboard?toast=login");
  } else {
    redirect("/login");
  }
}

export async function logoutAction() {
  const session = await getSession();
  if (session) {
    await authService.logout(session.id);
  }
  await clearSessionCookies();
  redirect("/login?toast=logout");
}

export async function setupPasswordAction(_prevState: unknown, formData: FormData) {
  const token = formData.get("token") as string;
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm") as string;

  if (!token || !password) {
    return { error: "Token et mot de passe requis" };
  }

  if (password !== confirm) {
    return { error: "Les mots de passe ne correspondent pas" };
  }

  try {
    await authService.setupPassword(token, password);
    return { success: true };
  } catch {
    return { error: "Lien invalide ou expire" };
  }
}

export async function forgotPasswordAction(_prevState: unknown, formData: FormData) {
  const email = formData.get("email") as string;

  if (!email) {
    return { error: "Email requis" };
  }

  try {
    await authService.forgotPassword(email);
  } catch (error) {
    console.error("[FORGOT_PASSWORD] Échec :", error instanceof Error ? error.message : error);
    return { error: "Une erreur est survenue, veuillez réessayer plus tard" };
  }
  return { success: true };
}

export async function resetPasswordAction(_prevState: unknown, formData: FormData) {
  const token = formData.get("token") as string;
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm") as string;

  if (!token || !password) {
    return { error: "Token et mot de passe requis" };
  }

  if (password !== confirm) {
    return { error: "Les mots de passe ne correspondent pas" };
  }

  try {
    await authService.resetPassword(token, password);
    return { success: true };
  } catch {
    return { error: "Lien invalide ou expire" };
  }
}

export async function changePasswordAction(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) {
    return { error: "Session expirée, veuillez vous reconnecter" };
  }

  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "Tous les champs sont requis" };
  }

  if (newPassword !== confirmPassword) {
    return { error: "Les nouveaux mots de passe ne correspondent pas" };
  }

  try {
    await authService.changePassword(session.id, currentPassword, newPassword);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Invalid current password") {
      return { error: "Mot de passe actuel incorrect" };
    }
    if (message === "Same password") {
      return { error: "Le nouveau mot de passe doit être différent de l'ancien" };
    }
    // validatePassword errors are already in French
    return { error: message };
  }
}

export async function deleteAccountAction() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  await authService.deleteAccount(session.id);
  await clearSessionCookies();
  redirect("/login?toast=account-deleted");
}
