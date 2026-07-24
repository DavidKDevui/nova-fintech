import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { UserProvider } from "@/providers/user-provider";
import { PractitionerProvider } from "@/providers/practitioner-provider";
import { DataProvider } from "@/providers/data-provider";
import { AssistantProvider } from "@/providers/assistant-provider";
import { Navbar } from "@/components/navbar";
import { OnboardingModal } from "@/components/onboarding-modal";
import { PageTransition } from "@/components/page-transition";
import { dbReady } from "@/lib/db";
import * as practitionerService from "@/lib/services/practitioner.service";
import { preloadProtectedData } from "@/lib/data/preload-protected-data";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await dbReady;

  let session;
  try {
    session = await getSession();
  } catch {
    // DB down — show error instead of redirect loop
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-ardoise-900 mb-2">Service indisponible</h1>
          <p className="text-sm text-ardoise-500">Veuillez réessayer dans quelques instants.</p>
        </div>
      </div>
    );
  }

  if (!session) {
    redirect("/login");
  }

  if (session.accountType !== "practitioner") {
    redirect("/admin/users");
  }

  const practitionerProfile = await practitionerService.getByUserId(session.id);

  const needsOnboarding = !practitionerProfile;

  // Précharge les données du DataProvider côté serveur, mais SANS `await` : on passe
  // la promesse au provider (client) qui la déroule en streaming. Le layout ne bloque
  // donc pas → la page (dashboard/…) rend et précharge EN PARALLÈLE au lieu d'attendre
  // le layout. Rien à précharger tant que le profil praticien n'existe pas (onboarding).
  // Le rejet éventuel est géré côté client (fallback fetch), pas de 500 ici.
  const initialDataPromise = practitionerProfile
    ? preloadProtectedData(!!practitionerProfile.bridgeUserUuid)
    : null;

  return (
    <UserProvider user={session}>
      <PractitionerProvider profile={practitionerProfile}>
        <DataProvider initialDataPromise={initialDataPromise}>
          <AssistantProvider>
            <div className="flex h-screen flex-col lg:flex-row">
              <Navbar />
              <main id="main-content" className="app-content relative flex-1 overflow-y-auto p-4 md:p-6 lg:mt-3 lg:mx-auto lg:p-8 w-full max-w-[96rem]"><PageTransition>{children}</PageTransition></main>
            </div>
            {needsOnboarding && <OnboardingModal open />}
          </AssistantProvider>
        </DataProvider>
      </PractitionerProvider>
    </UserProvider>
  );
}
