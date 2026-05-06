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
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="9" rx="1.5" fill="#3B82F6" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" fill="#93C5FD" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" fill="#60A5FA" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" fill="#BFDBFE" />
    </svg>,
  },
  {
    href: "/facturation",
    label: "Facturation",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="2" width="16" height="20" rx="2" fill="#14B8A6" />
      <rect x="4" y="2" width="16" height="6" rx="2" fill="#0D9488" />
      <rect x="7" y="10" width="6" height="1.5" rx="0.75" fill="#CCFBF1" />
      <rect x="7" y="13" width="10" height="1.5" rx="0.75" fill="#99F6E4" />
      <rect x="7" y="16" width="8" height="1.5" rx="0.75" fill="#CCFBF1" />
      <rect x="15" y="10" width="2" height="1.5" rx="0.75" fill="#F0FDFA" />
    </svg>,
  },
  {
    href: "/transactions",
    label: "Mes transactions",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="16" rx="3" fill="#F97316" />
      <rect x="2" y="4" width="20" height="5" rx="3" fill="#EC6C12" />
      <rect x="2" y="8" width="20" height="1" fill="#EC6C12" />
      <rect x="5" y="12" width="6" height="2" rx="1" fill="#FED7AA" />
      <rect x="5" y="16" width="4" height="1.5" rx="0.75" fill="#FFEDD5" />
      <rect x="11" y="16" width="4" height="1.5" rx="0.75" fill="#FFEDD5" />
      <circle cx="18" cy="13.5" r="2" fill="#FED7AA" />
      <circle cx="16" cy="13.5" r="2" fill="#F97316" opacity="0.8" />
    </svg>,
  },
  {
    href: "/deadlines",
    label: "Mes échéances",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="18" rx="2" fill="#A855F7" />
      <rect x="3" y="4" width="18" height="6" rx="2" fill="#7C3AED" />
      <rect x="7" y="2" width="2" height="4" rx="1" fill="#4C1D95" />
      <rect x="15" y="2" width="2" height="4" rx="1" fill="#4C1D95" />
      <rect x="7" y="13" width="3" height="2" rx="0.5" fill="#F3E8FF" />
      <rect x="12" y="13" width="3" height="2" rx="0.5" fill="#F3E8FF" />
      <rect x="7" y="17" width="3" height="2" rx="0.5" fill="#E9D5FF" />
      <rect x="12" y="17" width="3" height="2" rx="0.5" fill="#E9D5FF" />
    </svg>,
  },
];

const bottomNavItems = [
  {
    href: "/help",
    label: "Aide",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#6B7280" />
      <circle cx="12" cy="12" r="10" fill="#9CA3AF" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1" fill="white" />
    </svg>,
  },
];

const adminItems = [
  {
    href: "/admin/users",
    label: "Praticiens",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="7" r="4" fill="#3B82F6" />
      <path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" fill="#93C5FD" />
      <circle cx="17" cy="7" r="3" fill="#60A5FA" opacity="0.7" />
      <path d="M17 14a4 4 0 0 1 4 4v3h-4" fill="#BFDBFE" opacity="0.7" />
    </svg>,
  },
  {
    href: "/admin/practices",
    label: "Cabinets",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="8" width="18" height="13" rx="2" fill="#14B8A6" />
      <path d="M3 10a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2H3z" fill="#0D9488" />
      <path d="M12 3L4 8h16L12 3z" fill="#2DD4BF" />
      <rect x="9" y="14" width="6" height="7" rx="1" fill="#F0FDFA" />
    </svg>,
  },
  {
    href: "/admin/statements",
    label: "Bordereaux",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" fill="#F59E0B" />
      <path d="M14 2v6h6" fill="#FCD34D" />
      <line x1="8" y1="13" x2="16" y2="13" stroke="white" strokeWidth="1.5" />
      <line x1="8" y1="17" x2="13" y2="17" stroke="white" strokeWidth="1.5" />
    </svg>,
  },
  {
    href: "/admin/admins",
    label: "Administrateurs",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L4 5.5v5.5c0 5.5 3.5 9 8 11 4.5-2 8-5.5 8-11V5.5L12 2z" fill="#F97316" />
      <path d="M12 2L4 5.5v5.5c0 5.5 3.5 9 8 11V2z" fill="#EC6C12" />
      <path d="m9 12 2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
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

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}>
      <path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" />
    </svg>
  );
}

export function MobileHeader({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="lg:hidden flex items-center justify-between border-b border-white/40 bg-white/60 backdrop-blur-xl px-4 py-3">
      <Logo size="small" />
      <button onClick={onOpen} className="p-2 text-gray-600 hover:text-gray-900">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
      </button>
    </div>
  );
}

