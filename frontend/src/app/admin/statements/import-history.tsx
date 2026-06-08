"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/button";
import { deleteImportAction } from "@/actions/bordereaux";

interface ImportRecord {
  id: string;
  practiceName: string;
  fileName: string;
  documentType: string;
  passageCount: number;
  totalAmount: string;
  createdAt: Date;
}

export function ImportHistory({ imports }: { imports: ImportRecord[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleDelete(importId: string) {
    setDeleting(importId);
    const result = await deleteImportAction(importId);

    if (result.error) {
      toast.error(result.error);
      setDeleting(null);
      setConfirmId(null);
      return;
    }

    toast.success("Import supprimé avec succès");
    setConfirmId(null);
    setDeleting(null);
    router.refresh();
  }

  if (imports.length === 0) return null;

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-4 md:p-6">
      <h2 className="text-sm font-medium text-ardoise-700 mb-4">
        Historique des imports
        <span className="ml-2 text-xs text-ardoise-400 font-mono">({imports.length})</span>
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ardoise-200/50 text-left text-ardoise-500">
              <th className="px-3 py-3 font-medium">Date</th>
              <th className="px-3 py-3 font-medium">Cabinet</th>
              <th className="px-3 py-3 font-medium">Fichier</th>
              <th className="px-3 py-3 font-medium">Type</th>
              <th className="px-3 py-3 font-medium text-right">Passages</th>
              <th className="px-3 py-3 font-medium text-right">Montant</th>
              <th className="px-3 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {imports.map((imp) => (
              <tr key={imp.id} className="border-b border-ardoise-100/50 last:border-0 hover:bg-white/40">
                <td className="px-3 py-3 text-ardoise-500 font-mono">
                  {new Date(imp.createdAt).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-3 py-3 text-ardoise-900">{imp.practiceName}</td>
                <td className="px-3 py-3 text-ardoise-500 max-w-[200px] truncate">{imp.fileName}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${imp.documentType === "noemie" ? "bg-menthe-100 text-menthe-700" : "bg-violet-100 text-violet-700"}`}>
                    {imp.documentType === "rattrapage" ? "Rattrapage" : imp.documentType === "noemie" ? "Retours Noemie" : imp.documentType}
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-medium font-mono">{imp.passageCount}</td>
                <td className="px-3 py-3 text-right font-medium font-mono">
                  {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(parseFloat(imp.totalAmount))}
                </td>
                <td className="px-3 py-3 text-right">
                  {confirmId === imp.id ? (
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="compact"
                        onClick={() => setConfirmId(null)}
                        disabled={deleting === imp.id}
                      >
                        Annuler
                      </Button>
                      <Button
                        variant="danger"
                        size="compact"
                        onClick={() => handleDelete(imp.id)}
                        disabled={deleting === imp.id}
                      >
                        {deleting === imp.id ? "..." : "Confirmer"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="danger"
                      size="compact"
                      onClick={() => setConfirmId(imp.id)}
                    >
                      Supprimer
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
