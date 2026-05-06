import { isTokenValid } from "@/lib/services/auth.service";
import { Logo } from "@/components/logo";
import Link from "next/link";
import { SetupPasswordForm } from "./form";

export default async function SetupPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  if (!token || !(await isTokenValid(token))) {
    return (
      <div className="flex min-h-screen items-center justify-center px-8">
        <div className="w-full max-w-md">
          <div className="animate-fade-up">
            <Logo size="default" />
          </div>
          <div className="mt-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <h1 className="text-3xl font-bold text-gray-900">Lien expiré ou invalide</h1>
            <p className="mt-2 text-gray-500">
              Cette invitation n&apos;existe plus ou a déjà été utilisée. Contactez votre administrateur pour en obtenir une nouvelle.
            </p>
          </div>
          <div className="mt-8 animate-fade-up" style={{ animationDelay: "0.2s" }}>
            <Link
              href="/login"
              className="inline-flex w-full bg-gray-900 px-5 py-3.5 text-base font-medium text-white transition-all hover:bg-black active:scale-[0.98] items-center justify-center gap-2.5"
            >
              Retour à la connexion
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <SetupPasswordForm token={token} />;
}
