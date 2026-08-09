"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { initialSyncAction } from "@/actions/bridge";
import { consumeBankConnectFromOnboarding } from "@/lib/bank-connect-context";

function BridgeCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [closable, setClosable] = useState(false);

  useEffect(() => {
    // Lancé depuis l'onboarding : on est dans un onglet secondaire, l'app est restée
    // ouverte derrière et détecte la connexion par polling. Pas de redirection ici.
    const fromOnboarding = consumeBankConnectFromOnboarding();

    async function sync() {
      // Bridge redirige avec success=false si l'utilisateur annule
      if (searchParams.get("success") === "false") {
        setError("Connexion bancaire annulée.");
        return;
      }

      const itemIdParam = searchParams.get("item_id");
      const itemId = itemIdParam ? Number(itemIdParam) : undefined;

      const result = await initialSyncAction(itemId);

      if (result.alreadySynced || result.success) {
        if (fromOnboarding) {
          setClosable(true);
          // Onglet ouvert par window.open : sa fermeture par script est autorisée.
          // Si le navigateur la refuse, le message affiché prend le relais.
          window.close();
          return;
        }

        router.replace("/transactions?toast=bank-connected");
        return;
      }

      if (result.error) {
        setError(result.error);
      }
    }

    sync();
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => router.replace("/dashboard")}
            className="text-sm text-violet-600 underline"
          >
            Retour au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  if (closable) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100 text-green-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
          <p className="font-medium text-ardoise-900">Banque connectée</p>
          <p className="text-sm text-ardoise-500">
            Vous pouvez refermer cet onglet et reprendre votre inscription.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-ardoise-200 border-t-violet-600" />
        <p className="text-ardoise-600">Synchronisation de vos comptes bancaires...</p>
      </div>
    </div>
  );
}

export default function BridgeCallbackPage() {
  return (
    <Suspense>
      <BridgeCallback />
    </Suspense>
  );
}
