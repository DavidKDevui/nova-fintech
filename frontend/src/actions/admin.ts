"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import * as adminService from "@/lib/services/admin.service";
import * as practiceService from "@/lib/services/practice.service";


export async function createUserAction(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session || session.accountType !== "admin") {
    redirect("/login");
  }

  const email = formData.get("email") as string;
  const accountType = (formData.get("accountType") as string) || "practitioner";

  if (!email) {
    return { error: "Email requis" };
  }

  if (!["practitioner", "admin"].includes(accountType)) {
    return { error: "Type de compte invalide" };
  }

  try {
    const invitation = await adminService.inviteUser(email, accountType as "practitioner" | "admin");
    return { success: true, invitation: invitation! };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur lors de la création";
    return { error: message };
  }
}

export async function cancelInvitationAction(id: string) {
  const session = await getSession();
  if (!session || session.accountType !== "admin") {
    redirect("/login");
  }

  try {
    await adminService.cancelInvitation(id);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur lors de l'annulation";
    return { error: message };
  }
}

export async function createPracticeAction(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session || session.accountType !== "admin") {
    redirect("/login");
  }

  const name = formData.get("name") as string;
  const finess = formData.get("finess") as string;

  if (!name || !finess) {
    return { error: "Nom et FINESS requis" };
  }

  try {
    const practice = await practiceService.createPractice(name, finess);
    return { success: true, practice: practice! };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur lors de la création";
    if (message.includes("unique") || message.includes("duplicate")) {
      return { error: "Ce numéro FINESS existe déjà" };
    }
    return { error: message };
  }
}

export async function updatePracticeAction(id: string, name: string, finess: string) {
  const session = await getSession();
  if (!session || session.accountType !== "admin") {
    redirect("/login");
  }

  if (!name || !finess) {
    return { error: "Nom et FINESS requis" };
  }

  try {
    const practice = await practiceService.updatePractice(id, name, finess);
    return { success: true, practice: practice! };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur lors de la modification";
    if (message.includes("unique") || message.includes("duplicate")) {
      return { error: "Ce numéro FINESS existe déjà" };
    }
    return { error: message };
  }
}

export async function deletePracticeAction(id: string) {
  const session = await getSession();
  if (!session || session.accountType !== "admin") {
    redirect("/login");
  }

  try {
    await practiceService.deletePractice(id);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur lors de la suppression";
    return { error: message };
  }
}
