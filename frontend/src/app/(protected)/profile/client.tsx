"use client";

import { useState, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePractitioner } from "@/providers/practitioner-provider";
import { updateProfileAction } from "@/actions/profile";
import { deleteAccountAction } from "@/actions/auth";
import { Modal } from "@/components/modal";

const INPUT_CLASS = "w-full border-2 border-gray-200 bg-transparent px-4 py-3 text-[0.9rem] transition-all placeholder:text-gray-400 hover:border-gray-400 focus:border-gray-900 focus:outline-none";

const SELECT_CLASS = INPUT_CLASS + " appearance-none cursor-pointer";

const PROFESSIONS = [
  { value: "nurse", label: "Infirmier(e)" },
] as const;

const TAX_REGIMES = [
  { value: "micro_bnc", label: "Micro-BNC" },
  { value: "bnc", label: "BNC" },
] as const;

const URSSAF_FREQUENCIES = [
  { value: "monthly", label: "Mensuel (le 5 ou 20 de chaque mois)" },
  { value: "quarterly", label: "Trimestriel (5 fév, 5 mai, 5 août, 5 nov)" },
] as const;

const URSSAF_PAY_DAYS = [
  { value: "5", label: "Le 5 du mois" },
  { value: "20", label: "Le 20 du mois" },
] as const;

const PAS_FREQUENCIES = [
  { value: "monthly", label: "Mensuel (le 15 de chaque mois)" },
  { value: "quarterly", label: "Trimestriel (15 fév, 15 mai, 15 août, 15 nov)" },
] as const;

const CARPIMKO_FREQUENCIES = [
  { value: "monthly", label: "Mensuel (le 10, de janvier à octobre)" },
  { value: "semi_annual", label: "Semestriel (25 mars et 25 septembre)" },
] as const;

