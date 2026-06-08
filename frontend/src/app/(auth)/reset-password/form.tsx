"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "@/actions/auth";
import { Button } from "@/components/button";
import { Logo } from "@/components/logo";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, null);

  if (state?.success) {
    return (
      <div className="flex min-h-screen items-center justify-center px-8">
        <div className="w-full max-w-md">
          <div className="animate-fade-up">
            <Logo size="default" />
          </div>
          <div className="mt-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <h1 className="text-3xl font-bold text-ardoise-900">Mot de passe réinitialisé</h1>
            <p className="mt-2 text-ardoise-500">
              Votre mot de passe a été mis à jour avec succès.
            </p>
          </div>
          <div className="mt-8 animate-fade-up" style={{ animationDelay: "0.2s" }}>
            <Link
              href="/login"
              className="inline-flex w-full bg-ardoise-900 px-5 py-3 rounded-md text-sm font-medium text-white transition-all hover:bg-black active:scale-[0.98] items-center justify-center gap-2.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              Se connecter
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-8">
      <div className="w-full max-w-md">
        <div className="animate-fade-up">
          <Logo size="default" />
        </div>

        <div className="mt-8 mb-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <h1 className="text-3xl font-bold text-ardoise-900">Nouveau mot de passe</h1>
          <p className="mt-2 text-ardoise-500">
            Choisissez un nouveau mot de passe pour votre compte.
          </p>
        </div>

        <form action={action} className="space-y-5">
          <input type="hidden" name="token" value={token} />
          <div className="animate-fade-up" style={{ animationDelay: "0.2s" }}>
            <label htmlFor="password" className="block text-sm font-medium text-ardoise-700 mb-1.5">Nouveau mot de passe</label>
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ardoise-300 transition-colors group-focus-within:text-ardoise-900">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="Nouveau mot de passe"
                className="w-full border border-ardoise-200 bg-transparent pl-10 pr-3 py-2 rounded-lg text-[0.9rem] transition-all placeholder:text-ardoise-400 placeholder:font-medium hover:border-ardoise-400 focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="animate-fade-up" style={{ animationDelay: "0.3s" }}>
            <label htmlFor="confirm" className="block text-sm font-medium text-ardoise-700 mb-1.5">Confirmer le mot de passe</label>
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ardoise-300 transition-colors group-focus-within:text-ardoise-900">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
              </div>
              <input
                id="confirm"
                name="confirm"
                type="password"
                required
                minLength={8}
                placeholder="Confirmer le mot de passe"
                className="w-full border border-ardoise-200 bg-transparent pl-10 pr-3 py-2 rounded-lg text-[0.9rem] transition-all placeholder:text-ardoise-400 placeholder:font-medium hover:border-ardoise-400 focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>
          {state?.error && (
            <p className="bg-red-50 p-3 text-sm text-red-600">{state.error}</p>
          )}
          <div className="animate-fade-up" style={{ animationDelay: "0.4s" }}>
            <Button
              variant="cta"
              type="submit"
              disabled={pending}
              className="w-full"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
              {pending ? "En cours..." : "Réinitialiser"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
