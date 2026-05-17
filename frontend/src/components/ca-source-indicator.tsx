"use client";

import type { EffectiveCASource } from "@/actions/effective-ca";

const FALLBACK_MESSAGES: Record<"bordereaux" | "transactions", string> = {
  // Source utilisée = transactions, source attendue = bordereaux
  transactions:
    "Estimation basée sur vos encaissements bancaires (catégories Honoraires + Rétrocession). Pour plus de précision, importez vos bordereaux Ozzen.",
  // Source utilisée = bordereaux, source attendue = transactions
  bordereaux:
    "Affichage basé sur vos bordereaux Ozzen — aucune transaction bancaire catégorisée Honoraires sur la période.",
};

export function CASourceIndicator({
  source,
  primary = "bordereaux",
}: {
  source: EffectiveCASource;
  primary?: "bordereaux" | "transactions";
}) {
  if (source === "none" || source === primary) return null;
  const message = FALLBACK_MESSAGES[source];
  return (
    <span className="relative group inline-flex items-center align-middle">
      <span className="w-4 h-4 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-[10px] font-bold cursor-help hover:bg-gray-200 hover:text-gray-600 transition-colors">
        i
      </span>
      <span className="absolute left-1/2 -translate-x-1/2 top-6 w-64 bg-gray-900 text-white text-xs rounded-lg px-3.5 py-3 hidden group-hover:block z-[9999] shadow-lg leading-relaxed text-left font-normal normal-case">
        {message}
      </span>
    </span>
  );
}
