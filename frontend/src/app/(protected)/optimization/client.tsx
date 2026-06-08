"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePractitioner } from "@/providers/practitioner-provider";
import { getCotisationsEstimate, type CotisationsEstimate } from "@/actions/cotisations-estimate";
import { getEffectiveCAAction, type EffectiveCA } from "@/actions/effective-ca";
import { getFiscalSituationAction } from "@/actions/fiscal-situation";
import { getOptimizationContextAction, type OptimizationContext } from "@/actions/optimization-context";
import { getRecommendationsAction, type Recommendation } from "@/actions/recommendations";
import { computeIR, computeParts } from "@/lib/data/fr-tax";
import { calculerCotisationsCarpimko } from "@/lib/services/carpimko.service";
import { downloadPDF } from "@/lib/export";
import { ExportButtons } from "@/components/export-buttons";
import { FloatingChat } from "@/components/floating-chat";
import { DataMissingOverlay } from "@/components/data-missing-overlay";
import { CASourceIndicator } from "@/components/ca-source-indicator";

const formatEur = (n: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

const BLANCHISSERIE_PER_DAY = 2;

type FiscalSituation = Awaited<ReturnType<typeof getFiscalSituationAction>>;

type OptimKey = "per" | "madelin" | "blanchisserie" | "vacances" | "selarl" | "ce" | "materiel" | "temps";

type OptimCard = {
  key: OptimKey;
  title: string;
  tag: string;
  description: string;
  available: boolean;
  bgImage?: string;
  defaultAmount?: number;          // valeur "raisonnable" pré-remplie
  amountAuto?: boolean;            // calculée automatiquement, pas de saisie
  deductibleFiscal?: boolean;
  deductibleSocial?: boolean;
  // En micro-BNC, l'abattement forfaitaire de 34 % couvre toutes les charges :
  // ces optims ne sont donc pas déductibles en plus.
  requiresBNCReel?: boolean;
  computeMax?: (ctx: { revenuPro: number; pass: number; smicMensuel: number }) => number;
  computeAuto?: (ctx: { joursTravaillesAnnee: number }) => number;
};

const cards: OptimCard[] = [
  {
    key: "per",
    title: "Plan Épargne Retraite",
    tag: "Optimisation fiscale",
    description: "Préparez votre retraite tout en réduisant votre impôt.",
    available: true,
    bgImage: "https://images.unsplash.com/photo-1633158829875-e5316a358c6f?w=800&q=80",
    defaultAmount: 3000,
    deductibleFiscal: true,
    deductibleSocial: false,
    // Plafond PER (PERin) : max(plancher, base) + supplément 15 % entre 1 et 8 PASS.
    // Réf : article 163 quatervicies CGI / BOI-IR-BASE-20-50-30.
    computeMax: ({ revenuPro, pass }) => {
      const plancher = 0.10 * pass;
      const base = Math.min(0.10 * revenuPro, 0.10 * 8 * pass);
      const supplement = 0.15 * Math.max(0, Math.min(revenuPro, 8 * pass) - pass);
      return Math.round(Math.max(plancher, base) + supplement);
    },
  },
  {
    key: "madelin",
    title: "Prévoyance Pro",
    tag: "Optimisation fiscale",
    description: "Protégez votre activité en cas d'accident.",
    available: true,
    bgImage: "https://images.unsplash.com/photo-1637763723578-79a4ca9225f7?w=800&q=80",
    defaultAmount: 2000,
    deductibleFiscal: true,
    deductibleSocial: true,
    requiresBNCReel: true,
    computeMax: ({ revenuPro, pass }) => Math.round(Math.min(0.0375 * revenuPro + 0.07 * pass, 0.03 * 8 * pass)),
  },
  {
    key: "blanchisserie",
    title: "Frais de blanchisserie",
    tag: "Optimisation sociale",
    description: "Augmentez vos frais déductibles.",
    available: true,
    bgImage: "https://images.unsplash.com/photo-1626806819282-2c1dc01a5e0c?w=800&q=80",
    amountAuto: true,
    deductibleFiscal: true,
    deductibleSocial: true,
    requiresBNCReel: true,
    computeAuto: ({ joursTravaillesAnnee }) => joursTravaillesAnnee * BLANCHISSERIE_PER_DAY,
  },
  {
    key: "vacances",
    title: "Chèques-vacances",
    tag: "Optimisation fiscale",
    description: "Augmentez votre pouvoir d'achat.",
    available: true,
    bgImage: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80",
    defaultAmount: 1000,
    deductibleFiscal: true,
    deductibleSocial: true,
    requiresBNCReel: true,
    computeMax: ({ smicMensuel }) => Math.round(smicMensuel),
  },
  { key: "selarl", title: "Passage en SELARL", tag: "En cours de construction", description: "test text here", available: false },
  { key: "ce", title: "Comité d'entreprise", tag: "En cours de construction", description: "test text here", available: false },
  { key: "materiel", title: "Achat de matériel", tag: "En cours de construction", description: "test text here", available: false },
  { key: "temps", title: "Gestion temps travail", tag: "En cours de construction", description: "test text here", available: false },
];

export function OptimizationClient() {
  const hp = usePractitioner();
  const [selected, setSelected] = useState<Set<OptimKey>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [estimate, setEstimate] = useState<CotisationsEstimate | null>(null);
  const [fiscal, setFiscal] = useState<FiscalSituation>(null);
  const [ctx, setCtx] = useState<OptimizationContext | null>(null);
  const [urssafAfter, setUrssafAfter] = useState<number | null>(null);
  const [urssafLoading, setUrssafLoading] = useState(false);
  const [effectiveCA, setEffectiveCA] = useState<EffectiveCA>({ ca: 0, source: "none" });

  const currentYear = new Date().getFullYear();
  const totalCA = effectiveCA.ca;
  const bankConnected = !!hp?.bridgeUserUuid;

  useEffect(() => {
    getEffectiveCAAction(currentYear, "bordereaux").then(setEffectiveCA).catch(() => {});
  }, [currentYear]);

  useEffect(() => {
    if (totalCA <= 0) return;
    getCotisationsEstimate(totalCA)
      .then((res) => { if (res) setEstimate(res); })
      .catch(() => {});
  }, [totalCA]);

  useEffect(() => {
    getFiscalSituationAction(currentYear).then(setFiscal).catch(() => {});
    getOptimizationContextAction(currentYear).then(setCtx).catch(() => {});
  }, [currentYear]);

  // Initialise les montants par défaut quand l'utilisateur coche
  useEffect(() => {
    if (!ctx || !estimate) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- init des montants par défaut quand le context devient disponible
    setAmounts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const card of cards) {
        if (!card.available || prev[card.key] != null) continue;
        if (card.amountAuto && card.computeAuto) {
          next[card.key] = card.computeAuto({ joursTravaillesAnnee: ctx.joursTravaillesAnnee });
          changed = true;
        } else if (card.defaultAmount != null) {
          next[card.key] = card.defaultAmount;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [ctx, estimate]);

  const isMicroBNC = hp?.taxRegime === "micro_bnc";

  // ── Déductions selon les cards cochées ──
  const { deductionFiscale, deductionSociale, decaissement } = useMemo(() => {
    let f = 0, s = 0, d = 0;
    for (const card of cards) {
      if (!card.available || !selected.has(card.key)) continue;
      // En micro-BNC, l'abattement forfaitaire couvre toutes les charges :
      // les optims qui passent par le bénéfice pro ne sont pas cumulables.
      if (isMicroBNC && card.requiresBNCReel) continue;
      const amount = amounts[card.key] ?? 0;
      if (card.deductibleFiscal) f += amount;
      if (card.deductibleSocial) s += amount;
      // Blanchisserie = pas de décaissement (déduction comptable pure)
      if (!card.amountAuto) d += amount;
    }
    return { deductionFiscale: f, deductionSociale: s, decaissement: d };
  }, [selected, amounts, isMicroBNC]);

  // ── URSSAF : recalcul server (OpenFisca), debounced sur déductionSociale ──
  // Pour base "annualise" → impact immédiat, pour "forfaitaire"/"n2" → inchangée (effet N+2).
  useEffect(() => {
    if (!estimate || totalCA <= 0) return;
    if (deductionSociale === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset à la valeur de base quand pas de déduction
      setUrssafAfter(estimate.urssafAnnuel);
      return;
    }
    if (estimate.urssafBase !== "annualise") {
      // Pas de recalcul utile : effet différé en N+2 sur la régularisation.
      setUrssafAfter(estimate.urssafAnnuel);
      return;
    }
    setUrssafLoading(true);
    const handle = setTimeout(() => {
      getCotisationsEstimate(totalCA, deductionSociale)
        .then((res) => { if (res) setUrssafAfter(res.urssafAnnuel); })
        .catch(() => {})
        .finally(() => setUrssafLoading(false));
    }, 400);
    return () => { clearTimeout(handle); setUrssafLoading(false); };
  }, [deductionSociale, totalCA, estimate]);

  // ── Carpimko : recalcul direct (pure JS) avec revenu net réduit ──
  const carpimkoAfter = useMemo(() => {
    if (!estimate || !hp) return null;
    const revenuNet = hp.taxRegime === "micro_bnc"
      ? estimate.revenuAnnualise * 0.66
      : estimate.revenuAnnualise;
    const revenuNetReduit = Math.max(0, revenuNet - deductionSociale);
    const r = calculerCotisationsCarpimko(revenuNetReduit, currentYear);
    // Conserve la part "retraite de base" déjà incluse dans estimate.carpimkoAnnuel
    const retraiteBaseShare = estimate.carpimkoAnnuel - calculerCotisationsCarpimko(revenuNet, currentYear).totalCarpimko;
    return Math.round(r.totalCarpimko + retraiteBaseShare);
  }, [estimate, hp, deductionSociale, currentYear]);

  // ── IR : recalcul direct (pure JS) avec revenu imposable réduit ──
  const fiscalBefore = useMemo(() => computeFiscal(estimate, hp, fiscal, currentYear, 0), [estimate, hp, fiscal, currentYear]);
  const fiscalAfter = useMemo(() => computeFiscal(estimate, hp, fiscal, currentYear, deductionFiscale), [estimate, hp, fiscal, currentYear, deductionFiscale]);

  const hasOptim = selected.size > 0;
  const urssafGain = hasOptim && urssafAfter != null && estimate
    ? estimate.urssafAnnuel - urssafAfter
    : 0;
  const gainAnnuel = hasOptim
    ? urssafGain
      + (estimate?.carpimkoAnnuel ?? 0) - (carpimkoAfter ?? 0)
      + fiscalBefore.impot - fiscalAfter.impot
    : 0;

  function toggle(key: OptimKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setAmount(key: OptimKey, value: number) {
    setAmounts((prev) => ({ ...prev, [key]: Math.max(0, Math.round(value)) }));
  }

  function exportPdf() {
    const selectedCards = cards.filter((c) => selected.has(c.key) && !(isMicroBNC && c.requiresBNCReel));
    const summary = [
      { label: `Décaissement ${currentYear}`, value: formatEur(decaissement) },
      { label: `Gain estimé ${currentYear + 1}`, value: hasOptim ? formatEur(gainAnnuel) : "—" },
      { label: "Déduction fiscale", value: formatEur(deductionFiscale) },
      { label: "Déduction sociale", value: formatEur(deductionSociale) },
    ];

    const headers = ["Optimisation", "Type", "Montant / an", "Déductible fiscal", "Déductible social"];
    const rows: (string | number)[][] = selectedCards.length > 0
      ? selectedCards.map((c) => [
          c.title,
          c.tag,
          formatEur(amounts[c.key] ?? 0),
          c.deductibleFiscal ? "Oui" : "Non",
          c.deductibleSocial ? "Oui" : "Non",
        ])
      : [["Aucune optimisation sélectionnée", "—", "—", "—", "—"]];

    // Bloc Impact ajouté après la table principale comme lignes supplémentaires.
    const impactRows: (string | number)[][] = [
      ["── Impact sur les cotisations sociales " + currentYear + " ──", "", "", "", ""],
      ["URSSAF", "", `Avant : ${estimate ? formatEur(estimate.urssafAnnuel) : "—"}`, `Après : ${estimate ? formatEur(estimate.urssafAnnuel) : "—"}`, ""],
      ["CARPIMKO", "", `Avant : ${estimate ? formatEur(estimate.carpimkoAnnuel) : "—"}`, `Après : ${carpimkoAfter != null ? formatEur(carpimkoAfter) : "—"}`, ""],
      ["── Impact sur la fiscalité " + currentYear + " ──", "", "", "", ""],
      ["Impôt sur le revenu", "", `Avant : ${estimate ? formatEur(fiscalBefore.impot) : "—"}`, `Après : ${estimate ? formatEur(fiscalAfter.impot) : "—"}`, ""],
      ["Tranche marginale", "", `${["0 %", "11 %", "30 %", "41 %", "45 %"][fiscalAfter.trancheIndex] ?? "—"}`, "", ""],
    ];

    downloadPDF(
      `optimisations_${currentYear}`,
      `Mes moyens d'optimisation ${currentYear}`,
      headers,
      [...rows, ...impactRows],
      { summary, subtitle: hp ? `${hp.firstName} ${hp.lastName}` : undefined },
    );
  }

  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl md:text-2xl font-bold">Mes moyens d&apos;optimisation</h1>
        <ExportButtons onPdf={exportPdf} disabled={!estimate} />
      </div>

      <div className="relative space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cards.filter((c) => c.available).map((card) => {
              const isDisabled = isMicroBNC && card.requiresBNCReel === true;
              const isChecked = !isDisabled && selected.has(card.key);
              const amount = amounts[card.key] ?? 0;
              const max = card.computeMax && estimate && ctx
                ? card.computeMax({ revenuPro: estimate.revenuAnnualise, pass: ctx.pass, smicMensuel: ctx.smicMensuel })
                : null;
              return (
                <div
                  key={card.key}
                  style={
                    card.bgImage
                      ? {
                          backgroundImage: `linear-gradient(135deg, rgba(15,15,20,0.78) 0%, rgba(15,15,20,0.55) 60%, rgba(15,15,20,0.35) 100%), url('${card.bgImage}')`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                  className={`group relative overflow-hidden rounded-xl p-5 min-h-[150px] flex flex-col justify-end text-white transition-all ${
                    isDisabled
                      ? "opacity-50 grayscale cursor-not-allowed"
                      : "hover:shadow-lg hover:-translate-y-0.5"
                  } ${isChecked ? "ring-2 ring-brand-400 ring-offset-2" : ""}`}
                  title={isDisabled ? "Non disponible en micro-BNC : l'abattement forfaitaire de 34 % couvre déjà toutes vos charges." : undefined}
                >
                  <label className={`absolute inset-0 ${isDisabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => !isDisabled && toggle(card.key)}
                      disabled={isDisabled}
                      className="sr-only"
                    />
                  </label>
                  <span
                    aria-hidden="true"
                    className={`absolute top-3 left-3 z-10 flex items-center justify-center w-6 h-6 rounded-md border-2 transition-all pointer-events-none ${
                      isDisabled
                        ? "bg-white/10 border-white/40"
                        : isChecked
                          ? "bg-brand-500 border-brand-500"
                          : "bg-white/20 border-white/70 backdrop-blur-sm"
                    }`}
                  >
                    {isChecked && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {isDisabled && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-white/70">
                        <line x1="5" y1="5" x2="19" y2="19" />
                      </svg>
                    )}
                  </span>
                  <div className="relative z-10 pointer-events-none">
                    <span
                      className={`self-start inline-block text-[8px] font-bold uppercase tracking-wider px-1.5 py-[1px] rounded-full mb-3 ${
                        card.tag === "Optimisation sociale"
                          ? "bg-menthe-400/90 text-menthe-950"
                          : "bg-violet-400/90 text-violet-950"
                      }`}
                    >
                      {card.tag}
                    </span>
                    <h3 className="text-base font-bold">{card.title}</h3>
                    {isDisabled ? (
                      <p className="text-xs text-white/80 leading-tight mt-1">
                        Non disponible en micro-BNC
                      </p>
                    ) : (
                      <p className="text-xs text-white/80 leading-tight max-h-0 opacity-0 overflow-hidden group-hover:max-h-24 group-hover:opacity-100 group-hover:mt-1 transition-all duration-300">
                        {card.description}
                      </p>
                    )}
                  </div>
                  {isChecked && (
                    <div
                      className="relative z-10 mt-3 flex items-center gap-2"
                      onClick={(e) => e.preventDefault()}
                    >
                      {card.amountAuto ? (
                        <span className="text-sm font-semibold text-white bg-white/15 backdrop-blur-sm rounded-md px-3 py-1.5 font-mono">
                          {formatEur(amount)} <span className="text-[10px] font-normal text-white/70">/ an (auto)</span>
                        </span>
                      ) : (
                        <>
                          <input
                            type="number"
                            min={0}
                            max={max ?? undefined}
                            step={100}
                            value={amount}
                            onChange={(e) => setAmount(card.key, Number(e.target.value))}
                            onClick={(e) => e.stopPropagation()}
                            className="w-28 text-sm font-semibold text-white bg-white/15 backdrop-blur-sm rounded-md px-3 py-1.5 outline-none focus:bg-white/25 [&::-webkit-inner-spin-button]:appearance-none font-mono"
                          />
                          <span className="text-[10px] text-white/70">
                            € / an{max != null ? ` · max ${formatEur(max)}` : ""}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <aside className="space-y-4">
          <ImpactSection
            title={
              <span className="inline-flex items-center gap-1.5">
                Impact sur mes cotisations sociales {currentYear}
                <CASourceIndicator source={effectiveCA.source} />
              </span>
            }
          >
            <ImpactRow
              label="Montant d'Urssaf"
              before={estimate ? formatEur(estimate.urssafAnnuel) : "—"}
              after={
                urssafLoading
                  ? "…"
                  : urssafAfter != null
                    ? formatEur(urssafAfter)
                    : estimate ? formatEur(estimate.urssafAnnuel) : "—"
              }
              showAfter={hasOptim}
              note={
                hasOptim && estimate?.urssafBase === "forfaitaire"
                  ? "Forfait début d'activité — effet en N+2 sur la régularisation"
                  : hasOptim && estimate?.urssafBase === "n2"
                    ? "Base N-2 figée — effet en N+2 sur la régularisation"
                    : undefined
              }
            />
            <ImpactRow
              label="Montant de Carpimko"
              before={estimate ? formatEur(estimate.carpimkoAnnuel) : "—"}
              after={carpimkoAfter != null ? formatEur(carpimkoAfter) : "—"}
              showAfter={hasOptim}
            />
          </ImpactSection>

          <ImpactSection
            title={
              <span className="inline-flex items-center gap-1.5">
                Impact sur ma fiscalité {currentYear}
                <CASourceIndicator source={effectiveCA.source} />
              </span>
            }
          >
            <ImpactRow
              label="Montant de l'imposition"
              before={estimate ? formatEur(fiscalBefore.impot) : "—"}
              after={estimate ? formatEur(fiscalAfter.impot) : "—"}
              showAfter={hasOptim}
            />
            <div className="pt-2">
              <div className="text-xs text-ardoise-500 mb-2">Tranche marginale d&apos;imposition</div>
              <div className="flex gap-1">
                {["0%", "11%", "30%", "41%", "45%"].map((t, i) => (
                  <span
                    key={t}
                    className={`flex-1 text-center text-[10px] font-bold py-1 rounded font-mono ${
                      i === fiscalAfter.trancheIndex
                        ? "bg-brand-500 text-white"
                        : "bg-ardoise-100 text-ardoise-500"
                    }`}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </ImpactSection>

          <ImpactSection title="Impact sur ma rémunération">
            <ImpactRow
              label={`Décaissement en ${currentYear}`}
              before={formatEur(decaissement)}
              after={formatEur(decaissement)}
              showAfter={false}
            />
            <ImpactRow
              label={`Gain en ${currentYear + 1}`}
              before={hasOptim ? formatEur(gainAnnuel) : "—"}
              after={hasOptim ? formatEur(gainAnnuel) : "—"}
              showAfter={false}
              valueClass={hasOptim && gainAnnuel > 0 ? "text-menthe-600" : undefined}
            />
          </ImpactSection>
        </aside>
      </div>

        <RecommendationsSection />
        <DataMissingOverlay bankConnected={bankConnected} />
      </div>

      <FloatingChat
        suggestions={[
          "Quelle optimisation me conviendrait le mieux ?",
          "Pourquoi mon URSSAF ne baisse pas avec les déductions ?",
          "Combien puis-je verser sur un PER cette année ?",
          "Le Madelin prévoyance vaut-il le coup pour moi ?",
        ]}
      />
    </div>
  );
}

function computeFiscal(
  estimate: CotisationsEstimate | null,
  hp: ReturnType<typeof usePractitioner>,
  fiscal: FiscalSituation,
  currentYear: number,
  deductionFiscale: number,
) {
  if (!estimate || !hp) return { impot: 0, trancheIndex: 0 };
  const revenuNet = hp.taxRegime === "micro_bnc"
    ? estimate.revenuAnnualise * 0.66
    : estimate.revenuAnnualise - estimate.urssafAnnuel - estimate.carpimkoAnnuel;
  const otherIncome = fiscal ? Number(fiscal.otherIncome) : 0;
  const revenuImposable = Math.max(0, Math.round(revenuNet + otherIncome - deductionFiscale));
  if (revenuImposable <= 0) return { impot: 0, trancheIndex: 0 };
  const { parts, partsDeReference } = computeParts({
    maritalStatus: (fiscal?.maritalStatus as "celibataire" | "marie" | "pacse") ?? "celibataire",
    dependentChildren: fiscal?.dependentChildren ?? 0,
    isSingleParent: fiscal?.isSingleParent ?? false,
  });
  const r = computeIR({ revenuImposable, parts, partsDeReference, incomeYear: currentYear });
  return { impot: r.impot, trancheIndex: r.currentTrancheIndex };
}

function ImpactSection({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-ardoise-200 bg-white p-4">
      <h3 className="text-base font-semibold text-ardoise-900 mb-4">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function ImpactRow({
  label,
  before,
  after,
  showAfter,
  note,
  valueClass,
}: {
  label: string;
  before: string;
  after: string;
  showAfter: boolean;
  note?: string;
  valueClass?: string;
}) {
  const sameValue = before === after;
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ardoise-500">{label}</span>
        {showAfter && !sameValue ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-ardoise-400 line-through font-mono">{before}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-ardoise-400">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
            <span className={`text-sm font-semibold font-mono ${valueClass ?? "text-brand-600"}`}>{after}</span>
          </div>
        ) : (
          <span className={`text-sm font-semibold font-mono ${valueClass ?? "text-ardoise-900"}`}>{before}</span>
        )}
      </div>
      {note && <div className="text-[10px] text-ardoise-400 mt-0.5">{note}</div>}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Section "Recommandations personnalisées"
// ───────────────────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<Recommendation["severity"], { dot: string; chip: string; chipLabel: string }> = {
  critical:    { dot: "bg-red-500",    chip: "bg-red-50 text-red-700",       chipLabel: "Critique" },
  warning:     { dot: "bg-amber-500",  chip: "bg-amber-50 text-amber-700",   chipLabel: "À surveiller" },
  opportunity: { dot: "bg-brand-500",  chip: "bg-brand-50 text-brand-700",   chipLabel: "Opportunité" },
  info:        { dot: "bg-ardoise-400",   chip: "bg-ardoise-100 text-ardoise-600",    chipLabel: "Info" },
};

function RecommendationsSection() {
  const [recos, setRecos] = useState<Recommendation[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    getRecommendationsAction().then((result) => {
      if (!cancelled) setRecos(result);
    }).catch(() => { if (!cancelled) setRecos([]); });
    return () => { cancelled = true; };
  }, []);

  if (recos === null) {
    return (
      <section className="rounded-xl border border-ardoise-200 bg-white p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-ardoise-200 rounded w-64" />
          <div className="h-3 bg-ardoise-200 rounded w-48" />
          <div className="h-16 bg-ardoise-100 rounded" />
          <div className="h-16 bg-ardoise-100 rounded" />
        </div>
      </section>
    );
  }

  if (recos.length === 0) {
    return (
      <section className="rounded-xl border border-ardoise-200 bg-white p-5">
        <h2 className="text-base font-bold text-ardoise-900 mb-1">Recommandations personnalisées</h2>
        <p className="text-xs text-ardoise-500">Aucune opportunité d&apos;optimisation détectée pour l&apos;instant. Continue comme ça.</p>
      </section>
    );
  }

  const totalImpact = recos.reduce((s, r) => s + (r.impactEur ?? 0), 0);
  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <section className="rounded-xl border border-ardoise-200 bg-white p-5">
      <div className="flex items-end justify-between flex-wrap gap-2 mb-4">
        <div>
          <h2 className="text-base font-bold text-ardoise-900">Recommandations personnalisées</h2>
          <p className="text-xs text-ardoise-500 mt-0.5">{recos.length} opportunité{recos.length > 1 ? "s" : ""} détectée{recos.length > 1 ? "s" : ""} d&apos;après tes données.</p>
        </div>
        {totalImpact !== 0 && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-ardoise-400">Impact cumulé estimé</p>
            <p className={`text-lg font-bold font-mono ${totalImpact > 0 ? "text-brand-600" : "text-red-600"}`}>
              {totalImpact > 0 ? "+" : ""}{formatEur(totalImpact)}/an
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {recos.map((r) => {
          const style = SEVERITY_STYLES[r.severity];
          const isExpanded = expanded.has(r.key);
          return (
            <div key={r.key} className="rounded-lg border border-ardoise-200/70 bg-ardoise-50/40 hover:bg-ardoise-50 transition-colors">
              <div className="flex items-start gap-3 p-3">
                <span className={`shrink-0 mt-1.5 w-2 h-2 rounded-full ${style.dot}`} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-0.5">
                    <h3 className="text-sm font-semibold text-ardoise-900">{r.title}</h3>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${style.chip}`}>{style.chipLabel}</span>
                  </div>
                  <p className="text-xs text-ardoise-600 leading-relaxed">{r.message}</p>
                  {isExpanded && r.evidence.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-[11px] text-ardoise-500">
                      {r.evidence.map((ev, i) => (
                        <li key={i} className="flex gap-1.5"><span className="text-ardoise-400">·</span><span>{ev}</span></li>
                      ))}
                    </ul>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      type="button"
                      onClick={() => toggle(r.key)}
                      className="text-[11px] font-medium text-ardoise-500 hover:text-ardoise-700 transition-colors"
                    >
                      {isExpanded ? "Masquer le détail" : "Voir le détail"}
                    </button>
                    {r.cta && (
                      <Link href={r.cta.href} className="text-[11px] font-medium text-brand-600 hover:text-brand-700 transition-colors">
                        {r.cta.label} →
                      </Link>
                    )}
                  </div>
                </div>
                {r.impactEur !== undefined && r.impactEur !== 0 && (
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-bold font-mono ${r.impactEur > 0 ? "text-brand-600" : "text-red-600"}`}>
                      {r.impactEur > 0 ? "+" : ""}{formatEur(r.impactEur)}
                    </p>
                    <p className="text-[10px] text-ardoise-400">/an</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
