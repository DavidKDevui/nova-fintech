"use client";

import { useState } from "react";
import { connectBankAction } from "@/actions/bridge";

export function ConnectBankBanner() {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  async function handleConnectBank() {
    setConnecting(true);
    setError("");

    const result = await connectBankAction();

    if (result.error) {
      setError(result.error);
      setConnecting(false);
      return;
    }

    if (result.url) {
      window.location.href = result.url;
    }
  }

  return (
    <div className="bg-amber-50 border-none px-6 py-4 mb-6 rounded-lg">
      <div className="flex items-center gap-4">
        <div className="shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none">
            <defs><linearGradient id="bankGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#F59E0B"/><stop offset="100%" stopColor="#D97706"/></linearGradient></defs>
            <rect x="1" y="5" width="22" height="14" rx="2.5" fill="url(#bankGrad)"/>
            <rect x="3.5" y="8.5" width="6" height="4.5" rx="1" fill="#FEF3C7"/>
            <path d="M5 8.5v4.5M7.5 8.5v4.5M3.5 10.5h6" stroke="#92400E" strokeWidth="0.5" opacity="0.3"/>
            <rect x="12" y="15" width="5" height="1.2" rx="0.6" fill="white" opacity="0.3"/>
            <rect x="12" y="13" width="8" height="1.2" rx="0.6" fill="white" opacity="0.3"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="font-semibold text-amber-900">Connectez votre banque</h2>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-200 text-amber-800 rounded">Requis</span>
          </div>
          <p className="text-sm text-amber-700">
            Sans connexion bancaire, vos transactions et votre trésorerie ne sont pas suivies.
          </p>
          {error && (
            <p className="mt-2 bg-red-50 p-3 text-sm text-red-600">{error}</p>
          )}
        </div>
        <button
          onClick={handleConnectBank}
          disabled={connecting}
          className="shrink-0 flex items-center gap-1.5 bg-amber-600 px-3.5 py-1.5 text-xs font-medium text-white rounded-md transition-all hover:bg-amber-700 active:scale-[0.98] disabled:opacity-50"
        >
          {connecting ? "Connexion..." : "Connecter ma banque"}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </div>
    </div>
  );
}
