"use client";

import Link from "next/link";

export function DataMissingOverlay({
  bankConnected,
  hasPassages,
}: {
  bankConnected: boolean;
  hasPassages: boolean;
}) {
  if (bankConnected && hasPassages) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px] z-10">
      {!bankConnected ? (
        <Link
          href="/transactions"
          className="text-xs font-medium text-gray-500 hover:text-gray-900 border border-gray-200 rounded-md px-2.5 py-1 bg-white transition-colors"
        >
          Connecter ma banque
        </Link>
      ) : (
        <span className="text-xs font-medium text-gray-500 border border-gray-200 rounded-md px-2.5 py-1 bg-white">
          Aucune donnée disponible
        </span>
      )}
    </div>
  );
}
