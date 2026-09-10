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
import { getPractitionerByUserId } from "@/lib/data/current-practitioner";
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

  // Mémoïsé par requête : les actions préchargées ci-dessous réutilisent cette lecture.
  const practitionerProfile = await getPractitionerByUserId(session.id);

  // La connexion bancaire fait partie de l'onboarding : un profil créé mais sans
  // compte bancaire synchronisé = parcours inachevé (onglet fermé en cours de route,
  // ou compte antérieur à l'ajout de cette étape). La modale reprend alors directement
  // à l'étape bancaire.
  const hasBankAccount = practitionerProfile
    ? await practitionerService.hasBankAccount(practitionerProfile.id)
    : false;

  // Hors production, la connexion bancaire n'est pas exigée : l'URL de retour
  // locale n'est pas autorisée chez Bridge, l'étape ne peut donc pas aboutir.
  // Un profil sans banque accède à l'app (bannière « connecter ma banque »
  // sur Transactions). En prod, comportement inchangé.
  const bankRequired = process.env.NODE_ENV === "production";
  const needsOnboarding = !practitionerProfile || (bankRequired && !hasBankAccount);

  // Précharge les données du DataProvider côté serveur, mais SANS `await` : on passe
  // la promesse au provider (client) qui la déroule en streaming. Le layout ne bloque
  // donc pas → la page (dashboard/…) rend et précharge EN PARALLÈLE au lieu d'attendre
  // le layout. Rien à précharger tant que le profil praticien n'existe pas (onboarding).
  // Le rejet éventuel est géré côté client (fallback fetch), pas de 500 ici.
  // Rien à précharger tant que l'onboarding n'est pas terminé : la modale couvre
  // l'app, ces données sont invisibles, et une promesse rejetée passée au client
  // pendant que la modale s'hydrate casserait son interactivité.
  const initialDataPromise = practitionerProfile && !needsOnboarding
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
            {needsOnboarding && (
              <OnboardingModal
                open
                startAtBank={!!practitionerProfile}
                initialFirstName={practitionerProfile?.firstName ?? ""}
              />
            )}
          </AssistantProvider>
        </DataProvider>
      </PractitionerProvider>
    </UserProvider>
  );
}
