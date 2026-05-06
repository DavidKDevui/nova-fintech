"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPasswordAction } from "@/actions/auth";
import { Logo } from "@/components/logo";

export default function ResetPasswordPage() {
  return <Suspense><ResetPasswordContent /></Suspense>;
}

function ResetPasswordContent() {
  const [state, action, pending] = useActionState(resetPasswordAction, null);
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  if (state?.success) {
    return (
      <div className="flex min-h-screen items-center justify-center px-8">
        <div className="w-full max-w-md">
          <div className="animate-fade-up">
            <Logo size="default" />
          </div>
          <div className="mt-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <h1 className="text-3xl font-bold text-gray-900">Mot de passe réinitialisé</h1>
            <p className="mt-2 text-gray-500">
              Votre mot de passe a été mis à jour avec succès.
            </p>
          </div>
          <div className="mt-8 animate-fade-up" style={{ animationDelay: "0.2s" }}>
            <Link
              href="/login"
              className="inline-flex w-full bg-gray-900 px-5 py-3.5 text-base font-medium text-white transition-all hover:bg-black active:scale-[0.98] items-center justify-center gap-2.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
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
          <h1 className="text-3xl font-bold text-gray-900">Nouveau mot de passe</h1>
          <p className="mt-2 text-gray-500">
            Choisissez un nouveau mot de passe pour votre compte.
          </p>
        </div>

        <form action={action} className="space-y-5">
          <input type="hidden" name="token" value={token} />
          <div className="animate-fade-up" style={{ animationDelay: "0.2s" }}>
            <div className="relative group">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-300 transition-colors group-focus-within:text-gray-900">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="Nouveau mot de passe"
                className="w-full border-b-2 border-gray-200 bg-transparent pl-8 pr-4 py-4 text-[0.9rem] transition-all placeholder:text-gray-400 placeholder:font-medium hover:border-gray-400 focus:border-gray-900 focus:outline-none"
              />
            </div>
          </div>
          <div className="animate-fade-up" style={{ animationDelay: "0.3s" }}>
            <div className="relative group">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-300 transition-colors group-focus-within:text-gray-900">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
              </div>
              <input
                id="confirm"
                name="confirm"
                type="password"
                required
                minLength={8}
                placeholder="Confirmer le mot de passe"
                className="w-full border-b-2 border-gray-200 bg-transparent pl-8 pr-4 py-4 text-[0.9rem] transition-all placeholder:text-gray-400 placeholder:font-medium hover:border-gray-400 focus:border-gray-900 focus:outline-none"
              />
            </div>
          </div>
          {state?.error && (
            <p className="bg-red-50 p-3 text-sm text-red-600">{state.error}</p>
          )}
          <div className="animate-fade-up" style={{ animationDelay: "0.4s" }}>
            <button
              type="submit"
              disabled={pending}
              className="w-full bg-gray-900 px-5 py-3.5 text-base font-medium text-white transition-all hover:bg-black active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
              {pending ? "En cours..." : "Réinitialiser"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
