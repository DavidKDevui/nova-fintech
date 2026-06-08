"use client";

import { useState } from "react";
import { updatePracticeAction, deletePracticeAction } from "@/actions/admin";
import { toast } from "sonner";

export interface Practice {
  id: string;
  name: string;
  finess: string | null;
  createdAt: Date;
}

export function PracticeTable({
  practices,
  onUpdate,
  onDelete,
}: {
  practices: Practice[];
  onUpdate: (practice: Practice) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editFiness, setEditFiness] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function startEdit(p: Practice) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditFiness(p.finess ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    setSaving(true);
    const result = await updatePracticeAction(id, editName.trim(), editFiness.trim());
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    onUpdate(result.practice!);
    setEditingId(null);
    toast.success("Cabinet mis a jour");
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const result = await deletePracticeAction(id);
    setDeletingId(null);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    onDelete(id);
    toast.success("Cabinet supprimé");
  }

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg overflow-x-auto">
      <table className="w-full text-sm min-w-[600px]">
        <thead>
          <tr className="border-b border-ardoise-200/50 text-left text-ardoise-500">
            <th className="px-4 md:px-6 py-4 font-medium">Nom</th>
            <th className="px-4 md:px-6 py-4 font-medium">FINESS</th>
            <th className="px-4 md:px-6 py-4 font-medium">Date d&apos;ajout</th>
            <th className="px-4 md:px-6 py-4 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {practices.map((practice) => (
            <tr key={practice.id} className="border-b border-ardoise-100/50 last:border-0 transition-colors hover:bg-white/40">
              {editingId === practice.id ? (
                <>
                  <td className="px-4 md:px-6 py-3">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full border border-ardoise-200/50 bg-white/50 px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </td>
                  <td className="px-4 md:px-6 py-3">
                    <input
                      type="text"
                      value={editFiness}
                      onChange={(e) => setEditFiness(e.target.value)}
                      maxLength={9}
                      className="w-full border border-ardoise-200/50 bg-white/50 px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </td>
                  <td className="px-4 md:px-6 py-4 text-ardoise-500 font-mono">
                    {new Date(practice.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 md:px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => saveEdit(practice.id)}
                        disabled={saving || !editName.trim() || !editFiness.trim()}
                        className="p-1.5 text-menthe-600 rounded-md hover:bg-menthe-50 hover:text-menthe-700 disabled:opacity-50 transition-all"
                        title="Enregistrer"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-1.5 text-ardoise-500 rounded-md hover:bg-ardoise-100 hover:text-ardoise-700 transition-all"
                        title="Annuler"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                      </button>
                    </div>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-4 md:px-6 py-4 font-medium">{practice.name}</td>
                  <td className="px-4 md:px-6 py-4 text-ardoise-500 font-mono">{practice.finess}</td>
                  <td className="px-4 md:px-6 py-4 text-ardoise-500 font-mono">
                    {new Date(practice.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 md:px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => startEdit(practice)}
                        className="p-1.5 text-ardoise-500 rounded-md hover:bg-ardoise-100 hover:text-ardoise-700 transition-all"
                        title="Modifier"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      </button>
                      <button
                        onClick={() => handleDelete(practice.id)}
                        disabled={deletingId === practice.id}
                        className="p-1.5 text-red-500 rounded-md hover:bg-red-50 hover:text-red-700 disabled:opacity-50 transition-all"
                        title="Supprimer"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </td>
                </>
              )}
            </tr>
          ))}
          {practices.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 md:px-6 py-8 text-center text-ardoise-400">
                Aucun cabinet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
