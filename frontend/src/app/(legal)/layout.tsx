import Link from "next/link";
import { getSession } from "@/lib/session";
import { UserProvider } from "@/providers/user-provider";
import { PractitionerProvider } from "@/providers/practitioner-provider";
import { DataProvider } from "@/providers/data-provider";
import { Navbar } from "@/components/navbar";
import { Logo } from "@/components/logo";
import { dbReady } from "@/lib/db";
import * as practitionerService from "@/lib/services/practitioner.service";

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  // Si on est connecté en tant que praticien, on rend la vraie navbar de l'app.
  // Sinon (visiteur, admin, DB indisponible) on tombe sur un header minimal public.
  let session: Awaited<ReturnType<typeof getSession>> = null;
  try {
    await dbReady;
    session = await getSession();
  } catch {
    // DB indisponible : on bascule sur le header public.
  }

  const practitionerProfile = session?.accountType === "practitioner"
    ? await practitionerService.getByUserId(session.id).catch(() => null)
    : null;

  const showFullNavbar = !!session && session.accountType === "practitioner" && !!practitionerProfile;

  const inner = (
    <>
      <main className="app-content max-w-5xl mx-auto px-6 py-10">
        {children}
      </main>
      <footer className="border-t border-ardoise-200 bg-white/60 mt-12 py-6">
        <div className="max-w-5xl mx-auto px-6 text-xs text-ardoise-500 flex items-center justify-between flex-wrap gap-2">
          <span>Actidec — outil de gestion fiscale et comptable pour infirmiers libéraux.</span>
          <span>
            <Link href="/legal" className="hover:text-ardoise-900 transition-colors">Mentions légales</Link>
            <span className="mx-2">·</span>
            <Link href="/privacy" className="hover:text-ardoise-900 transition-colors">Confidentialité</Link>
          </span>
        </div>
      </footer>
    </>
  );

  if (showFullNavbar && session) {
    return (
      <UserProvider user={session}>
        <PractitionerProvider profile={practitionerProfile}>
          <DataProvider>
            <div className="flex h-screen flex-col">
              <Navbar />
              <div className="relative flex-1 overflow-y-auto">
                {inner}
              </div>
            </div>
          </DataProvider>
        </PractitionerProvider>
      </UserProvider>
    );
  }

  // Header minimal pour les visiteurs non connectés
  return (
    <div className="min-h-screen bg-ardoise-50">
      <header className="border-b border-ardoise-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="inline-flex">
            <Logo size="default" />
          </Link>
          <Link href="/login" className="text-sm font-medium text-ardoise-700 hover:text-ardoise-900 transition-colors">
            Se connecter
          </Link>
        </div>
      </header>
      {inner}
    </div>
  );
}