export function ProfileClient() {
  const hp = usePractitioner();

  const [firstName, setFirstName] = useState(hp?.firstName ?? "");
  const [lastName, setLastName] = useState(hp?.lastName ?? "");
  const [profession, setProfession] = useState(hp?.profession ?? "");
  const [activityStartDate, setActivityStartDate] = useState(hp?.activityStartDate ?? "");
  const [taxRegime, setTaxRegime] = useState(hp?.taxRegime ?? "");
  const [urssafFrequency, setUrssafFrequency] = useState<string>(hp?.urssafFrequency ?? "monthly");
  const [urssafPayDay, setUrssafPayDay] = useState<string>(hp?.urssafPayDay ?? "5");
  const [retrocessionType, setRetrocessionType] = useState<string>(hp?.retrocessionType ?? "percentage");
  const [retrocessionValue, setRetrocessionValue] = useState(hp?.retrocessionValue ?? "");
  const [pasFrequency, setPasFrequency] = useState<string>(hp?.pasFrequency ?? "monthly");
  const [pasRate, setPasRate] = useState<string>(hp?.pasRate ?? "0");
  const [carpimkoFrequency, setCarpimkoFrequency] = useState<string>(hp?.carpimkoFrequency ?? "monthly");

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const router = useRouter();
  const [state, action, pending] = useActionState(updateProfileAction, null);

  useEffect(() => {
    if (state?.success) {
      router.refresh();
    }
  }, [state?.success, router]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl md:text-2xl font-bold mb-6 md:mb-8">Mon profil</h1>

      <form action={action} className="space-y-8">
        {hp && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">Profil professionnel</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1.5">Prénom</label>
                  <input
                    type="text"
                    name="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Prénom"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1.5">Nom</label>
                  <input
                    type="text"
                    name="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Nom"
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1.5">Profession</label>
                <select
                  name="profession"
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {PROFESSIONS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1.5">Début d&apos;activité</label>
                <input
                  type="date"
                  name="activityStartDate"
                  value={activityStartDate}
                  onChange={(e) => setActivityStartDate(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1.5">Régime fiscal</label>
                <select
                  name="taxRegime"
                  value={taxRegime}
                  onChange={(e) => setTaxRegime(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {TAX_REGIMES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1.5">Rétrocession mensuelle</label>
                <div className="grid grid-cols-2 gap-4">
                  <select
                    name="retrocessionType"
                    value={retrocessionType}
                    onChange={(e) => setRetrocessionType(e.target.value)}
                    className={SELECT_CLASS}
                  >
                    <option value="percentage">Pourcentage (%)</option>
                    <option value="fixed">Montant fixe (€)</option>
                  </select>
                  <input
                    type="number"
                    name="retrocessionValue"
                    min="0"
                    max={retrocessionType === "percentage" ? "100" : undefined}
                    step="0.5"
                    value={retrocessionValue}
                    onChange={(e) => setRetrocessionValue(e.target.value)}
                    placeholder={retrocessionType === "percentage" ? "Ex : 12.5" : "Ex : 800"}
                    className={INPUT_CLASS}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-400">Laissez vide si vous êtes titulaire et ne rétrocédez à personne.</p>
              </div>
            </div>
          </section>
        )}

        {hp && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">Préférences de paiement</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1.5">Fréquence URSSAF</label>
                  <select
                    name="urssafFrequency"
                    value={urssafFrequency}
                    onChange={(e) => setUrssafFrequency(e.target.value)}
                    className={SELECT_CLASS}
                  >
                    {URSSAF_FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1.5">Jour de prélèvement URSSAF</label>
                  {urssafFrequency === "monthly" ? (
                    <select
                      name="urssafPayDay"
                      value={urssafPayDay}
                      onChange={(e) => setUrssafPayDay(e.target.value)}
                      className={SELECT_CLASS}
                    >
                      {URSSAF_PAY_DAYS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <input type="hidden" name="urssafPayDay" value={urssafPayDay} />
                      <p className="px-4 py-3 text-[0.9rem] text-gray-400 border-2 border-gray-100 bg-gray-50">Non applicable en trimestriel</p>
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1.5">Fréquence impôt sur le revenu (PAS)</label>
                  <select
                    name="pasFrequency"
                    value={pasFrequency}
                    onChange={(e) => setPasFrequency(e.target.value)}
                    className={SELECT_CLASS}
                  >
                    {PAS_FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1.5">Taux PAS (%)</label>
                  <input
                    type="number"
                    name="pasRate"
                    min="0"
                    max="100"
                    step="0.1"
                    value={pasRate}
                    onChange={(e) => setPasRate(e.target.value)}
                    placeholder="Ex : 12.5"
                    className={INPUT_CLASS}
                  />
                  <p className="mt-1 text-xs text-gray-400">Visible sur votre espace impots.gouv ou échéancier URSSAF.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1.5">Fréquence CARPIMKO</label>
                  <select
                    name="carpimkoFrequency"
                    value={carpimkoFrequency}
                    onChange={(e) => setCarpimkoFrequency(e.target.value)}
                    className={SELECT_CLASS}
                  >
                    {CARPIMKO_FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>
        )}

        {state?.error && (
          <p className="bg-red-50 p-3 text-sm text-red-600">{state.error}</p>
        )}
        {state?.success && (
          <p className="bg-green-50 p-3 text-sm text-green-600">Profil mis à jour avec succès.</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 bg-gray-900 px-5 py-3 text-sm font-medium text-white transition-all hover:bg-black active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
        >
          {pending ? "Enregistrement..." : "Enregistrer les modifications"}
        </button>
      </form>

      <section className="mt-12 border-t border-gray-200 pt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-red-500 mb-3">Zone de danger</h2>
        <p className="text-sm text-gray-500 mb-4">
          La suppression de votre compte est définitive. Toutes vos données seront perdues.
        </p>
        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          className="flex items-center gap-2 border-2 border-red-600 bg-red-600 rounded-lg px-5 py-2 text-sm font-medium text-white transition-all hover:bg-red-700 hover:border-red-700 active:scale-[0.98]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          Supprimer mon compte
        </button>
      </section>

      <Modal open={showDeleteModal} onClose={() => { setShowDeleteModal(false); setDeleteConfirm(""); }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900">Supprimer votre compte</h3>
        </div>
        <div className="space-y-3 text-sm text-gray-500">
          <p>Vous êtes sur le point de supprimer définitivement votre compte. Cette action est <strong className="text-red-600">irréversible</strong>.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Toutes vos données personnelles seront supprimées</li>
            <li>Votre historique de facturation sera perdu</li>
            <li>Vos liaisons avec les cabinets seront rompues</li>
            <li>Vous ne pourrez pas récupérer votre compte</li>
          </ul>
        </div>
        <div className="mt-5">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Tapez <strong className="text-red-600">supprimer</strong> pour confirmer
          </label>
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="supprimer"
            className="w-full border-2 border-gray-200 bg-transparent px-4 py-2.5 text-sm transition-all placeholder:text-gray-400 hover:border-gray-400 focus:border-red-500 focus:outline-none"
            autoComplete="off"
          />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={() => { setShowDeleteModal(false); setDeleteConfirm(""); }}
            className="border-2 border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
          >
            Annuler
          </button>
          <form action={deleteAccountAction}>
            <button
              type="submit"
              disabled={deleteConfirm !== "supprimer"}
              className="w-full border-2 border-red-600 bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-red-700 hover:border-red-700 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-red-600 disabled:hover:border-red-600"
            >
              Supprimer mon compte
            </button>
          </form>
        </div>
      </Modal>
    </div>
  );
}
