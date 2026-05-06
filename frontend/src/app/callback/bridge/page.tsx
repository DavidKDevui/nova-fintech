"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { initialSyncAction } from "@/actions/bridge";

function BridgeCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
            className="text-sm text-blue-600 underline"
          >
            Retour au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
        <p className="text-gray-600">Synchronisation de vos comptes bancaires...</p>
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
