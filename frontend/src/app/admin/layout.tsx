import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { dbReady } from "@/lib/db";
import { UserProvider } from "@/providers/user-provider";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await dbReady;

  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.accountType !== "admin") {
    redirect("/dashboard");
  }

  return (
    <UserProvider user={session}>
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 p-4 md:p-6 lg:mt-6 lg:mx-auto lg:p-8 w-full max-w-7xl"><PageTransition>{children}</PageTransition></main>
      </div>
    </UserProvider>
  );
}
