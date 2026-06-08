"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import { useUser } from "@/providers/user-provider";
import { usePractitioner } from "@/providers/practitioner-provider";
import { useData } from "@/providers/data-provider";
import { Logo } from "@/components/logo";
import { Modal } from "@/components/modal";
import { Button } from "@/components/button";

const ICON_PROPS = { xmlns: "http://www.w3.org/2000/svg", width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: <svg {...ICON_PROPS}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  },
  {
    href: "/transactions",
    label: "Transactions",
    icon: <svg {...ICON_PROPS}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>,
  },
  {
    href: "/facturation",
    label: "Facturation",
    icon: <svg {...ICON_PROPS}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
  },
  {
    href: "/management",
    label: "Gestion",
    icon: <svg {...ICON_PROPS}><line x1="6" y1="20" x2="6" y2="14" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="10" /></svg>,
  },
  {
    href: "/deadlines",
    label: "Échéances",
    icon: <svg {...ICON_PROPS}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  },
  {
    href: "/optimization",
    label: "Optimisation",
    icon: <svg {...ICON_PROPS}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  },
];

const adminItems = [
  {
    href: "/admin/users",
    label: "Praticiens",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="7" r="4" fill="currentColor" opacity="0.6" />
      <path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" fill="currentColor" opacity="0.3" />
      <circle cx="17" cy="7" r="3" fill="currentColor" opacity="0.4" />
      <path d="M17 14a4 4 0 0 1 4 4v3h-4" fill="currentColor" opacity="0.2" />
    </svg>,
  },
  {
    href: "/admin/practices",
    label: "Cabinets",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="8" width="18" height="13" rx="2" fill="currentColor" opacity="0.4" />
      <path d="M3 10a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2H3z" fill="currentColor" opacity="0.55" />
      <path d="M12 3L4 8h16L12 3z" fill="currentColor" opacity="0.3" />
      <rect x="9" y="14" width="6" height="7" rx="1" fill="currentColor" opacity="0.15" />
    </svg>,
  },
  {
    href: "/admin/statements",
    label: "Bordereaux",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" fill="currentColor" opacity="0.45" />
      <path d="M14 2v6h6" fill="currentColor" opacity="0.25" />
      <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
      <line x1="8" y1="17" x2="13" y2="17" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
    </svg>,
  },
  {
    href: "/admin/admins",
    label: "Administrateurs",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L4 5.5v5.5c0 5.5 3.5 9 8 11 4.5-2 8-5.5 8-11V5.5L12 2z" fill="currentColor" opacity="0.45" />
      <path d="M12 2L4 5.5v5.5c0 5.5 3.5 9 8 11V2z" fill="currentColor" opacity="0.6" />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.2" />
    </svg>,
  },
];

