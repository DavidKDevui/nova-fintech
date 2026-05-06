"use client";

import { useState, useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { completeOnboardingAction } from "@/actions/onboarding";

const FORM_STEPS = [
  { id: "identity", label: "Identité" },
  { id: "profession", label: "Profession" },
  { id: "activity", label: "Activité" },
  { id: "tax", label: "Régime fiscal" },
  { id: "retrocession", label: "Rétrocession" },
  { id: "pas", label: "Impôt sur le revenu" },
] as const;

const PROFESSIONS = [
  { value: "nurse", label: "Infirmier(e)", icon: NurseIcon },
] as const;

const TAX_REGIMES = [
  {
    value: "micro_bnc",
    label: "Micro-BNC",
    description: "Régime simplifié avec abattement forfaitaire de 34%",
  },
  {
    value: "bnc",
    label: "BNC",
    description: "Déclaration contrôlée des bénéfices réels",
  },
] as const;

type Screen = "welcome" | "form" | "recap";

export function OnboardingModal({ open }: { open: boolean }) {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [formStep, setFormStep] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profession, setProfession] = useState("");
  const [activityStartDate, setActivityStartDate] = useState("");
  const [taxRegime, setTaxRegime] = useState("");
  const [retrocessionType, setRetrocessionType] = useState<"percentage" | "fixed">("percentage");
  const [retrocessionValue, setRetrocessionValue] = useState("");
  const [pasFrequency, setPasFrequency] = useState("");
  const [state, action, pending] = useActionState(completeOnboardingAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.success) {
      toast.success(`Bienvenue ${firstName} ! Votre espace est prêt.`);
      router.refresh();
    }
  }, [state?.success, router, firstName]);

  if (!open) return null;

  const canGoNext =
    (formStep === 0 && firstName.trim() !== "" && lastName.trim() !== "") ||
    (formStep === 1 && profession !== "") ||
    (formStep === 2 && activityStartDate !== "") ||
    (formStep === 3 && taxRegime !== "") ||
    (formStep === 4) || // retrocession is optional
    (formStep === 5 && pasFrequency !== "");

  const progress = ((formStep + 1) / FORM_STEPS.length) * 100;

  const professionLabel = PROFESSIONS.find((p) => p.value === profession)?.label ?? "";
  const taxRegimeLabel = TAX_REGIMES.find((r) => r.value === taxRegime)?.label ?? "";
  const retrocessionLabel = retrocessionValue
    ? `${retrocessionValue} ${retrocessionType === "percentage" ? "%" : "€"}`
    : "Aucune";
  const pasFrequencyLabel = pasFrequency === "monthly" ? "Mensuel" : pasFrequency === "quarterly" ? "Trimestriel" : "";

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in-fast p-4">
      <div className="w-full max-w-4xl h-full max-h-[600px] bg-white border border-gray-200 rounded-2xl animate-fade-up-fast overflow-hidden flex flex-col">

        {/* ── Welcome screen ── */}
        {screen === "welcome" && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-14 text-center animate-step-in">
            <div className="flex justify-center mb-6">
              <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-brand-50">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#EC6C12" />
                  <path d="M13 2L3 14h9" fill="#FB923C" />
                  <path d="M12 14l-1 8 10-12h-9" fill="#C2580F" />
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Bienvenue sur Actidec
            </h2>
            <p className="text-sm text-gray-500 mb-2 max-w-xs mx-auto">
              Configurons votre espace en quelques étapes pour personnaliser votre expérience.
            </p>
            <p className="text-xs text-gray-400 mb-8">
              Cela ne prendra que 2 minutes.
            </p>
            <button
              type="button"
              onClick={() => setScreen("form")}
              className="inline-flex items-center gap-2.5 bg-brand-600 px-6 py-3 rounded-lg text-sm font-medium text-white transition-all hover:bg-brand-700 active:scale-[0.98]"
            >
              Commencer
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>
        )}

        {/* ── Form steps ── */}
        {screen === "form" && (
          <div className="flex-1 flex flex-col">
            {/* Progress bar */}
            <div className="h-1 bg-gray-100">
              <div
                className="h-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex-1 flex flex-col p-5 sm:p-10">
              {/* Step indicators */}
              <div className="mb-8">
                <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-gray-400 mb-3 overflow-x-auto">
                  {FORM_STEPS.map((s, i) => (
                    <span key={s.id} className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      <span
                        className={`flex items-center justify-center w-6 h-6 text-xs font-medium border-2 rounded-full transition-all ${
                          i < formStep
                            ? "border-brand-600 bg-brand-600 text-white"
                            : i === formStep
                              ? "border-brand-600 text-brand-600"
                              : "border-gray-200 text-gray-300"
                        }`}
                      >
                        {i < formStep ? (
                          <CheckIcon size={12} />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <span className={`hidden sm:inline ${i === formStep ? "text-gray-900 font-medium" : ""}`}>
                        {s.label}
                      </span>
                      {i < FORM_STEPS.length - 1 && (
                        <span className="w-6 h-px bg-gray-200" />
                      )}
                    </span>
                  ))}
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {formStep === 0 && "Comment vous appelez-vous ?"}
                  {formStep === 1 && "Quelle est votre profession ?"}
                  {formStep === 2 && "Quand avez-vous débuté ?"}
                  {formStep === 3 && "Quel est votre régime fiscal ?"}
                  {formStep === 4 && "Rétrocession mensuelle"}
                  {formStep === 5 && "Prélèvement de l'impôt sur le revenu"}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {formStep === 0 && "Renseignez votre nom et prénom pour personnaliser votre espace."}
                  {formStep === 1 && "Sélectionnez votre métier pour personnaliser votre expérience."}
                  {formStep === 2 && "Indiquez la date de début de votre activité libérale."}
                  {formStep === 3 && "Choisissez le régime fiscal qui correspond à votre situation."}
                  {formStep === 4 && "Si vous exercez en collaboration ou remplacement, indiquez le pourcentage rétrocédé au titulaire."}
                  {formStep === 5 && "Indiquez la fréquence de vos acomptes d'impôt sur le revenu (prélèvement à la source)."}
                </p>
              </div>

              {/* Step content */}
              <div key={formStep} className="flex-1 animate-step-in">
                {formStep === 0 && (
                  <div className="space-y-4">
                    <div className="relative group">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-300 transition-colors group-focus-within:text-brand-600">
                        <UserIcon />
                      </div>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Prénom"
                        className="w-full border-b-2 border-gray-200 bg-transparent pl-8 pr-4 py-4 text-[0.9rem] transition-all placeholder:text-gray-400 placeholder:font-medium hover:border-gray-400 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="relative group">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-300 transition-colors group-focus-within:text-brand-600">
                        <UserIcon />
                      </div>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Nom"
                        className="w-full border-b-2 border-gray-200 bg-transparent pl-8 pr-4 py-4 text-[0.9rem] transition-all placeholder:text-gray-400 placeholder:font-medium hover:border-gray-400 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {formStep === 1 && (
                  <div className="grid gap-3">
                    {PROFESSIONS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setProfession(p.value)}
                        className={`flex items-center gap-4 w-full p-4 border-2 text-left transition-all hover:border-gray-400 ${
                          profession === p.value
                            ? "border-brand-500 bg-brand-50"
                            : "border-gray-200"
                        }`}
                      >
                        <div className={`flex items-center justify-center w-12 h-12 rounded-lg transition-colors ${
                          profession === p.value ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-500"
                        }`}>
                          <p.icon />
                        </div>
                        <div>
                          <span className="font-medium text-gray-900">{p.label}</span>
                          <p className="text-xs text-gray-400 mt-0.5">Professionnel de santé</p>
                        </div>
                        {profession === p.value && (
                          <svg className="ml-auto text-brand-600" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {formStep === 2 && (
                  <div>
                    <div className="relative group">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-300 transition-colors group-focus-within:text-brand-600">
                        <CalendarIcon />
                      </div>
                      <input
                        type="date"
                        value={activityStartDate}
                        onChange={(e) => setActivityStartDate(e.target.value)}
                        max={new Date().toISOString().split("T")[0]}
                        className="w-full border-b-2 border-gray-200 bg-transparent pl-8 pr-4 py-4 text-[0.9rem] transition-all hover:border-gray-400 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <p className="mt-3 text-xs text-gray-400">
                      Date à laquelle vous avez commencé votre activité libérale.
                    </p>
                  </div>
                )}

                {formStep === 3 && (
                  <div className="grid gap-3">
                    {TAX_REGIMES.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setTaxRegime(r.value)}
                        className={`flex items-start gap-4 w-full p-4 border-2 text-left transition-all hover:border-gray-400 ${
                          taxRegime === r.value
                            ? "border-brand-500 bg-brand-50"
                            : "border-gray-200"
                        }`}
                      >
                        <div className={`flex items-center justify-center w-5 h-5 mt-0.5 border-2 shrink-0 transition-all ${
                          taxRegime === r.value
                            ? "border-brand-600 bg-brand-600"
                            : "border-gray-300"
                        }`}>
                          {taxRegime === r.value && (
                            <CheckIcon size={12} stroke="white" />
                          )}
                        </div>
                        <div>
                          <span className="font-medium text-gray-900">{r.label}</span>
                          <p className="text-xs text-gray-400 mt-0.5">{r.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {formStep === 4 && (
                  <div>
                    <div className="flex gap-2 mb-5">
                      <button
                        type="button"
                        onClick={() => setRetrocessionType("percentage")}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                          retrocessionType === "percentage"
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        <PercentIcon />
                        Pourcentage
                      </button>
                      <button
                        type="button"
                        onClick={() => setRetrocessionType("fixed")}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                          retrocessionType === "fixed"
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        <EuroIcon />
                        Montant fixe
                      </button>
                    </div>
                    <div className="relative group">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-300 transition-colors group-focus-within:text-brand-600">
                        {retrocessionType === "percentage" ? <PercentIcon /> : <EuroIcon />}
                      </div>
                      <input
                        type="number"
                        min="0"
                        max={retrocessionType === "percentage" ? "100" : undefined}
                        step="0.5"
                        value={retrocessionValue}
                        onChange={(e) => setRetrocessionValue(e.target.value)}
                        placeholder={retrocessionType === "percentage" ? "Ex : 12.5" : "Ex : 800"}
                        className="w-full border-b-2 border-gray-200 bg-transparent pl-8 pr-12 py-4 text-[0.9rem] transition-all placeholder:text-gray-400 placeholder:font-medium hover:border-gray-400 focus:border-brand-500 focus:outline-none"
                      />
                      <span className="absolute right-0 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400">
                        {retrocessionType === "percentage" ? "%" : "€"}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-gray-400">
                      Laissez vide si vous êtes titulaire et ne rétrocédez à personne.
                    </p>
                  </div>
                )}

                {formStep === 5 && (
                  <div className="grid gap-3">
                    {([
                      { value: "monthly", label: "Mensuel", description: "Acompte prélevé chaque mois" },
                      { value: "quarterly", label: "Trimestriel", description: "Acompte prélevé chaque trimestre" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPasFrequency(opt.value)}
                        className={`flex items-start gap-4 w-full p-4 border-2 text-left transition-all hover:border-gray-400 ${
                          pasFrequency === opt.value
                            ? "border-brand-500 bg-brand-50"
                            : "border-gray-200"
                        }`}
                      >
                        <div className={`flex items-center justify-center w-5 h-5 mt-0.5 border-2 shrink-0 transition-all ${
                          pasFrequency === opt.value
                            ? "border-brand-600 bg-brand-600"
                            : "border-gray-300"
                        }`}>
                          {pasFrequency === opt.value && (
                            <CheckIcon size={12} stroke="white" />
                          )}
                        </div>
                        <div>
                          <span className="font-medium text-gray-900">{opt.label}</span>
                          <p className="text-xs text-gray-400 mt-0.5">{opt.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => formStep === 0 ? setScreen("welcome") : setFormStep(formStep - 1)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                  Retour
                </button>

                <button
                  type="button"
                  onClick={() => formStep < FORM_STEPS.length - 1 ? setFormStep(formStep + 1) : setScreen("recap")}
                  disabled={!canGoNext || undefined}
                  className="flex items-center gap-2 bg-brand-600 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:bg-brand-700 active:scale-[0.98] disabled:opacity-30 disabled:active:scale-100"
                >
                  Continuer
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Recap screen ── */}
        {screen === "recap" && (
          <div className="flex-1 flex flex-col p-5 sm:p-10 overflow-y-auto animate-step-in">
            <div className="text-center mb-8">
              <div className="flex justify-center mb-4">
                <div className="flex items-center justify-center w-14 h-14 bg-gradient-to-br from-brand-500 to-brand-700 text-white rounded-full text-lg font-bold">
                  {(firstName[0]! + lastName[0]!).toUpperCase()}
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">
                Tout est bon, {firstName} ?
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Vérifiez vos informations avant de finaliser.
              </p>
            </div>

            <div className="space-y-0 border border-gray-200 divide-y divide-gray-200 mb-8">
              <RecapRow label="Nom complet" value={`${firstName} ${lastName}`} />
              <RecapRow label="Profession" value={professionLabel} />
              <RecapRow label="Début d'activité" value={formatDate(activityStartDate)} />
              <RecapRow label="Régime fiscal" value={taxRegimeLabel} />
              <RecapRow label="Rétrocession" value={retrocessionLabel} />
              <RecapRow label="Prélèvement impôt" value={pasFrequencyLabel} />
            </div>

            {state?.error && (
              <p className="mb-4 bg-red-50 p-3 text-sm text-red-600">{state.error}</p>
            )}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setScreen("form")}
                className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                Modifier
              </button>

              <form action={action}>
                <input type="hidden" name="firstName" value={firstName} />
                <input type="hidden" name="lastName" value={lastName} />
                <input type="hidden" name="profession" value={profession} />
                <input type="hidden" name="activityStartDate" value={activityStartDate} />
                <input type="hidden" name="taxRegime" value={taxRegime} />
                <input type="hidden" name="retrocessionType" value={retrocessionType} />
                <input type="hidden" name="retrocessionValue" value={retrocessionValue} />
                <input type="hidden" name="pasFrequency" value={pasFrequency} />
                <button
                  type="submit"
                  disabled={pending}
                  className="flex items-center gap-2 bg-brand-600 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:bg-brand-700 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
                >
                  {pending ? "Enregistrement..." : "Confirmer et commencer"}
                  <CheckIcon size={16} />
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}

function CheckIcon({ size = 16, stroke = "currentColor" }: { size?: number; stroke?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  );
}

function UserIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" fill="#EC6C12" />
      <path d="M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2" fill="#FDBA74" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="18" rx="2" fill="#F59E0B" />
      <rect x="3" y="4" width="18" height="6" rx="2" fill="#D97706" />
      <rect x="7" y="2" width="2" height="4" rx="1" fill="#92400E" />
      <rect x="15" y="2" width="2" height="4" rx="1" fill="#92400E" />
      <rect x="7" y="13" width="3" height="2" rx="0.5" fill="#FEF3C7" />
      <rect x="12" y="13" width="3" height="2" rx="0.5" fill="#FEF3C7" />
    </svg>
  );
}

function EuroIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#F59E0B" />
      <path d="M15 7.5a5 5 0 0 0-4.5 0A4.5 4.5 0 0 0 8 11.5h5M8 12.5a4.5 4.5 0 0 0 2.5 4 5 5 0 0 0 4.5 0M7 11h6M7 13h6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PercentIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#14B8A6" />
      <line x1="16" y1="8" x2="8" y2="16" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9" cy="9" r="2" fill="#F0FDFA" />
      <circle cx="15" cy="15" r="2" fill="#F0FDFA" />
    </svg>
  );
}

function NurseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h5v5c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2h-2z" fill="#EC6C12" />
      <path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h5v5c0 1.1.9 2 2 2h1V2h-1z" fill="#FB923C" />
    </svg>
  );
}
