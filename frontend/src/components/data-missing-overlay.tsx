"use client";

import Link from "next/link";

export function DataMissingOverlay({ bankConnected }: { bankConnected: boolean }) {
  if (bankConnected) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[6px] z-30">
      <Link
        href="/transactions"
        className="text-xs font-medium text-ardoise-500 hover:text-ardoise-900 border border-ardoise-200 rounded-md px-2.5 py-1 bg-white transition-colors"
      >
        Connecter ma banque
      </Link>
    </div>
  );
}
