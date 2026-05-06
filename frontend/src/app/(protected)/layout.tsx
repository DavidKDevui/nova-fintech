import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { UserProvider } from "@/providers/user-provider";
import { PractitionerProvider } from "@/providers/practitioner-provider";
import { DataProvider } from "@/providers/data-provider";
import { Sidebar } from "@/components/sidebar";
import { OnboardingModal } from "@/components/onboarding-modal";
import { PageTransition } from "@/components/page-transition";
import * as practitionerService from "@/lib/services/practitioner.service";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await getSession();
  } catch {
    // DB down — show error instead of redirect loop
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Service indisponible</h1>
          <p className="text-sm text-gray-500">Veuillez réessayer dans quelques instants.</p>
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

  return (
    <UserProvider user={session}>
      <PractitionerProvider profile={practitionerProfile}>
        <DataProvider>
          <div className="flex h-screen flex-col lg:flex-row">
            <Sidebar />
            <main id="main-content" className="relative flex-1 overflow-y-auto p-4 md:p-6 lg:p-8"><PageTransition>{children}</PageTransition></main>
          </div>
          {needsOnboarding && <OnboardingModal open />}
        </DataProvider>
      </PractitionerProvider>
    </UserProvider>
  );
}
