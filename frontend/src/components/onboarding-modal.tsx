"use client";

import { useState, useEffect, useRef, useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { completeOnboardingAction } from "@/actions/onboarding";
import { verifyRppsAction } from "@/actions/verify-rpps";
import { connectBankAction, bankConnectionStatusAction } from "@/actions/bridge";
import {
  markBankConnectFromOnboarding,
  clearBankConnectFromOnboarding,
} from "@/lib/bank-connect-context";
import { Button } from "@/components/button";

const FORM_STEPS = [
  { id: "identity", label: "Identité" },
  { id: "profession", label: "Profession" },
  { id: "activity", label: "Activité" },
  { id: "tax", label: "Régime fiscal" },
] as const;

// L'étape bancaire suit le récapitulatif : elle a besoin du profil praticien en base
// (connectBankAction le refuse sinon), donc elle ne peut pas vivre dans FORM_STEPS.
// Elle n'apparaît que dans l'indicateur de progression.
const BANK_STEP = { id: "bank", label: "Banque" } as const;
const ALL_STEPS = [...FORM_STEPS, BANK_STEP];

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 180_000;

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

type Screen = "welcome" | "form" | "recap" | "bank";
type BankState = "idle" | "connecting" | "waiting" | "timeout";

export function OnboardingModal({
  open,
  startAtBank = false,
  initialFirstName = "",
}: {
  open: boolean;
  startAtBank?: boolean;
  initialFirstName?: string;
}) {
  const [screenState, setScreen] = useState<Screen>(startAtBank ? "bank" : "welcome");
  const [formStep, setFormStep] = useState(0);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState("");
  const [rppsNumber, setRppsNumber] = useState("");
  const [rppsVerifying, setRppsVerifying] = useState(false);
  const [rppsError, setRppsError] = useState("");
  const [profession, setProfession] = useState("");
  const [activityStartDate, setActivityStartDate] = useState("");
  const [taxRegime, setTaxRegime] = useState("");
  const [state, action, pending] = useActionState(completeOnboardingAction, null);
  const [bankState, setBankState] = useState<BankState>("idle");
  const [bankError, setBankError] = useState("");
  const [bankConnected, setBankConnected] = useState(false);
  const router = useRouter();
  const pollStartedAt = useRef(0);
  const submitRef = useRef<HTMLFormElement>(null);

  // Écran dérivé plutôt que setScreen dans un effet : la dernière étape du formulaire
  // enregistre le profil (state.success) et enchaîne sur la connexion bancaire, qui
  // débouche sur le récapitulatif final une fois la banque rattachée.
  const screen: Screen = bankConnected
    ? "recap"
    : state?.success
      ? "bank"
      : screenState;

  // Pendant que l'utilisateur connecte sa banque dans l'autre onglet, on interroge
  // la DB jusqu'à voir apparaître un compte synchronisé par le callback.
  useEffect(() => {
    if (bankState !== "waiting") return;

    if (!pollStartedAt.current) {
      pollStartedAt.current = Date.now();
    }

    const interval = setInterval(async () => {
      if (Date.now() - pollStartedAt.current > POLL_TIMEOUT_MS) {
        setBankState("timeout");
        return;
      }

      const result = await bankConnectionStatusAction();

      if (result.connected) {
        clearInterval(interval);

        // Profil déjà existant : rien n'a été saisi dans cette session, un
        // récapitulatif n'aurait rien à récapituler — on rend la main directement.
        if (startAtBank) {
          toast.success(`Bienvenue ${firstName} ! Votre espace est prêt.`);
          router.refresh();
          return;
        }

        setBankConnected(true);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [bankState, firstName, router, startAtBank]);

  async function handleConnectBank() {
    setBankError("");
    setBankState("connecting");

    // L'onglet doit être ouvert dans le geste utilisateur, avant tout await, sinon
    // le navigateur bloque la popup. On y pousse l'URL une fois la session créée.
    markBankConnectFromOnboarding();
    const tab = window.open("", "_blank");

    const result = await connectBankAction();

    if (result.error || !result.url) {
      tab?.close();
      clearBankConnectFromOnboarding();
      setBankError(result.error ?? "Impossible d'ouvrir la connexion bancaire.");
      setBankState("idle");
      return;
    }

    if (tab) {
      tab.location.href = result.url;
    } else {
      // Popup bloquée : on bascule dans l'onglet courant. Le callback doit alors
      // reprendre son comportement normal (redirection vers l'app), pas inviter à
      // refermer l'unique onglet ouvert.
      clearBankConnectFromOnboarding();
      window.location.href = result.url;
      return;
    }

    pollStartedAt.current = 0;
    setBankState("waiting");
  }

  if (!open) return null;

  const canGoNext =
    (formStep === 0 && firstName.trim() !== "" && lastName.trim() !== "" && /^\d{11}$/.test(rppsNumber)) ||
    (formStep === 1 && profession !== "") ||
    (formStep === 2 && activityStartDate !== "") ||
    (formStep === 3 && taxRegime !== "");

  const currentStepIndex = screen === "bank" ? FORM_STEPS.length : formStep;
  const progress = ((currentStepIndex + 1) / ALL_STEPS.length) * 100;

  const professionLabel = PROFESSIONS.find((p) => p.value === profession)?.label ?? "";
  const taxRegimeLabel = TAX_REGIMES.find((r) => r.value === taxRegime)?.label ?? "";

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in-fast p-4">
      <div className="w-full max-w-4xl h-full max-h-[600px] bg-white border border-ardoise-200 rounded-2xl animate-fade-up-fast overflow-hidden flex flex-col">

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
            <h2 className="text-2xl font-bold text-ardoise-900 mb-2">
              Bienvenue sur Actidec
            </h2>
            <p className="text-sm text-ardoise-500 mb-2 max-w-xs mx-auto">
              Configurons votre espace en quelques étapes pour personnaliser votre expérience.
            </p>
            <p className="text-xs text-ardoise-400 mb-8">
              Cela ne prendra que 2 minutes.
            </p>
            <Button
              variant="cta"
              type="button"
              onClick={() => setScreen("form")}
            >
              Commencer
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Button>
          </div>
        )}

        {/* ── Form steps ── */}
        {screen === "form" && (
          <div className="flex-1 flex flex-col">
            {/* Progress bar */}
            <div className="h-1 bg-ardoise-100">
              <div
                className="h-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex-1 flex flex-col p-5 sm:p-10">
              {/* Step indicators */}
              <div className="mb-8">
                <StepIndicator current={formStep} />
                <h2 className="text-2xl font-bold text-ardoise-900">
                  {formStep === 0 && "Comment vous appelez-vous ?"}
                  {formStep === 1 && "Quelle est votre profession ?"}
                  {formStep === 2 && "Quand avez-vous débuté ?"}
                  {formStep === 3 && "Quel est votre régime fiscal ?"}
                </h2>
                <p className="mt-1 text-sm text-ardoise-500">
                  {formStep === 0 && "Renseignez votre nom et prénom pour personnaliser votre espace."}
                  {formStep === 1 && "Sélectionnez votre métier pour personnaliser votre expérience."}
                  {formStep === 2 && "Indiquez la date de début de votre activité libérale."}
                  {formStep === 3 && "Choisissez le régime fiscal qui correspond à votre situation."}
                </p>
              </div>

              {/* Step content */}
              <div key={formStep} className="flex-1 animate-step-in">
                {formStep === 0 && (
                  <div className="space-y-4">
                    <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-ardoise-700 mb-1.5">Prénom</label>
                    <div className="relative group">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 text-ardoise-300 transition-colors group-focus-within:text-brand-600">
                        <UserIcon />
                      </div>
                      <input
                        id="firstName"
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Prénom"
                        className="w-full border-b-2 border-ardoise-200 bg-transparent pl-8 pr-4 py-4 text-[0.9rem] transition-all placeholder:text-ardoise-400 placeholder:font-medium hover:border-ardoise-400 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    </div>
                    <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-ardoise-700 mb-1.5">Nom</label>
                    <div className="relative group">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 text-ardoise-300 transition-colors group-focus-within:text-brand-600">
                        <UserIcon />
                      </div>
                      <input
                        id="lastName"
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Nom"
                        className="w-full border-b-2 border-ardoise-200 bg-transparent pl-8 pr-4 py-4 text-[0.9rem] transition-all placeholder:text-ardoise-400 placeholder:font-medium hover:border-ardoise-400 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    </div>
                    <div>
                    <label htmlFor="rppsNumber" className="block text-sm font-medium text-ardoise-700 mb-1.5">Numéro RPPS</label>
                    <div className="relative group">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 text-ardoise-300 transition-colors group-focus-within:text-brand-600">
                        <RppsIcon />
                      </div>
                      <input
                        id="rppsNumber"
                        type="text"
                        inputMode="numeric"
                        maxLength={11}
                        value={rppsNumber}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").slice(0, 11);
                          setRppsNumber(v);
                          setRppsError("");
                        }}
                        placeholder="Numéro RPPS (11 chiffres)"
                        className="w-full border-b-2 border-ardoise-200 bg-transparent pl-8 pr-4 py-4 text-[0.9rem] transition-all placeholder:text-ardoise-400 placeholder:font-medium hover:border-ardoise-400 focus:border-brand-500 focus:outline-none font-mono"
                      />
                    </div>
                    </div>
                    {rppsError && (
                      <p className="text-sm text-red-600 mt-1">{rppsError}</p>
                    )}
                    {rppsVerifying && (
                      <p className="text-sm text-ardoise-500 mt-1">Vérification en cours...</p>
                    )}
                  </div>
                )}

                {formStep === 1 && (
                  <div className="grid gap-3">
                    {PROFESSIONS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setProfession(p.value)}
                        className={`flex items-center gap-4 w-full p-4 border-2 text-left transition-all hover:border-ardoise-400 ${
                          profession === p.value
                            ? "border-brand-500 bg-brand-50"
                            : "border-ardoise-200"
                        }`}
                      >
                        <div className={`flex items-center justify-center w-12 h-12 rounded-lg transition-colors ${
                          profession === p.value ? "bg-brand-600 text-white" : "bg-ardoise-100 text-ardoise-500"
                        }`}>
                          <p.icon />
                        </div>
                        <div>
                          <span className="font-medium text-ardoise-900">{p.label}</span>
                          <p className="text-xs text-ardoise-400 mt-0.5">Professionnel de santé</p>
                        </div>
                        {profession === p.value && (
                          <svg className="ml-auto text-brand-600" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {formStep === 2 && (
                  <div>
                    <label htmlFor="activityStartDate" className="block text-sm font-medium text-ardoise-700 mb-1.5">Date de début d&apos;activité</label>
                    <div className="relative group">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 text-ardoise-300 transition-colors group-focus-within:text-brand-600">
                        <CalendarIcon />
                      </div>
                      <input
                        id="activityStartDate"
                        type="date"
                        value={activityStartDate}
                        onChange={(e) => setActivityStartDate(e.target.value)}
                        max={new Date().toISOString().split("T")[0]}
                        className="w-full border-b-2 border-ardoise-200 bg-transparent pl-8 pr-4 py-4 text-[0.9rem] transition-all hover:border-ardoise-400 focus:border-brand-500 focus:outline-none font-mono"
                      />
                    </div>
                    <p className="mt-3 text-xs text-ardoise-400">
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
                        className={`flex items-start gap-4 w-full p-4 border-2 text-left transition-all hover:border-ardoise-400 ${
                          taxRegime === r.value
                            ? "border-brand-500 bg-brand-50"
                            : "border-ardoise-200"
                        }`}
                      >
                        <div className={`flex items-center justify-center w-5 h-5 mt-0.5 border-2 shrink-0 transition-all ${
                          taxRegime === r.value
                            ? "border-brand-600 bg-brand-600"
                            : "border-ardoise-300"
                        }`}>
                          {taxRegime === r.value && (
                            <CheckIcon size={12} stroke="white" />
                          )}
                        </div>
                        <div>
                          <span className="font-medium text-ardoise-900">{r.label}</span>
                          <p className="text-xs text-ardoise-400 mt-0.5">{r.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

              </div>

              {state?.error && (
                <p className="mt-6 bg-red-50 p-3 text-sm text-red-600">{state.error}</p>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between mt-8 pt-6 border-t border-ardoise-100">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => formStep === 0 ? setScreen("welcome") : setFormStep(formStep - 1)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                  Retour
                </Button>

                <Button
                  variant="cta"
                  type="button"
                  onClick={async () => {
                    if (formStep === 0) {
                      setRppsError("");
                      setRppsVerifying(true);
                      const result = await verifyRppsAction(rppsNumber);
                      setRppsVerifying(false);
                      if (result.error) {
                        setRppsError(result.error);
                        return;
                      }
                    }
                    if (formStep < FORM_STEPS.length - 1) {
                      setFormStep(formStep + 1);
                    } else {
                      // Dernière étape du formulaire : on enregistre le profil, requis
                      // par la connexion bancaire qui suit.
                      submitRef.current?.requestSubmit();
                    }
                  }}
                  disabled={!canGoNext || rppsVerifying || pending || undefined}
                >
                  {rppsVerifying ? "Vérification..." : pending ? "Enregistrement..." : "Continuer"}
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Recap screen (bilan final, tout est déjà enregistré) ── */}
        {screen === "recap" && (
          <div className="flex-1 flex flex-col p-5 sm:p-10 overflow-y-auto animate-step-in">
            <div className="text-center mb-8">
              <div className="flex justify-center mb-4">
                <div className="flex items-center justify-center w-14 h-14 bg-gradient-to-br from-brand-500 to-brand-700 text-white rounded-full text-lg font-bold">
                  {(firstName[0]! + lastName[0]!).toUpperCase()}
                </div>
              </div>
              <h2 className="text-2xl font-bold text-ardoise-900">
                Votre espace est prêt, {firstName}
              </h2>
              <p className="mt-1 text-sm text-ardoise-500">
                Voici le récapitulatif de votre configuration.
              </p>
            </div>

            <div className="space-y-0 border border-ardoise-200 divide-y divide-ardoise-200 mb-8">
              <RecapRow label="Nom complet" value={`${firstName} ${lastName}`} />
              <RecapRow label="Numéro RPPS" value={rppsNumber} />
              <RecapRow label="Profession" value={professionLabel} />
              <RecapRow label="Début d'activité" value={formatDate(activityStartDate)} />
              <RecapRow label="Régime fiscal" value={taxRegimeLabel} />
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-sm text-ardoise-500">Compte bancaire</span>
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                  <CheckIcon size={13} stroke="#15803d" />
                  Connecté
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <Button
                variant="cta"
                type="button"
                onClick={() => {
                  toast.success(`Bienvenue ${firstName} ! Votre espace est prêt.`);
                  router.refresh();
                }}
              >
                Commencer
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </Button>
            </div>
          </div>
        )}

        {/* ── Bank connection step ── */}
        {screen === "bank" && (
          <div className="flex-1 flex flex-col">
            <div className="h-1 bg-ardoise-100">
              <div
                className="h-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex-1 flex flex-col p-5 sm:p-10 overflow-y-auto animate-step-in">
              <div className="mb-8">
                <StepIndicator current={FORM_STEPS.length} />
                <h2 className="text-2xl font-bold text-ardoise-900">
                  Connectez votre compte bancaire
                </h2>
                <p className="mt-1 text-sm text-ardoise-500">
                  Actidec suit vos encaissements et votre trésorerie à partir de vos
                  transactions. Cette étape est nécessaire pour accéder à votre espace.
                </p>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center text-center">
                {bankState === "waiting" ? (
                  <>
                    <div className="h-10 w-10 mb-5 animate-spin rounded-full border-4 border-ardoise-200 border-t-brand-600" />
                    <p className="font-medium text-ardoise-900">
                      En attente de votre banque...
                    </p>
                    <p className="mt-1 text-sm text-ardoise-500 max-w-sm">
                      Terminez la connexion dans l&apos;onglet qui vient de s&apos;ouvrir.
                      Cette page se mettra à jour automatiquement.
                    </p>
                    <button
                      type="button"
                      onClick={handleConnectBank}
                      className="mt-5 text-sm text-brand-600 underline"
                    >
                      Rouvrir la fenêtre de connexion
                    </button>
                  </>
                ) : bankState === "timeout" ? (
                  <>
                    <div className="flex items-center justify-center w-14 h-14 mb-5 rounded-full bg-amber-100 text-amber-600">
                      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
                    </div>
                    <p className="font-medium text-ardoise-900">
                      Aucune connexion détectée
                    </p>
                    <p className="mt-1 text-sm text-ardoise-500 max-w-sm">
                      La connexion n&apos;a pas abouti, ou elle a été interrompue.
                      Vous pouvez réessayer.
                    </p>
                    <Button
                      variant="cta"
                      type="button"
                      onClick={handleConnectBank}
                      className="mt-6"
                    >
                      Réessayer
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center w-16 h-16 mb-6 rounded-2xl bg-brand-50">
                      <BankIcon />
                    </div>
                    <p className="text-sm text-ardoise-500 max-w-sm mb-6">
                      Vous serez redirigé vers notre partenaire bancaire dans un nouvel
                      onglet. Actidec n&apos;accède jamais à vos identifiants.
                    </p>
                    <Button
                      variant="cta"
                      type="button"
                      onClick={handleConnectBank}
                      disabled={bankState === "connecting" || undefined}
                    >
                      {bankState === "connecting" ? "Ouverture..." : "Connecter ma banque"}
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </Button>
                  </>
                )}

                {bankError && (
                  <p className="mt-5 bg-red-50 p-3 text-sm text-red-600">{bankError}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Soumission du profil, déclenchée par « Continuer » à la dernière étape du
            formulaire : useActionState a besoin d'un <form> réel pour porter l'action. */}
        <form action={action} className="hidden" ref={submitRef}>
          <input type="hidden" name="firstName" value={firstName} />
          <input type="hidden" name="lastName" value={lastName} />
          <input type="hidden" name="rppsNumber" value={rppsNumber} />
          <input type="hidden" name="profession" value={profession} />
          <input type="hidden" name="activityStartDate" value={activityStartDate} />
          <input type="hidden" name="taxRegime" value={taxRegime} />
        </form>

      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-ardoise-400 mb-3 overflow-x-auto">
      {ALL_STEPS.map((s, i) => (
        <span key={s.id} className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span
            className={`flex items-center justify-center w-6 h-6 text-xs font-medium border-2 rounded-full transition-all ${
              i < current
                ? "border-brand-600 bg-brand-600 text-white"
                : i === current
                  ? "border-brand-600 text-brand-600"
                  : "border-ardoise-200 text-ardoise-300"
            }`}
          >
            {i < current ? <CheckIcon size={12} /> : i + 1}
          </span>
          <span className={`hidden sm:inline ${i === current ? "text-ardoise-900 font-medium" : ""}`}>
            {s.label}
          </span>
          {i < ALL_STEPS.length - 1 && <span className="w-6 h-px bg-ardoise-200" />}
        </span>
      ))}
    </div>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-sm text-ardoise-500">{label}</span>
      <span className="text-sm font-medium text-ardoise-900">{value}</span>
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

function RppsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2" fill="#EC6C12" />
      <rect x="3" y="5" width="18" height="5" rx="2" fill="#C2580F" />
      <rect x="6" y="13" width="8" height="2" rx="1" fill="#FEF3C7" />
      <rect x="6" y="16" width="5" height="1" rx="0.5" fill="#FDBA74" />
    </svg>
  );
}

function BankIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none">
      <rect x="1" y="5" width="22" height="14" rx="2.5" fill="#EC6C12" />
      <rect x="3.5" y="8.5" width="6" height="4.5" rx="1" fill="#FEF3C7" />
      <rect x="12" y="15" width="5" height="1.2" rx="0.6" fill="white" opacity="0.35" />
      <rect x="12" y="12.5" width="8" height="1.2" rx="0.6" fill="white" opacity="0.35" />
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
