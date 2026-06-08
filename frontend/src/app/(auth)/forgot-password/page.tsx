"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "@/actions/auth";
import { Button } from "@/components/button";
import { Logo } from "@/components/logo";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(forgotPasswordAction, null);

  if (state?.success) {
    return (
      <div className="flex min-h-screen items-center justify-center px-8">
        <div className="w-full max-w-md">
          <div className="animate-fade-up">
            <Logo size="default" />
          </div>
          <div className="mt-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <h1 className="text-3xl font-bold text-ardoise-900">Email envoyé</h1>
            <p className="mt-2 text-ardoise-500">
              Si cet email existe, un lien de réinitialisation a été envoyé. Vérifiez votre boîte de réception.
            </p>
          </div>
          <div className="mt-8 animate-fade-up" style={{ animationDelay: "0.2s" }}>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm text-ardoise-400 hover:text-ardoise-900 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
              Retour à la connexion
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
          <h1 className="text-3xl font-bold text-ardoise-900">Mot de passe oublié</h1>
          <p className="mt-2 text-ardoise-500">
            Entrez votre adresse email et nous vous enverrons un lien de réinitialisation.
          </p>
        </div>

        <form action={action} className="space-y-5">
          {state?.error && (
            <p className="bg-red-50 p-3 text-sm text-red-600">{state.error}</p>
          )}
          <div className="animate-fade-up" style={{ animationDelay: "0.2s" }}>
            <label htmlFor="email" className="block text-sm font-medium text-ardoise-700 mb-1.5">Adresse email</label>
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ardoise-300 transition-colors group-focus-within:text-ardoise-900">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              </div>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="Adresse email"
                className="w-full border border-ardoise-200 bg-transparent pl-10 pr-3 py-2 rounded-lg text-[0.9rem] transition-all placeholder:text-ardoise-400 placeholder:font-medium hover:border-ardoise-400 focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="animate-fade-up" style={{ animationDelay: "0.3s" }}>
            <Button
              variant="cta"
              type="submit"
              disabled={pending}
              className="w-full"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              {pending ? "Envoi..." : "Envoyer le lien"}
            </Button>
          </div>
          <p className="text-sm animate-fade-up" style={{ animationDelay: "0.4s" }}>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-ardoise-400 hover:text-ardoise-900 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
              Retour à la connexion
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
