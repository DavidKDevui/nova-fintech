"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";

const messages: Record<string, { type: "success" | "info"; text: string }> = {
  login: { type: "success", text: "Connexion réussie" },
  logout: { type: "info", text: "Vous avez été déconnecté" },
  "setup-password": { type: "success", text: "Compte activé avec succès" },
  "reset-password": { type: "success", text: "Mot de passe réinitialisé" },
  "account-deleted": { type: "info", text: "Votre compte a été supprimé" },
};

export function ToastHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toastKey = searchParams.get("toast");

  useEffect(() => {
    if (!toastKey || !messages[toastKey]) return;

    const msg = messages[toastKey]!;
    if (msg.type === "success") {
      toast.success(msg.text);
    } else {
      toast.info(msg.text);
    }

    // Remove toast param from URL without reload
    const url = new URL(window.location.href);
    url.searchParams.delete("toast");
    router.replace(url.pathname + url.search, { scroll: false });
  }, [toastKey, router]);

  return null;
}
