"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/actions/auth";
import { Button } from "@/components/button";
import { Logo } from "@/components/logo";
import { LoginCarousel } from "./login-carousel";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null);

  return (
    <div className="flex min-h-screen">
      {/* Left — Form */}
      <div className="flex w-full lg:w-[55%] flex-col justify-center px-8 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-md">
          <div className="animate-fade-up">
            <Logo size="default" />
          </div>

          <div className="mt-8 mb-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <h1 className="text-3xl font-bold text-ardoise-900">Bon retour parmi nous</h1>
            <p className="mt-2 text-ardoise-500">
              Connectez-vous pour accéder à votre espace de trésorerie.
            </p>
          </div>

          <form action={action} className="space-y-5">
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
              <label htmlFor="password" className="block text-sm font-medium text-ardoise-700 mb-1.5">Mot de passe</label>
              <div className="relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ardoise-300 transition-colors group-focus-within:text-ardoise-900">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  placeholder="Mot de passe"
                  className="w-full border border-ardoise-200 bg-transparent pl-10 pr-3 py-2 rounded-lg text-[0.9rem] transition-all placeholder:text-ardoise-400 placeholder:font-medium hover:border-ardoise-400 focus:border-violet-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="animate-fade-up" style={{ animationDelay: "0.35s" }}>
              <label className="flex items-center gap-2.5 text-sm text-ardoise-500 select-none group has-[:checked]:text-ardoise-900">
                <input
                  type="checkbox"
                  name="rememberMe"
                  className="peer sr-only"
                />
                <span className="flex h-5 w-5 items-center justify-center border-2 border-ardoise-300 transition-all group-hover:border-ardoise-400 peer-checked:border-ardoise-900 peer-checked:bg-ardoise-900">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
                Rester connecté
              </label>
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
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                {pending ? "Connexion..." : "Se connecter"}
              </Button>
            </div>
            <p className="text-center text-sm text-ardoise-500 animate-fade-up" style={{ animationDelay: "0.5s" }}>
              <Link href="/forgot-password" className="text-ardoise-400 hover:text-ardoise-900 transition-colors">
                Mot de passe oublié ?
              </Link>
            </p>
          </form>

          <p className="mt-10 text-center text-xs text-ardoise-400 animate-fade-up" style={{ animationDelay: "0.6s" }}>
            <Link href="/legal" className="hover:text-ardoise-700 transition-colors">Mentions légales</Link>
            <span className="mx-2">·</span>
            <Link href="/privacy" className="hover:text-ardoise-700 transition-colors">Confidentialité</Link>
          </p>
        </div>
      </div>

      {/* Right — Carousel */}
      <div className="hidden lg:block relative w-[45%] p-6">
        <LoginCarousel />
      </div>
    </div>
  );
}
