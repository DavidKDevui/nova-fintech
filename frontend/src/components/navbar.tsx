"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import { useUser } from "@/providers/user-provider";
import { usePractitioner } from "@/providers/practitioner-provider";
import { useData } from "@/providers/data-provider";
import { Logo } from "@/components/logo";
import { Modal } from "@/components/modal";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="9" rx="1.5" fill="currentColor" opacity="0.6" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" fill="currentColor" opacity="0.3" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" fill="currentColor" opacity="0.45" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" fill="currentColor" opacity="0.2" />
    </svg>,
  },
  {
    href: "/transactions",
    label: "Transactions",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="16" rx="3" fill="currentColor" opacity="0.4" />
      <rect x="2" y="4" width="20" height="5" rx="3" fill="currentColor" opacity="0.6" />
      <rect x="5" y="12" width="6" height="2" rx="1" fill="currentColor" opacity="0.2" />
      <rect x="5" y="16" width="4" height="1.5" rx="0.75" fill="currentColor" opacity="0.15" />
      <rect x="11" y="16" width="4" height="1.5" rx="0.75" fill="currentColor" opacity="0.15" />
    </svg>,
  },
  {
    href: "/facturation",
    label: "Facturation",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="2" width="16" height="20" rx="2" fill="currentColor" opacity="0.3" />
      <rect x="4" y="2" width="16" height="6" rx="2" fill="currentColor" opacity="0.5" />
      <rect x="7" y="10" width="6" height="1.5" rx="0.75" fill="currentColor" opacity="0.2" />
      <rect x="7" y="13" width="10" height="1.5" rx="0.75" fill="currentColor" opacity="0.15" />
      <rect x="7" y="16" width="8" height="1.5" rx="0.75" fill="currentColor" opacity="0.2" />
    </svg>,
  },
  {
    href: "/management",
    label: "Gestion",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" opacity="0.3" />
      <rect x="6" y="6" width="5" height="5" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="13" y="6" width="5" height="5" rx="1" fill="currentColor" opacity="0.4" />
      <rect x="6" y="13" width="5" height="5" rx="1" fill="currentColor" opacity="0.4" />
      <rect x="13" y="13" width="5" height="5" rx="1" fill="currentColor" opacity="0.2" />
    </svg>,
  },
  {
    href: "/deadlines",
    label: "Échéances",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="18" rx="2" fill="currentColor" opacity="0.35" />
      <rect x="3" y="4" width="18" height="6" rx="2" fill="currentColor" opacity="0.55" />
      <rect x="7" y="2" width="2" height="4" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="15" y="2" width="2" height="4" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="7" y="13" width="3" height="2" rx="0.5" fill="currentColor" opacity="0.2" />
      <rect x="12" y="13" width="3" height="2" rx="0.5" fill="currentColor" opacity="0.2" />
    </svg>,
  },
  {
    href: "/optimization",
    label: "Optimisation",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M3 17l6-6 4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      <path d="M14 7h7v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
      <circle cx="9" cy="11" r="1.5" fill="currentColor" opacity="0.5" />
      <circle cx="13" cy="15" r="1.5" fill="currentColor" opacity="0.5" />
    </svg>,
  },
  {
    href: "/assistant",
    label: "Assistant",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.35" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <circle cx="9" cy="10" r="1.2" fill="currentColor" opacity="0.5" />
      <circle cx="15" cy="10" r="1.2" fill="currentColor" opacity="0.5" />
    </svg>,
  },
  {
    href: "/help",
    label: "Aide",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.4" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
      <circle cx="12" cy="16" r="1" fill="currentColor" opacity="0.2" />
    </svg>,
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
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.2" />
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
  const isAdmin = user.accountType === "admin";
  const displayName = hp?.firstName || user.email;
  const { pendingSuggestionsCount: pendingCount, uncategorizedCount } = useData();
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
    `flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all ${
      active
        ? "bg-white text-gray-900"
        : "text-white/60 hover:text-white"
    }`;

  const mobileNavLinkClass = (active: boolean) =>
    `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all ${
      active
        ? "bg-gray-100 text-gray-900"
        : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
    }`;

  const badge = (href: string) => {
    if (href === "/dashboard" && pendingCount > 0) {
      return (
        <span className="flex items-center justify-center w-5 h-5 bg-brand-600 text-white text-[10px] font-bold rounded-full">
          {pendingCount}
        </span>
      );
    }
    if (href === "/transactions" && hp && !hp.bridgeUserUuid) {
      return (
        <span className="flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full">
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
      <nav className="hidden lg:flex items-center justify-between bg-gradient-to-r from-[#1a1a1f] via-[#2a2a32] to-[#1a1a1f] px-6 h-[4.5rem] mt-4 mx-auto w-full max-w-7xl rounded-full">
        {/* Left: logo + nav items */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Logo size="small" variant="light" />
            {isAdmin && <span className="text-[8px] font-bold uppercase tracking-widest bg-white/20 text-white px-1 py-[1px] rounded-sm">admin</span>}
          </div>
          <div className="flex items-center gap-1 bg-white/10 rounded-full p-1">
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

        {/* Right: user menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-all hover:bg-white/10"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
              {hp ? (hp.firstName[0]! + hp.lastName[0]!).toUpperCase() : getInitials(user.email)}
            </div>
            <span className="text-sm font-medium text-white">{displayName}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/70"><path d="m6 9 6 6 6-6"/></svg>
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-gray-200 rounded-md py-1 shadow-lg animate-fade-up-fast z-50">
              {!isAdmin && (
                <Link
                  href="/profile"
                  onClick={() => setShowMenu(false)}
                  className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2.5"
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
      </nav>

      {/* Mobile header */}
      <div className="lg:hidden flex items-center justify-between border-b border-white/40 bg-white/60 backdrop-blur-xl px-4 py-3">
        <Logo size="small" />
        <button onClick={() => setMobileOpen(true)} className="p-2 text-gray-600 hover:text-gray-900">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
        </button>
      </div>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-50 lg:hidden drawer-overlay ${mobileOpen ? "open" : ""}`}>
        <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
        <aside className="drawer-panel absolute left-0 top-0 bottom-0 w-72 flex flex-col bg-white/95 backdrop-blur-xl">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2">
              <Logo size="small" />
              {isAdmin && <span className="text-[8px] font-bold uppercase tracking-widest bg-gray-900 text-white px-1 py-[1px] rounded-sm -ml-0.5">admin</span>}
            </div>
            <button onClick={() => setMobileOpen(false)} className="p-2 text-gray-500 hover:text-gray-900">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
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
          <div className="border-t border-gray-200 p-3">
            {!isAdmin && (
              <Link
                href="/profile"
                onClick={() => setMobileOpen(false)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-all"
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
        <h3 className="text-lg font-bold text-gray-900">Se déconnecter ?</h3>
        <p className="mt-2 text-sm text-gray-500">
          Vous allez être redirigé vers la page de connexion.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => setShowLogout(false)}
            className="border-2 border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
          >
            Annuler
          </button>
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full border-2 border-red-600 bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-red-700 hover:border-red-700 active:scale-[0.98]"
            >
              Déconnexion
            </button>
          </form>
        </div>
      </Modal>
    </>
  );
}
