"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";

interface User {
  id: string;
  email: string;
  accountType: string;
  isVerified: boolean;
  createdAt: Date;
  deletedAt: Date | null;
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  practitioner: "Praticien",
};

function StatusBadge({ user }: { user: User }) {
  if (user.deletedAt) {
    return <span className="inline-block rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600">Supprimé</span>;
  }
  if (user.isVerified) {
    return <span className="inline-block rounded-full bg-menthe-500/10 px-2.5 py-1 text-xs font-medium text-menthe-600">Actif</span>;
  }
  return <span className="inline-block rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600">En attente</span>;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 gap-3">
      <span className="text-sm text-ardoise-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-ardoise-900 text-right break-all">{value}</span>
    </div>
  );
}

export function UserTable({ users, emptyMessage }: { users: User[]; emptyMessage: string }) {
  const [selected, setSelected] = useState<User | null>(null);

  return (
    <>
      <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead>
            <tr className="border-b border-ardoise-200/50 text-left text-ardoise-500">
              <th className="px-4 md:px-6 py-4 font-medium">Email</th>
              <th className="px-4 md:px-6 py-4 font-medium">Statut</th>
              <th className="px-4 md:px-6 py-4 font-medium">Date de création</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                onClick={() => setSelected(user)}
                className="border-b border-ardoise-100/50 last:border-0 transition-colors hover:bg-white/40 cursor-pointer"
              >
                <td className="px-4 md:px-6 py-4 font-medium">{user.email}</td>
                <td className="px-4 md:px-6 py-4"><StatusBadge user={user} /></td>
                <td className="px-4 md:px-6 py-4 text-ardoise-500">
                  {new Date(user.createdAt).toLocaleDateString("fr-FR")}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 md:px-6 py-8 text-center text-ardoise-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="flex items-center justify-center w-11 h-11 rounded-full bg-ardoise-900 text-white text-sm font-bold uppercase shrink-0">
                {selected.email.slice(0, 2)}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-ardoise-900 truncate">{selected.email}</h3>
                <p className="text-xs text-ardoise-400">{ACCOUNT_TYPE_LABELS[selected.accountType] ?? selected.accountType}</p>
              </div>
            </div>

            <div className="divide-y divide-ardoise-100 border border-ardoise-200 rounded-lg px-4">
              <DetailRow label="Type de compte" value={ACCOUNT_TYPE_LABELS[selected.accountType] ?? selected.accountType} />
              <DetailRow label="Statut" value={<StatusBadge user={selected} />} />
              <DetailRow label="Inscription" value={new Date(selected.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} />
              {selected.deletedAt && (
                <DetailRow label="Suppression" value={new Date(selected.deletedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} />
              )}
              <DetailRow label="ID" value={<code className="text-xs text-ardoise-500">{selected.id}</code>} />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
