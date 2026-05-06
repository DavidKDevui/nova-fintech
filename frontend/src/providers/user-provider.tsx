"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SessionUser } from "@/lib/session";

const UserContext = createContext<SessionUser | null>(null);

export function UserProvider({ user, children }: { user: SessionUser | null; children: ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useUser() {
  const user = useContext(UserContext);
  if (!user) throw new Error("useUser must be used within an authenticated layout");
  return user;
}

export function useOptionalUser() {
  return useContext(UserContext);
}