export function Sidebar() {
  const user = useUser();
  const hp = usePractitioner();
  const pathname = usePathname();
  const isAdmin = user.accountType === "admin";
  const displayName = hp?.firstName || user.email;
  const { pendingSuggestionsCount: pendingCount } = useData();
  const [showMenu, setShowMenu] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close mobile drawer on navigation
  useEffect(() => {
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
    `flex ${collapsed ? "flex-col items-center justify-center gap-1 py-2.5 mx-auto rounded-md" : "items-center gap-3 rounded-md px-3 py-2.5"} font-medium transition-all ${collapsed ? "text-[10px]" : "text-sm"} ${
      active
        ? "bg-gray-100 text-gray-900"
        : "text-gray-500 hover:bg-white/60 hover:text-gray-900"
    }`;

  const mobileNavLinkClass = (active: boolean) =>
    `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all ${
      active
        ? "bg-gray-100 text-gray-900"
        : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
    }`;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex flex-col border-r border-white/40 bg-white/60 backdrop-blur-xl overflow-y-auto transition-all duration-300 ${collapsed ? "w-[88px]" : "w-64"}`}>
        {/* Logo + collapse toggle */}
        <div className={`p-4 ${collapsed ? "flex justify-center" : "flex items-center justify-between px-6"}`}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <Logo size="small" />
              {isAdmin && <span className="text-[8px] font-bold uppercase tracking-widest bg-gray-900 text-white px-1 py-[1px] rounded-sm -ml-0.5">admin</span>}
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-all"
            title={collapsed ? "Ouvrir la sidebar" : "Replier la sidebar"}
          >
            <CollapseIcon collapsed={collapsed} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {!isAdmin && navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${navLinkClass(pathname === item.href)} relative`}
              title={collapsed ? item.label : undefined}
            >
              <span className={`shrink-0 transition-transform ${collapsed ? "scale-[1.35]" : ""}`}>{item.icon}</span>
              {collapsed ? <span className="truncate w-full text-center">{item.label}</span> : item.label}
              {item.href === "/dashboard" && pendingCount > 0 && (
                <span className={`flex items-center justify-center bg-brand-600 text-white text-[10px] font-bold rounded-full ${collapsed ? "absolute -top-0.5 -right-0.5 w-4 h-4" : "ml-auto w-5 h-5"}`}>
                  {pendingCount}
                </span>
              )}
              {item.href === "/transactions" && hp && !hp.bridgeUserUuid && (
                <span className={`flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full ${collapsed ? "absolute -top-0.5 -right-0.5 w-4 h-4" : "ml-auto w-5 h-5"}`}>
                  !
                </span>
              )}
            </Link>
          ))}
          {isAdmin && (
            <>
              {!collapsed && <p className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Admin</p>}
              {adminItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navLinkClass(pathname === item.href)}
                  title={collapsed ? item.label : undefined}
                >
                  <span className={`shrink-0 transition-transform ${collapsed ? "scale-[1.35]" : ""}`}>{item.icon}</span>
                  {collapsed ? <span className="truncate w-full text-center">{item.label}</span> : item.label}
                </Link>
              ))}
            </>
          )}
        </nav>

        {/* Bottom nav — Aide */}
        {!isAdmin && (
          <div className="px-3 pb-2">
            <div className="border-t border-white/40 pt-2">
              {bottomNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navLinkClass(pathname === item.href || pathname.startsWith(item.href + "/"))}
                  title={collapsed ? item.label : undefined}
                >
                  <span className={`shrink-0 transition-transform ${collapsed ? "scale-[1.35]" : ""}`}>{item.icon}</span>
                  {collapsed ? <span className="truncate w-full text-center">{item.label}</span> : item.label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* User card */}
        <div className="relative border-t border-white/40 p-3" ref={menuRef}>
          {showMenu && (
            <div className={`absolute bottom-full mb-2 bg-white border border-gray-200 py-1 animate-fade-up-fast ${collapsed ? "left-1 right-1" : "left-3 right-3"}`}>
              <Link
                href="/profile"
                onClick={() => setShowMenu(false)}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                {!collapsed && "Mon profil"}
              </Link>
              <button
                onClick={() => { setShowMenu(false); setShowLogout(true); }}
                className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                {!collapsed && "Déconnexion"}
              </button>
            </div>
          )}
          <button
            onClick={() => setShowMenu(!showMenu)}
            className={`flex w-full items-center ${collapsed ? "justify-center" : "gap-3"} rounded-md ${collapsed ? "px-0 py-2" : "px-3 py-2.5"} transition-all hover:bg-white/50`}
            title={collapsed ? displayName : undefined}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
              {hp ? (hp.firstName[0]! + hp.lastName[0]!).toUpperCase() : getInitials(user.email)}
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 text-left min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
                  <p className="text-xs text-gray-400">{user.accountType === "practitioner" ? "Praticien" : "Admin"}</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-400"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>
              </>
            )}
          </button>
        </div>
      </aside>

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
            {!isAdmin && navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={mobileNavLinkClass(pathname === item.href)}
              >
                <span>{item.icon}</span>
                {item.label}
                {item.href === "/dashboard" && pendingCount > 0 && (
                  <span className="ml-auto flex items-center justify-center w-5 h-5 bg-brand-600 text-white text-[10px] font-bold rounded-full">
                    {pendingCount}
                  </span>
                )}
                {item.href === "/transactions" && hp && !hp.bridgeUserUuid && (
                  <span className="ml-auto flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                    !
                  </span>
                )}
              </Link>
            ))}
            {isAdmin && (
              <>
                <p className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Admin</p>
                {adminItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={mobileNavLinkClass(pathname === item.href)}
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </>
            )}
          </nav>
          {!isAdmin && (
            <div className="px-3 pb-2">
              <div className="border-t border-gray-200 pt-2">
                {bottomNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={mobileNavLinkClass(pathname === item.href || pathname.startsWith(item.href + "/"))}
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div className="border-t border-gray-200 p-3">
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

      {/* Mobile header — rendered via layout */}
      <MobileHeader onOpen={() => setMobileOpen(true)} />

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
