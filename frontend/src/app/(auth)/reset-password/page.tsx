import { isResetTokenValid } from "@/lib/services/auth.service";
import { Logo } from "@/components/logo";
import Link from "next/link";
import { ResetPasswordForm } from "./form";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  if (!token || !(await isResetTokenValid(token))) {
    return (
      <div className="flex min-h-screen items-center justify-center px-8">
        <div className="w-full max-w-md">
          <div className="animate-fade-up">
            <Logo size="default" />
          </div>
          <div className="mt-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <h1 className="text-3xl font-bold text-ardoise-900">Lien expiré ou invalide</h1>
            <p className="mt-2 text-ardoise-500">
              Ce lien de réinitialisation n&apos;est plus valide. Veuillez en demander un nouveau.
            </p>
          </div>
          <div className="mt-8 animate-fade-up" style={{ animationDelay: "0.2s" }}>
            <Link
              href="/forgot-password"
              className="inline-flex w-full bg-ardoise-900 px-5 py-3.5 text-base font-medium text-white transition-all hover:bg-black active:scale-[0.98] items-center justify-center gap-2.5"
            >
              Demander un nouveau lien
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
