"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { practitioners } from "@/lib/db/schema";

type Practitioner = typeof practitioners.$inferSelect;

const PractitionerContext = createContext<Practitioner | null>(null);

export function PractitionerProvider({
  profile,
  children,
}: {
  profile: Practitioner | null;
  children: ReactNode;
}) {
  return (
    <PractitionerContext.Provider value={profile}>
      {children}
    </PractitionerContext.Provider>
  );
}

export function usePractitioner() {
  return useContext(PractitionerContext);
}

export function useRequirePractitioner() {
  const profile = useContext(PractitionerContext);
  if (!profile) throw new Error("Practitioner profile required");
  return profile;
}
