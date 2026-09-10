"use client";

import Link from "next/link";

/**
 * Voile « donnée indisponible » posé sur une carte qui a besoin du compte
 * bancaire. `bankConnected` = la donnée est disponible (pas de voile).
 * `label` permet d'adapter l'appel à l'action : par défaut « Connecter ma
 * banque », mais quand la banque est connectée et qu'il manque seulement le
 * compte par défaut, l'action à proposer est « Choisir mon compte par défaut ».
 */
export function DataMissingOverlay({ bankConnected, label = "Connecter ma banque" }: { bankConnected: boolean; label?: string }) {
  if (bankConnected) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[6px] z-30">
      <Link
        href="/transactions"
        className="text-xs font-medium text-ardoise-500 hover:text-ardoise-900 border border-ardoise-200 rounded-md px-2.5 py-1 bg-white transition-colors"
      >
        {label}
      </Link>
    </div>
  );
}
