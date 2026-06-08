"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";

interface Practitioner {
  id: string;
  firstName: string;
  lastName: string;
  profession: string;
  taxRegime: string;
  activityStartDate: string;
  retrocessionType: string | null;
  retrocessionValue: string | null;
  urssafFrequency: string;
  pasFrequency: string;
  carpimkoFrequency: string;
  email: string;
  isVerified: boolean;
  deletedAt: Date | null;
  createdAt: Date;
}

const TAX_REGIME_LABELS: Record<string, string> = {
  bnc: "BNC",
  micro_bnc: "Micro-BNC",
};

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Mensuel",
  quarterly: "Trimestriel",
  semi_annual: "Semestriel",
};

const PROFESSION_LABELS: Record<string, string> = {
  nurse: "Infirmier(e)",
};

function StatusBadge({ p }: { p: Practitioner }) {
  if (p.deletedAt) {
    return <span className="inline-block rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600">Supprimé</span>;
  }
  if (p.isVerified) {
    return <span className="inline-block rounded-full bg-menthe-500/10 px-2.5 py-1 text-xs font-medium text-menthe-600">Actif</span>;
  }
  return <span className="inline-block rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600">En attente</span>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-ardoise-500">{label}</span>
      <span className="text-sm font-medium text-ardoise-900">{value}</span>
    </div>
  );
}

export function PractitionerTable({ practitioners }: { practitioners: Practitioner[] }) {
  const [selected, setSelected] = useState<Practitioner | null>(null);

  return (
    <>
      <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-ardoise-200/50 text-left text-ardoise-500">
              <th className="px-4 md:px-6 py-4 font-medium">Nom</th>
              <th className="px-4 md:px-6 py-4 font-medium">Email</th>
              <th className="px-4 md:px-6 py-4 font-medium">Régime fiscal</th>
              <th className="px-4 md:px-6 py-4 font-medium">Statut</th>
              <th className="px-4 md:px-6 py-4 font-medium">Inscription</th>
            </tr>
          </thead>
          <tbody>
            {practitioners.map((p) => (
              <tr
                key={p.id}
                onClick={() => setSelected(p)}
                className="border-b border-ardoise-100/50 last:border-0 transition-colors hover:bg-white/40 cursor-pointer"
              >
                <td className="px-4 md:px-6 py-4 font-medium whitespace-nowrap">{p.firstName} {p.lastName}</td>
                <td className="px-4 md:px-6 py-4 text-ardoise-500">{p.email}</td>
                <td className="px-4 md:px-6 py-4 text-ardoise-500">{TAX_REGIME_LABELS[p.taxRegime] ?? p.taxRegime}</td>
                <td className="px-4 md:px-6 py-4"><StatusBadge p={p} /></td>
                <td className="px-4 md:px-6 py-4 text-ardoise-500 whitespace-nowrap font-mono">
                  {new Date(p.createdAt).toLocaleDateString("fr-FR")}
                </td>
              </tr>
            ))}
            {practitioners.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 md:px-6 py-8 text-center text-ardoise-400">
                  Aucun praticien
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
              <div className="flex items-center justify-center w-11 h-11 rounded-full bg-ardoise-900 text-white text-sm font-bold">
                {(selected.firstName[0]! + selected.lastName[0]!).toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-bold text-ardoise-900">{selected.firstName} {selected.lastName}</h3>
                <p className="text-xs text-ardoise-400">{selected.email}</p>
              </div>
            </div>

            <div className="divide-y divide-ardoise-100 border border-ardoise-200 rounded-lg px-4">
              <DetailRow label="Profession" value={PROFESSION_LABELS[selected.profession] ?? selected.profession} />
              <DetailRow label="Régime fiscal" value={TAX_REGIME_LABELS[selected.taxRegime] ?? selected.taxRegime} />
              <DetailRow label="Rétrocession" value={selected.retrocessionValue ? `${selected.retrocessionValue} ${selected.retrocessionType === "percentage" ? "%" : "€"}` : "Aucune"} />
              <DetailRow label="Impôt sur le revenu (PAS)" value={FREQUENCY_LABELS[selected.pasFrequency] ?? selected.pasFrequency} />
              <DetailRow label="URSSAF" value={FREQUENCY_LABELS[selected.urssafFrequency] ?? selected.urssafFrequency} />
              <DetailRow label="CARPIMKO" value={FREQUENCY_LABELS[selected.carpimkoFrequency] ?? selected.carpimkoFrequency} />
              <DetailRow label="Début d'activité" value={new Date(selected.activityStartDate).toLocaleDateString("fr-FR")} />
              <DetailRow label="Inscription" value={new Date(selected.createdAt).toLocaleDateString("fr-FR")} />
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-ardoise-500">Statut</span>
                <StatusBadge p={selected} />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
