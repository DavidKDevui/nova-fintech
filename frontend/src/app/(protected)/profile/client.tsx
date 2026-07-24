"use client";

import { useState, useActionState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePractitioner } from "@/providers/practitioner-provider";
import { updateProfileAction, updateNotificationsAction } from "@/actions/profile";
import { changePasswordAction, deleteAccountAction, logoutAction } from "@/actions/auth";
import { exportMyDataAction } from "@/actions/data-export";
import { getBankAlertAction } from "@/actions/bank-alert";
import { Modal } from "@/components/modal";
import { Button } from "@/components/button";

const INPUT_CLASS = "w-full border border-ardoise-200 bg-transparent px-3 py-2 rounded-lg text-[0.9rem] transition-all placeholder:text-ardoise-400 hover:border-ardoise-400 focus:border-violet-500 focus:outline-none";

const SELECT_CLASS = INPUT_CLASS + " appearance-none cursor-pointer";

const PROFESSIONS = [
  { value: "nurse", label: "Infirmier(e)" },
] as const;

const PROFILE_TABS = ["profile", "payments", "notifications", "account"] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];

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
  const [daysPerWeekWorked, setDaysPerWeekWorked] = useState<number>(hp?.daysPerWeekWorked ?? 5);

  const searchParams = useSearchParams();
  // Onglet deep-linkable via ?tab= (utilisé par la recherche de la sidebar).
  const paramTab = searchParams.get("tab");
  const [tab, setTab] = useState<ProfileTab>(() =>
    PROFILE_TABS.includes(paramTab as ProfileTab) ? (paramTab as ProfileTab) : "profile",
  );
  // Resynchronise si ?tab= change (navigation douce) — ajustement en render, sans effet.
  const [prevParamTab, setPrevParamTab] = useState(paramTab);
  if (paramTab !== prevParamTab) {
    setPrevParamTab(paramTab);
    if (PROFILE_TABS.includes(paramTab as ProfileTab)) setTab(paramTab as ProfileTab);
  }
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [exportPending, setExportPending] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const router = useRouter();

  async function handleExportData() {
    setExportPending(true);
    setExportError(null);
    try {
      const result = await exportMyDataAction();
      if ("error" in result) {
        setExportError(result.error);
        return;
      }
      const blob = new Blob([JSON.stringify(result.payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Erreur réseau lors de l'export.");
    } finally {
      setExportPending(false);
    }
  }

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
    carpimkoPayDay !== (hp.carpimkoPayDay ?? "10") ||
    daysPerWeekWorked !== (hp.daysPerWeekWorked ?? 5)
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
      <div className="flex items-center gap-0 border-b border-ardoise-100 mb-6 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <button
          type="button"
          onClick={() => setTab("profile")}
          className={`px-1.5 pb-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap shrink-0 ${
            tab === "profile" ? "border-brand-600 text-brand-600" : "border-transparent text-ardoise-400 hover:text-ardoise-600"
          }`}
        >
          Profil professionnel
        </button>
        <button
          type="button"
          onClick={() => setTab("payments")}
          className={`px-1.5 pb-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap shrink-0 ${
            tab === "payments" ? "border-brand-600 text-brand-600" : "border-transparent text-ardoise-400 hover:text-ardoise-600"
          }`}
        >
          Préférences de paiement
        </button>
        <button
          type="button"
          onClick={() => setTab("notifications")}
          className={`px-1.5 pb-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap shrink-0 ${
            tab === "notifications" ? "border-brand-600 text-brand-600" : "border-transparent text-ardoise-400 hover:text-ardoise-600"
          }`}
        >
          Notifications
        </button>
        <button
          type="button"
          onClick={() => setTab("account")}
          className={`px-1.5 pb-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap shrink-0 ${
            tab === "account" ? "border-brand-600 text-brand-600" : "border-transparent text-ardoise-400 hover:text-ardoise-600"
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
            <input type="hidden" name="daysPerWeekWorked" value={daysPerWeekWorked} />
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
                <label className="block text-sm text-ardoise-500 mb-1.5">Prénom</label>
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
                <label className="block text-sm text-ardoise-500 mb-1.5">Nom</label>
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
              <label className="block text-sm text-ardoise-500 mb-1.5">Profession</label>
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
              <label className="block text-sm text-ardoise-500 mb-1.5">Début d&apos;activité</label>
              <input
                type="date"
                name="activityStartDate"
                value={activityStartDate}
                onChange={(e) => setActivityStartDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                className={INPUT_CLASS + " font-mono"}
              />
            </div>
            <div>
              <label className="block text-sm text-ardoise-500 mb-1.5">Régime fiscal</label>
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
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${hasRetrocession ? "bg-brand-600" : "bg-ardoise-200"}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${hasRetrocession ? "translate-x-4" : "translate-x-0"}`} />
                </button>
                <span className="text-sm text-ardoise-500">Je verse une rétrocession mensuelle</span>
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
                    className={INPUT_CLASS + " font-mono"}
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
            <div>
              <label className="block text-sm text-ardoise-500 mb-1.5">Jours travaillés par semaine</label>
              <select
                name="daysPerWeekWorked"
                value={daysPerWeekWorked}
                onChange={(e) => setDaysPerWeekWorked(parseInt(e.target.value, 10))}
                className={SELECT_CLASS}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>{n} jour{n > 1 ? "s" : ""} / semaine</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-ardoise-400">
                Sert au calcul du taux journalier et des projections de chiffre d&apos;affaires sur la page Gestion.
              </p>
            </div>
          </div>
        )}

        {/* Tab: Préférences de paiement */}
        {tab === "payments" && hp && (
          <div className="space-y-6">
            {/* URSSAF */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ardoise-400 mb-3">URSSAF</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-ardoise-500 mb-1.5">Fréquence</label>
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
                  <label className="block text-sm text-ardoise-500 mb-1.5">Jour de prélèvement</label>
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
                      <p className="px-3 py-2 rounded-lg text-[0.9rem] text-ardoise-400 border border-ardoise-100 bg-ardoise-50">Non applicable en trimestriel</p>
                    </>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-ardoise-400">Vous pouvez modifier la fréquence et le jour de<br />prélèvement depuis votre espace URSSAF.</p>
            </div>

            {/* Impôt sur le revenu (PAS) */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ardoise-400 mb-3">Impôt sur le revenu (PAS)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-ardoise-500 mb-1.5">Fréquence</label>
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
                  <label className="block text-sm text-ardoise-500 mb-1.5">Taux (%)</label>
                  <input
                    type="number"
                    name="pasRate"
                    min="0"
                    max="100"
                    step="0.1"
                    value={pasRate}
                    onChange={(e) => setPasRate(e.target.value)}
                    placeholder="Ex : 12.5"
                    className={INPUT_CLASS + " font-mono"}
                  />
                  <p className="mt-1 text-xs text-ardoise-400">Visible sur votre espace impots.gouv ou échéancier URSSAF.</p>
                </div>
              </div>
            </div>

            {/* CARPIMKO */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ardoise-400 mb-3">CARPIMKO</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-ardoise-500 mb-1.5">Fréquence</label>
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
                  <label className="block text-sm text-ardoise-500 mb-1.5">Jour de prélèvement</label>
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

        {(tab === "profile" || tab === "payments") && (
          <>
            {state?.error && (
              <p className="bg-red-50 p-3 text-sm text-red-600">{state.error}</p>
            )}
            {state?.success && (
              <p className="bg-menthe-50 p-3 text-sm text-menthe-600">Profil mis à jour avec succès.</p>
            )}

            <Button
              variant="cta"
              type="submit"
              disabled={pending || !hasChanges || !formValid}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              {pending ? "Enregistrement..." : "Enregistrer les modifications"}
            </Button>
          </>
        )}
      </form>

      {/* Tab: Notifications */}
      {tab === "notifications" && (
        <NotificationsForm />
      )}

      {/* Tab: Compte */}
      {tab === "account" && (
        <div className="space-y-6">
          <ChangePasswordSection />

          <div className="border-t border-ardoise-200 pt-6">
            <h3 className="text-sm font-medium text-ardoise-900 mb-1">Déconnexion</h3>
            <p className="text-sm text-ardoise-500 mb-3">
              Vous serez redirigé vers la page de connexion.
            </p>
            <form action={logoutAction}>
              <Button
                variant="danger"
                type="submit"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Se déconnecter
              </Button>
            </form>
          </div>

          <div className="border-t border-ardoise-200 pt-6">
            <h3 className="text-sm font-medium text-ardoise-900 mb-1">Exporter mes données</h3>
            <p className="text-sm text-ardoise-500 mb-3">
              Récupérez toutes les données personnelles qu&apos;Actidec traite à votre sujet, au format JSON (RGPD&nbsp;Art.&nbsp;20).
            </p>
            <Button
              variant="secondary"
              type="button"
              onClick={handleExportData}
              disabled={exportPending}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {exportPending ? "Génération en cours…" : "Télécharger mes données"}
            </Button>
            {exportError && (
              <p className="bg-red-50 mt-3 p-3 rounded-md text-sm text-red-600">{exportError}</p>
            )}
          </div>

          <div className="border-t border-red-200 pt-6">
            <h3 className="text-sm font-medium text-red-600 mb-1">Zone de danger</h3>
            <p className="text-sm text-ardoise-500 mb-3">
              La suppression de votre compte est définitive. Toutes vos données seront perdues.
            </p>
            <Button
              variant="danger"
              type="button"
              onClick={() => setShowDeleteModal(true)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              Supprimer mon compte
            </Button>
          </div>
        </div>
      )}

      <Modal open={showDeleteModal} onClose={() => { setShowDeleteModal(false); setDeleteConfirm(""); }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <h3 className="text-lg font-bold text-ardoise-900">Supprimer votre compte</h3>
        </div>
        <div className="space-y-3 text-sm text-ardoise-500">
          <p>Vous êtes sur le point de supprimer définitivement votre compte. Cette action est <strong className="text-red-600">irréversible</strong>.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Toutes vos données personnelles seront supprimées</li>
            <li>Votre historique de facturation sera perdu</li>
            <li>Vos liaisons avec les cabinets seront rompues</li>
            <li>Vous ne pourrez pas récupérer votre compte</li>
          </ul>
        </div>
        <div className="mt-5">
          <label className="block text-sm font-medium text-ardoise-700 mb-1.5">
            Tapez <strong className="text-red-600">supprimer</strong> pour confirmer
          </label>
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="supprimer"
            className="w-full border-2 border-ardoise-200 bg-transparent px-4 py-2.5 text-sm transition-all placeholder:text-ardoise-400 hover:border-ardoise-400 focus:border-red-500 focus:outline-none"
            autoComplete="off"
          />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            onClick={() => { setShowDeleteModal(false); setDeleteConfirm(""); }}
          >
            Annuler
          </Button>
          <form action={deleteAccountAction}>
            <Button
              variant="danger"
              type="submit"
              disabled={deleteConfirm !== "supprimer"}
              className="w-full"
            >
              Supprimer mon compte
            </Button>
          </form>
        </div>
      </Modal>
    </div>
  );
}

// ── Sub-components ──

const RECAP_FREQUENCIES = [
  { value: "monthly", label: "Mensuel" },
  { value: "quarterly", label: "Trimestriel" },
] as const;

function Switch({ checked, onChange, disabled = false }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${checked ? "bg-brand-600" : "bg-ardoise-200"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

function NotificationsForm() {
  const hp = usePractitioner();
  const router = useRouter();

  const initialRecap = hp?.recapFrequency ?? "monthly";
  const [recapEnabled, setRecapEnabled] = useState<boolean>(initialRecap !== "none");
  const [recapFrequency, setRecapFrequency] = useState<"monthly" | "quarterly">(
    initialRecap === "quarterly" ? "quarterly" : "monthly",
  );

  const [deadlinesReminderEnabled, setDeadlinesReminderEnabled] = useState<boolean>(hp?.deadlinesReminderEnabled ?? true);

  const [rejectionEnabled, setRejectionEnabled] = useState<boolean>(hp?.rejectionAlertEnabled ?? false);
  const [rejectionThreshold, setRejectionThreshold] = useState<string>(
    String(Number(hp?.rejectionAlertThreshold ?? "5")),
  );

  const hasDefaultBank = !!hp?.defaultBankAccountId;
  const [treasuryEnabled, setTreasuryEnabled] = useState<boolean>(false);
  const [treasuryThreshold, setTreasuryThreshold] = useState<string>("");
  const [savedTreasury, setSavedTreasury] = useState<{ enabled: boolean; threshold: string }>({ enabled: false, threshold: "" });
  const [treasuryLoaded, setTreasuryLoaded] = useState(false);

  useEffect(() => {
    if (!hasDefaultBank || treasuryLoaded) return;
    getBankAlertAction().then(({ alert }) => {
      if (alert) {
        const t = String(Number(alert.threshold));
        setTreasuryEnabled(alert.enabled);
        setTreasuryThreshold(t);
        setSavedTreasury({ enabled: alert.enabled, threshold: t });
      }
      setTreasuryLoaded(true);
    });
  }, [hasDefaultBank, treasuryLoaded]);

  const [state, action, pending] = useActionState(updateNotificationsAction, null);

  const rejectionNum = parseFloat(rejectionThreshold);
  const rejectionInvalid = rejectionEnabled && (isNaN(rejectionNum) || rejectionNum < 0.5 || rejectionNum > 50);
  const treasuryNum = parseFloat(treasuryThreshold);
  const treasuryInvalid = treasuryEnabled && (isNaN(treasuryNum) || treasuryNum < 0);
  const formValid = !rejectionInvalid && !treasuryInvalid;

  const effectiveRecap: "none" | "monthly" | "quarterly" = recapEnabled ? recapFrequency : "none";

  const hasChanges =
    effectiveRecap !== (hp?.recapFrequency ?? "monthly") ||
    deadlinesReminderEnabled !== (hp?.deadlinesReminderEnabled ?? true) ||
    rejectionEnabled !== (hp?.rejectionAlertEnabled ?? false) ||
    (rejectionEnabled && Number(rejectionThreshold || 0) !== Number(hp?.rejectionAlertThreshold ?? "5")) ||
    treasuryEnabled !== savedTreasury.enabled ||
    (treasuryEnabled && Number(treasuryThreshold || 0) !== Number(savedTreasury.threshold || 0));

  useEffect(() => {
    if (state?.success) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync saved snapshot for the bank-alert side (not in hp)
      setSavedTreasury({ enabled: treasuryEnabled, threshold: treasuryThreshold });
      router.refresh();
    }
  }, [state?.success]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <h3 className="text-sm font-medium text-ardoise-900 mb-1">Notifications</h3>
      <p className="text-sm text-ardoise-500 mb-4">
        Choisissez les emails que vous souhaitez recevoir.
      </p>
      <form action={action} className="space-y-5 max-w-sm">
        {/* Récapitulatif d'activité */}
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <Switch checked={recapEnabled} onChange={() => setRecapEnabled((v) => !v)} />
            <span className="text-sm text-ardoise-500">Récapitulatif d&apos;activité</span>
          </label>
          <input type="hidden" name="recapEnabled" value={recapEnabled ? "on" : "off"} />
          <input type="hidden" name="recapFrequency" value={recapFrequency} />
          {recapEnabled && (
            <div className="mt-2">
              <select
                value={recapFrequency}
                onChange={(e) => setRecapFrequency(e.target.value as "monthly" | "quarterly")}
                className={INPUT_CLASS + " appearance-none cursor-pointer"}
              >
                {RECAP_FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          )}
          <p className="mt-1.5 text-xs text-ardoise-400">
            Email synthétique de votre activité sur la période choisie.
          </p>
        </div>

        {/* Échéances */}
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <Switch checked={deadlinesReminderEnabled} onChange={() => setDeadlinesReminderEnabled((v) => !v)} />
            <span className="text-sm text-ardoise-500">Rappel hebdomadaire des échéances à venir</span>
          </label>
          <input type="hidden" name="deadlinesReminderEnabled" value={deadlinesReminderEnabled ? "on" : "off"} />
          <p className="mt-1.5 text-xs text-ardoise-400">
            Email envoyé chaque lundi listant les échéances des 2 prochaines semaines.
          </p>
        </div>

        {/* Trésorerie */}
        <div>
          <label className={`flex items-center gap-3 ${hasDefaultBank ? "cursor-pointer" : "cursor-not-allowed"}`}>
            <Switch
              checked={treasuryEnabled}
              disabled={!hasDefaultBank}
              onChange={() => setTreasuryEnabled((v) => !v)}
            />
            <span className={`text-sm ${hasDefaultBank ? "text-ardoise-500" : "text-ardoise-300"}`}>
              Alerte de seuil de trésorerie
            </span>
          </label>
          <input type="hidden" name="treasuryAlertEnabled" value={treasuryEnabled ? "on" : "off"} />
          <input type="hidden" name="treasuryAlertThreshold" value={treasuryThreshold} />
          {treasuryEnabled && (
            <div className="mt-2">
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={treasuryThreshold}
                  onChange={(e) => setTreasuryThreshold(e.target.value)}
                  placeholder="Ex : 1500"
                  className={INPUT_CLASS + " pr-8 font-mono"}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ardoise-400 pointer-events-none">€</span>
              </div>
              {treasuryInvalid && (
                <p className="mt-1 text-xs text-red-500">Le seuil doit être un nombre positif.</p>
              )}
            </div>
          )}
          <p className="mt-1.5 text-xs text-ardoise-400">
            {hasDefaultBank
              ? "Email envoyé quand le solde de votre compte par défaut passe sous ce seuil."
              : "Connectez d'abord un compte bancaire dans Transactions pour activer cette alerte."}
          </p>
        </div>

        {/* Taux de rejet */}
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <Switch checked={rejectionEnabled} onChange={() => setRejectionEnabled((v) => !v)} />
            <span className="text-sm text-ardoise-500">Alerte de taux de rejet trop élevé</span>
          </label>
          <input type="hidden" name="rejectionAlertEnabled" value={rejectionEnabled ? "on" : "off"} />
          <input type="hidden" name="rejectionAlertThreshold" value={rejectionThreshold} />
          {rejectionEnabled && (
            <div className="mt-2">
              <div className="relative">
                <input
                  type="number"
                  min="0.5"
                  max="50"
                  step="0.5"
                  value={rejectionThreshold}
                  onChange={(e) => setRejectionThreshold(e.target.value)}
                  placeholder="Ex : 5"
                  className={INPUT_CLASS + " pr-8 font-mono"}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ardoise-400 pointer-events-none">%</span>
              </div>
              {rejectionInvalid && (
                <p className="mt-1 text-xs text-red-500">Le seuil doit être compris entre 0,5 et 50 %.</p>
              )}
            </div>
          )}
          <p className="mt-1.5 text-xs text-ardoise-400">
            Email envoyé quand votre taux de rejet mensuel dépasse ce seuil.
          </p>
        </div>

        {state?.error && (
          <p className="bg-red-50 p-3 rounded-md text-sm text-red-600">{state.error}</p>
        )}
        {state?.success && (
          <p className="bg-menthe-50 p-3 rounded-md text-sm text-menthe-600">Préférences mises à jour.</p>
        )}

        <Button
          variant="cta"
          type="submit"
          disabled={pending || !hasChanges || !formValid}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          {pending ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </form>
    </div>
  );
}

const PASSWORD_INPUT_CLASS = "w-full border border-ardoise-200 bg-transparent px-3 py-2 rounded-lg text-[0.9rem] transition-all placeholder:text-ardoise-400 hover:border-ardoise-400 focus:border-violet-500 focus:outline-none";

function ChangePasswordSection() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <h3 className="text-sm font-medium text-ardoise-900 mb-1">Mot de passe</h3>
      <p className="text-sm text-ardoise-500 mb-3">
        Vous pouvez modifier votre mot de passe à tout moment.
      </p>
      <Button
        variant="secondary"
        type="button"
        onClick={() => setOpen(true)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Modifier le mot de passe
      </Button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ChangePasswordModal onClose={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
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
      const t = setTimeout(onClose, 1200);
      return () => clearTimeout(t);
    }
  }, [pwState?.success, onClose]);

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-ardoise-100 shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-ardoise-700"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <h3 className="text-lg font-bold text-ardoise-900">Modifier le mot de passe</h3>
      </div>
      <p className="text-sm text-ardoise-500 mb-4">
        Minimum 8 caractères, avec au moins une majuscule, une minuscule et un chiffre.
      </p>
      <form action={pwAction} className="space-y-3">
        <div>
          <label className="block text-sm text-ardoise-500 mb-1.5">Mot de passe actuel</label>
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
          <label className="block text-sm text-ardoise-500 mb-1.5">Nouveau mot de passe</label>
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
          <label className="block text-sm text-ardoise-500 mb-1.5">Confirmer le nouveau mot de passe</label>
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
          <p className="bg-menthe-50 p-3 rounded-md text-sm text-menthe-600">Mot de passe modifié avec succès.</p>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            variant="secondary"
            type="button"
            onClick={onClose}
            disabled={pwPending}
          >
            Annuler
          </Button>
          <Button
            variant="cta"
            type="submit"
            disabled={pwPending || !canSubmit}
          >
            {pwPending ? "Modification..." : "Modifier"}
          </Button>
        </div>
      </form>
    </>
  );
}

function PasswordRule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {ok ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-menthe-500"><polyline points="20 6 9 17 4 12"/></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-ardoise-300"><circle cx="12" cy="12" r="10"/></svg>
      )}
      <span className={ok ? "text-menthe-600" : "text-ardoise-400"}>{label}</span>
    </div>
  );
}
