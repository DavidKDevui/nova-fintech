"use client";

import { useState, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePractitioner } from "@/providers/practitioner-provider";
import { updateProfileAction } from "@/actions/profile";
import { changePasswordAction, deleteAccountAction, logoutAction } from "@/actions/auth";
import { Modal } from "@/components/modal";

const INPUT_CLASS = "w-full border border-gray-200 bg-transparent px-3 py-2 rounded-md text-[0.9rem] transition-all placeholder:text-gray-400 hover:border-gray-400 focus:border-gray-900 focus:outline-none";

const SELECT_CLASS = INPUT_CLASS + " appearance-none cursor-pointer";

const PROFESSIONS = [
  { value: "nurse", label: "Infirmier(e)" },
] as const;

const TAX_REGIMES = [
  { value: "micro_bnc", label: "Micro-BNC" },
  { value: "bnc", label: "BNC" },
] as const;

const URSSAF_FREQUENCIES = [
  { value: "monthly", label: "Mensuel" },
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
  { value: "monthly", label: "Mensuel (de janvier à octobre)" },
  { value: "semi_annual", label: "Semestriel" },
] as const;

const CARPIMKO_PAY_DAYS = [
  { value: "5", label: "Le 5 du mois" },
  { value: "10", label: "Le 10 du mois" },
  { value: "15", label: "Le 15 du mois" },
  { value: "20", label: "Le 20 du mois" },
  { value: "25", label: "Le 25 du mois" },
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
  const [hasRetrocession, setHasRetrocession] = useState(!!(hp?.retrocessionValue));
  const [retrocessionType, setRetrocessionType] = useState<string>(hp?.retrocessionType ?? "percentage");
  const [retrocessionValue, setRetrocessionValue] = useState(hp?.retrocessionValue ?? "");
  const [pasFrequency, setPasFrequency] = useState<string>(hp?.pasFrequency ?? "monthly");
  const [pasRate, setPasRate] = useState<string>(hp?.pasRate ?? "0");
  const [carpimkoFrequency, setCarpimkoFrequency] = useState<string>(hp?.carpimkoFrequency ?? "monthly");
  const [carpimkoPayDay, setCarpimkoPayDay] = useState<string>(hp?.carpimkoPayDay ?? "10");

  const [tab, setTab] = useState<"profile" | "payments" | "account">("profile");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const router = useRouter();
  const [state, action, pending] = useActionState(updateProfileAction, null);

  const hasChanges = hp ? (
    firstName !== (hp.firstName ?? "") ||
    lastName !== (hp.lastName ?? "") ||
    profession !== (hp.profession ?? "") ||
    activityStartDate !== (hp.activityStartDate ?? "") ||
    taxRegime !== (hp.taxRegime ?? "") ||
    urssafFrequency !== (hp.urssafFrequency ?? "monthly") ||
    urssafPayDay !== (hp.urssafPayDay ?? "5") ||
    hasRetrocession !== !!(hp.retrocessionValue) ||
    (hasRetrocession && retrocessionType !== (hp.retrocessionType ?? "percentage")) ||
    (hasRetrocession && retrocessionValue !== (hp.retrocessionValue ?? "")) ||
    pasFrequency !== (hp.pasFrequency ?? "monthly") ||
    pasRate !== (hp.pasRate ?? "0") ||
    carpimkoFrequency !== (hp.carpimkoFrequency ?? "monthly") ||
    carpimkoPayDay !== (hp.carpimkoPayDay ?? "10")
  ) : false;

  const retrocessionInvalid = hasRetrocession && (
    !retrocessionValue ||
    parseFloat(retrocessionValue) < 0 ||
    (retrocessionType === "percentage" && parseFloat(retrocessionValue) > 100)
  );
  const formValid = !retrocessionInvalid;

  useEffect(() => {
    if (state?.success) {
      router.refresh();
    }
  }, [state?.success, router]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl md:text-2xl font-bold mb-6 md:mb-8">Mon profil</h1>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-gray-100 mb-6">
        <button
          type="button"
          onClick={() => setTab("profile")}
          className={`px-1.5 pb-2.5 text-sm font-medium border-b-2 transition-all ${
            tab === "profile" ? "border-brand-600 text-brand-600" : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Profil professionnel
        </button>
        <button
          type="button"
          onClick={() => setTab("payments")}
          className={`px-1.5 pb-2.5 text-sm font-medium border-b-2 transition-all ${
            tab === "payments" ? "border-brand-600 text-brand-600" : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Préférences de paiement
        </button>
        <button
          type="button"
          onClick={() => setTab("account")}
          className={`px-1.5 pb-2.5 text-sm font-medium border-b-2 transition-all ${
            tab === "account" ? "border-brand-600 text-brand-600" : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Compte
        </button>
      </div>

      <form action={action} className="space-y-6">
        {/* Hidden fields for inactive tabs so all values are submitted */}
        {tab !== "profile" && hp && (
          <>
            <input type="hidden" name="firstName" value={firstName} />
            <input type="hidden" name="lastName" value={lastName} />
            <input type="hidden" name="profession" value={profession} />
            <input type="hidden" name="activityStartDate" value={activityStartDate} />
            <input type="hidden" name="taxRegime" value={taxRegime} />
            <input type="hidden" name="retrocessionType" value={hasRetrocession ? retrocessionType : ""} />
            <input type="hidden" name="retrocessionValue" value={hasRetrocession ? retrocessionValue : ""} />
          </>
        )}
        {tab !== "payments" && hp && (
          <>
            <input type="hidden" name="urssafFrequency" value={urssafFrequency} />
            <input type="hidden" name="urssafPayDay" value={urssafPayDay} />
            <input type="hidden" name="pasFrequency" value={pasFrequency} />
            <input type="hidden" name="pasRate" value={pasRate} />
            <input type="hidden" name="carpimkoFrequency" value={carpimkoFrequency} />
            <input type="hidden" name="carpimkoPayDay" value={carpimkoPayDay} />
          </>
        )}

        {/* Tab: Profil professionnel */}
        {tab === "profile" && hp && (
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
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  type="button"
                  role="switch"
                  aria-checked={hasRetrocession}
                  onClick={() => {
                    setHasRetrocession((v) => !v);
                    if (hasRetrocession) { setRetrocessionValue(""); }
                  }}
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${hasRetrocession ? "bg-brand-600" : "bg-gray-200"}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${hasRetrocession ? "translate-x-4" : "translate-x-0"}`} />
                </button>
                <span className="text-sm text-gray-500">Je verse une rétrocession mensuelle</span>
              </label>
              {hasRetrocession && (
                <div className="mt-3 grid grid-cols-2 gap-4">
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
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") { setRetrocessionValue(""); return; }
                      const n = parseFloat(v);
                      if (n < 0) return;
                      if (retrocessionType === "percentage" && n > 100) return;
                      setRetrocessionValue(v);
                    }}
                    placeholder={retrocessionType === "percentage" ? "Ex : 12.5" : "Ex : 800"}
                    className={INPUT_CLASS}
                  />
                </div>
              )}
              {!hasRetrocession && (
                <>
                  <input type="hidden" name="retrocessionType" value="" />
                  <input type="hidden" name="retrocessionValue" value="" />
                </>
              )}
            </div>
          </div>
        )}

        {/* Tab: Préférences de paiement */}
        {tab === "payments" && hp && (
          <div className="space-y-6">
            {/* URSSAF */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">URSSAF</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1.5">Fréquence</label>
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
                  <label className="block text-sm text-gray-500 mb-1.5">Jour de prélèvement</label>
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
                      <p className="px-3 py-2 rounded-md text-[0.9rem] text-gray-400 border border-gray-100 bg-gray-50">Non applicable en trimestriel</p>
                    </>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-400">Vous pouvez modifier la fréquence et le jour de<br />prélèvement depuis votre espace URSSAF.</p>
            </div>

            {/* Impôt sur le revenu (PAS) */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Impôt sur le revenu (PAS)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1.5">Fréquence</label>
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
                  <label className="block text-sm text-gray-500 mb-1.5">Taux (%)</label>
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
            </div>

            {/* CARPIMKO */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">CARPIMKO</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1.5">Fréquence</label>
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
                <div>
                  <label className="block text-sm text-gray-500 mb-1.5">Jour de prélèvement</label>
                  <select
                    name="carpimkoPayDay"
                    value={carpimkoPayDay}
                    onChange={(e) => setCarpimkoPayDay(e.target.value)}
                    className={SELECT_CLASS}
                  >
                    {CARPIMKO_PAY_DAYS.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab !== "account" && (
          <>
            {state?.error && (
              <p className="bg-red-50 p-3 text-sm text-red-600">{state.error}</p>
            )}
            {state?.success && (
              <p className="bg-green-50 p-3 text-sm text-green-600">Profil mis à jour avec succès.</p>
            )}

            <button
              type="submit"
              disabled={pending || !hasChanges || !formValid}
              className="flex items-center gap-2 bg-gray-900 px-5 py-3 rounded-md text-sm font-medium text-white transition-all hover:bg-black active:scale-[0.98] disabled:bg-gray-300 disabled:opacity-60 disabled:hover:bg-gray-300 disabled:active:scale-100 disabled:cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              {pending ? "Enregistrement..." : "Enregistrer les modifications"}
            </button>
          </>
        )}
      </form>

      {/* Tab: Compte */}
      {tab === "account" && (
        <div className="space-y-6">
          <ChangePasswordForm />

          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-medium text-gray-900 mb-1">Déconnexion</h3>
            <p className="text-sm text-gray-500 mb-3">
              Vous serez redirigé vers la page de connexion.
            </p>
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex items-center gap-2 border-2 border-gray-300 rounded-lg px-5 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-400 active:scale-[0.98]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Se déconnecter
              </button>
            </form>
          </div>

          <div className="border-t border-red-200 pt-6">
            <h3 className="text-sm font-medium text-red-600 mb-1">Zone de danger</h3>
            <p className="text-sm text-gray-500 mb-3">
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
          </div>
        </div>
      )}

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

// ── Sub-components ──

const PASSWORD_INPUT_CLASS = "w-full border border-gray-200 bg-transparent px-3 py-2 rounded-md text-[0.9rem] transition-all placeholder:text-gray-400 hover:border-gray-400 focus:border-gray-900 focus:outline-none";

function ChangePasswordForm() {
  const [pwState, pwAction, pwPending] = useActionState(changePasswordAction, null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasDigit = /[0-9]/.test(newPassword);
  const hasMinLength = newPassword.length >= 8;
  const isSecure = hasUpper && hasLower && hasDigit && hasMinLength;
  const sameAsOld = currentPassword.length > 0 && newPassword.length > 0 && currentPassword === newPassword;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit = currentPassword.length > 0 && isSecure && !sameAsOld && confirmPassword.length > 0 && !mismatch;

  useEffect(() => {
    if (pwState?.success) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear form fields on action success
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [pwState?.success]);

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-900 mb-1">Modifier le mot de passe</h3>
      <p className="text-sm text-gray-500 mb-4">
        Minimum 8 caractères, avec au moins une majuscule, une minuscule et un chiffre.
      </p>
      <form action={pwAction} className="space-y-3 max-w-sm">
        <div>
          <label className="block text-sm text-gray-500 mb-1.5">Mot de passe actuel</label>
          <input
            type="password"
            name="currentPassword"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className={PASSWORD_INPUT_CLASS}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-500 mb-1.5">Nouveau mot de passe</label>
          <input
            type="password"
            name="newPassword"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            className={PASSWORD_INPUT_CLASS}
          />
          {newPassword.length > 0 && (
            <div className="mt-2 space-y-1">
              <PasswordRule ok={hasMinLength} label="8 caractères minimum" />
              <PasswordRule ok={hasUpper} label="Une majuscule" />
              <PasswordRule ok={hasLower} label="Une minuscule" />
              <PasswordRule ok={hasDigit} label="Un chiffre" />
              {sameAsOld && (
                <p className="text-xs text-red-500">Le nouveau mot de passe doit être différent de l&apos;ancien</p>
              )}
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm text-gray-500 mb-1.5">Confirmer le nouveau mot de passe</label>
          <input
            type="password"
            name="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            className={PASSWORD_INPUT_CLASS}
          />
          {mismatch && (
            <p className="mt-1 text-xs text-red-500">Les mots de passe ne correspondent pas</p>
          )}
        </div>

        {pwState?.error && (
          <p className="bg-red-50 p-3 rounded-md text-sm text-red-600">{pwState.error}</p>
        )}
        {pwState?.success && (
          <p className="bg-green-50 p-3 rounded-md text-sm text-green-600">Mot de passe modifié avec succès.</p>
        )}

        <button
          type="submit"
          disabled={pwPending || !canSubmit}
          className="flex items-center gap-2 bg-gray-900 px-5 py-3 rounded-md text-sm font-medium text-white transition-all hover:bg-black active:scale-[0.98] disabled:bg-gray-300 disabled:opacity-60 disabled:hover:bg-gray-300 disabled:active:scale-100 disabled:cursor-not-allowed"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          {pwPending ? "Modification..." : "Modifier le mot de passe"}
        </button>
      </form>
    </div>
  );
}

function PasswordRule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {ok ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-500"><polyline points="20 6 9 17 4 12"/></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300"><circle cx="12" cy="12" r="10"/></svg>
      )}
      <span className={ok ? "text-green-600" : "text-gray-400"}>{label}</span>
    </div>
  );
}
