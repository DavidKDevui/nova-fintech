import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { UserProvider } from "@/providers/user-provider";
import { Sidebar } from "@/components/sidebar";
import { PageTransition } from "@/components/page-transition";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.accountType !== "admin") {
    redirect("/dashboard");
  }

  return (
    <UserProvider user={session}>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <Sidebar />
        <main className="flex-1 p-4 md:p-6 lg:p-8"><PageTransition>{children}</PageTransition></main>
      </div>
    </UserProvider>
  );
}