function getInitials(email: string) {
  const name = email.split("@")[0] || "";
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function Navbar() {
  const user = useUser();
  const hp = usePractitioner();
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = user.accountType === "admin";
  const displayName = hp?.firstName || user.email;
  const { pendingSuggestionsCount: pendingCount, uncategorizedCount, defaultBankAccountMissing } = useData();
  const [showMenu, setShowMenu] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const items = isAdmin ? adminItems : navItems;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close drawer on route change
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  const navLinkClass = (active: boolean) =>
    `flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
      active
        ? "bg-white/15 text-white"
        : "text-white/70 hover:text-white hover:bg-white/5"
    }`;

  const mobileNavLinkClass = (active: boolean) =>
    `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all ${
      active
        ? "bg-ardoise-100 text-ardoise-900"
        : "text-ardoise-500 hover:bg-ardoise-100 hover:text-ardoise-900"
    }`;

  const badge = (href: string) => {
    if (href === "/dashboard" && pendingCount > 0) {
      return (
        <span className="flex items-center justify-center w-5 h-5 bg-brand-600 text-white text-[10px] font-bold rounded-full">
          {pendingCount}
        </span>
      );
    }
    if (href === "/transactions" && defaultBankAccountMissing) {
      return (
        <span className="flex items-center justify-center w-5 h-5 bg-alerte-500 text-white text-[10px] font-bold rounded-full">
          !
        </span>
      );
    }
    if (href === "/transactions" && uncategorizedCount > 0) {
      return (
        <span className="flex items-center justify-center w-4 h-4 bg-brand-600 text-white text-[8px] font-bold rounded-full">
          !
        </span>
      );
    }
    return null;
  };

  return (
    <>
      {/* Desktop navbar */}
      <nav className="hidden lg:block bg-violet-900 w-full">
        <div className="flex items-center justify-between h-[4.5rem] px-6 lg:px-8 mx-auto w-full max-w-7xl">
        {/* Left: logo + nav items */}
        <div className="flex items-center gap-5">
          <Link href="/dashboard" className="flex items-center gap-2.5 select-none">
            {/* Monogramme "A" — carré orange (charte page 14) */}
            {/* Monogramme "Ad" — A et d en encre, centrés horizontalement, le d déborde en bas (charte p.3/14) */}
            <span className="relative flex h-9 w-9 shrink-0 rounded-[10px] bg-brand-600">
              <span className="absolute left-1/2 -translate-x-1/2 top-[2px] text-[15px] font-extrabold leading-none text-ardoise-900">A</span>
              <span className="absolute left-1/2 -translate-x-1/2 -bottom-2.5 text-[15px] font-extrabold leading-none text-ardoise-900">d</span>
            </span>
            <span className="text-xl font-bold tracking-tight text-white">ActiDec</span>
            {isAdmin && <span className="text-[8px] font-bold uppercase tracking-widest bg-white/20 text-white px-1 py-[1px] rounded-sm">admin</span>}
          </Link>
          {/* Séparateur vertical (charte page 14) */}
          <span className="h-7 w-px bg-white/15" />
          <div className="flex items-center gap-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${navLinkClass(pathname === item.href || pathname.startsWith(item.href + "/"))} relative`}
              >
                <span className="shrink-0">{item.icon}</span>
                {item.label}
                {badge(item.href)}
              </Link>
            ))}
          </div>
        </div>

        {/* Right: profil + info + synchro (charte page 14) */}
        <div className="flex items-center gap-1">
          <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            title={displayName}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-ardoise-200 rounded-md py-1 shadow-lg animate-fade-up-fast z-50">
              {!isAdmin && (
                <Link
                  href="/profile"
                  onClick={() => setShowMenu(false)}
                  className="w-full px-4 py-2.5 text-left text-sm text-ardoise-700 hover:bg-ardoise-50 transition-colors flex items-center gap-2.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Mon profil
                </Link>
              )}
              <button
                onClick={() => { setShowMenu(false); setShowLogout(true); }}
                className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Déconnexion
              </button>
            </div>
          )}
          </div>
          <Link href="/help" title="Aide" className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </Link>
          <button type="button" onClick={() => router.refresh()} title="Actualiser les données" className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 4 21 10 15 10"/></svg>
          </button>
        </div>
        </div>
      </nav>

      {/* Mobile header */}
      <div className="lg:hidden flex items-center justify-between border-b border-white/40 bg-white/60 backdrop-blur-xl px-4 py-3">
        <Logo size="small" />
        <button onClick={() => setMobileOpen(true)} className="p-2 text-ardoise-600 hover:text-ardoise-900">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
        </button>
      </div>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-50 lg:hidden drawer-overlay ${mobileOpen ? "open" : ""}`}>
        <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
        <aside className="drawer-panel absolute left-0 top-0 bottom-0 w-72 flex flex-col bg-white/95 backdrop-blur-xl">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2">
              <Logo size="small" />
              {isAdmin && <span className="text-[8px] font-bold uppercase tracking-widest bg-ardoise-900 text-white px-1 py-[1px] rounded-sm -ml-0.5">admin</span>}
            </div>
            <button onClick={() => setMobileOpen(false)} className="p-2 text-ardoise-500 hover:text-ardoise-900">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          <nav className="flex-1 space-y-1 px-3">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={mobileNavLinkClass(pathname === item.href || pathname.startsWith(item.href + "/"))}
              >
                <span>{item.icon}</span>
                {item.label}
                {badge(item.href)}
              </Link>
            ))}
          </nav>
          <div className="border-t border-ardoise-200 p-3">
            {!isAdmin && (
              <Link
                href="/profile"
                onClick={() => setMobileOpen(false)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-ardoise-700 hover:bg-ardoise-50 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Mon profil
              </Link>
            )}
            <button
              onClick={() => { setMobileOpen(false); setShowLogout(true); }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Déconnexion
            </button>
          </div>
        </aside>
      </div>

      {/* Logout modal */}
      <Modal open={showLogout} onClose={() => setShowLogout(false)}>
        <h3 className="text-lg font-bold text-ardoise-900">Se déconnecter ?</h3>
        <p className="mt-2 text-sm text-ardoise-500">
          Vous allez être redirigé vers la page de connexion.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setShowLogout(false)} className="w-full">
            Annuler
          </Button>
          <form action={logoutAction}>
            <Button type="submit" variant="danger" className="w-full">
              Déconnexion
            </Button>
          </form>
        </div>
      </Modal>
    </>
  );
}
