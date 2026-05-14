"use client";

import { useState, useEffect, useMemo } from "react";
import { useData } from "@/providers/data-provider";
import { usePractitioner } from "@/providers/practitioner-provider";
import { getCotisationsEstimate, type CotisationsEstimate } from "@/actions/cotisations-estimate";
import { getFiscalSituationAction } from "@/actions/fiscal-situation";
import { computeIR, computeParts } from "@/lib/data/fr-tax";

const formatEur = (n: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

type FiscalSituation = Awaited<ReturnType<typeof getFiscalSituationAction>>;

type OptimCard = {
  title: string;
  tag: string;
  description: string;
  available: boolean;
  bgImage?: string;
};

const cards: OptimCard[] = [
  {
    title: "Plan Épargne Retraite",
    tag: "Optimisation fiscale",
    description: "Préparez votre retraite tout en réduisant votre impôt.",
    available: true,
    bgImage: "https://images.unsplash.com/photo-1633158829875-e5316a358c6f?w=800&q=80",
  },
  {
    title: "Prévoyance Pro",
    tag: "Optimisation fiscale",
    description: "Protégez votre activité en cas d'accident.",
    available: true,
    bgImage: "https://images.unsplash.com/photo-1637763723578-79a4ca9225f7?w=800&q=80",
  },
  {
    title: "Frais de blanchisserie",
    tag: "Optimisation sociale",
    description: "Augmentez vos frais déductibles.",
    available: true,
    bgImage: "https://images.unsplash.com/photo-1626806819282-2c1dc01a5e0c?w=800&q=80",
  },
  {
    title: "Chèques-vacances",
    tag: "Optimisation fiscale",
    description: "Augmentez votre pouvoir d'achat.",
    available: true,
    bgImage: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80",
  },
  {
    title: "Passage en SELARL",
    tag: "En cours de construction",
    description: "test text here",
    available: false,
  },
  {
    title: "Comité d'entreprise",
    tag: "En cours de construction",
    description: "test text here",
    available: false,
  },
  {
    title: "Achat de matériel",
    tag: "En cours de construction",
    description: "test text here",
    available: false,
  },
  {
    title: "Gestion temps travail",
    tag: "En cours de construction",
    description: "test text here",
    available: false,
  },
];

export function OptimizationClient() {
  const hp = usePractitioner();
  const { facturationSummary } = useData();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [estimate, setEstimate] = useState<CotisationsEstimate | null>(null);
  const [fiscal, setFiscal] = useState<FiscalSituation>(null);

  const currentYear = new Date().getFullYear();
  const totalCA = facturationSummary?.byStatus.paye.total ?? 0;

  useEffect(() => {
    if (totalCA <= 0) return;
    getCotisationsEstimate(totalCA)
      .then((res) => { if (res) setEstimate(res); })
      .catch(() => {});
  }, [totalCA]);

  useEffect(() => {
    getFiscalSituationAction(currentYear)
      .then((res) => setFiscal(res))
      .catch(() => {});
  }, [currentYear]);

  const fiscalImpact = useMemo(() => {
    if (!estimate || !hp) return { impot: 0, trancheIndex: 0 };
    const revenuNet = hp.taxRegime === "micro_bnc"
      ? estimate.revenuAnnualise * 0.66
      : estimate.revenuAnnualise - estimate.urssafAnnuel - estimate.carpimkoAnnuel;
    const otherIncome = fiscal ? Number(fiscal.otherIncome) : 0;
    const revenuImposable = Math.max(0, Math.round(revenuNet + otherIncome));
    if (revenuImposable <= 0) return { impot: 0, trancheIndex: 0 };
    const { parts, partsDeReference } = computeParts({
      maritalStatus: (fiscal?.maritalStatus as "celibataire" | "marie" | "pacse") ?? "celibataire",
      dependentChildren: fiscal?.dependentChildren ?? 0,
      isSingleParent: fiscal?.isSingleParent ?? false,
    });
    const r = computeIR({ revenuImposable, parts, partsDeReference, incomeYear: currentYear });
    return { impot: r.impot, trancheIndex: r.currentTrancheIndex };
  }, [estimate, hp, fiscal, currentYear]);

  function toggle(title: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Mes moyens d&apos;optimisation</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cards.filter((c) => c.available).map((card) => {
              const isChecked = selected.has(card.title);
              return (
                <label
                  key={card.title}
                  style={
                    card.bgImage
                      ? {
                          backgroundImage: `linear-gradient(135deg, rgba(15,15,20,0.78) 0%, rgba(15,15,20,0.55) 60%, rgba(15,15,20,0.35) 100%), url('${card.bgImage}')`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                  className={`group relative overflow-hidden rounded-xl p-5 min-h-[150px] flex flex-col justify-end text-white cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 ${
                    isChecked ? "ring-2 ring-brand-400 ring-offset-2" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(card.title)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`absolute top-3 left-3 flex items-center justify-center w-6 h-6 rounded-md border-2 transition-all ${
                      isChecked
                        ? "bg-brand-500 border-brand-500"
                        : "bg-white/20 border-white/70 backdrop-blur-sm"
                    }`}
                  >
                    {isChecked && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span
                    className={`self-start inline-block text-[8px] font-bold uppercase tracking-wider px-1.5 py-[1px] rounded-full mb-3 ${
                      card.tag === "Optimisation sociale"
                        ? "bg-emerald-400/90 text-emerald-950"
                        : "bg-violet-400/90 text-violet-950"
                    }`}
                  >
                    {card.tag}
                  </span>
                  <h3 className="text-base font-bold">{card.title}</h3>
                  <p className="text-xs text-white/80 leading-tight max-h-0 opacity-0 overflow-hidden group-hover:max-h-24 group-hover:opacity-100 group-hover:mt-1 transition-all duration-300">
                    {card.description}
                  </p>
                </label>
              );
            })}
          </div>
        </section>

        <aside className="space-y-4">
          <ImpactSection title={`Impact sur mes cotisations sociales ${currentYear}`}>
            <ImpactRow
              label="Montant d'Urssaf"
              value={estimate ? formatEur(estimate.urssafAnnuel) : "—"}
            />
            <ImpactRow
              label="Montant de Carpimko"
              value={estimate ? formatEur(estimate.carpimkoAnnuel) : "—"}
            />
          </ImpactSection>

          <ImpactSection title={`Impact sur ma fiscalité ${currentYear}`}>
            <ImpactRow
              label="Montant de l'imposition"
              value={estimate ? formatEur(fiscalImpact.impot) : "—"}
            />
            <div className="pt-2">
              <div className="text-xs text-gray-500 mb-2">Tranche marginale d&apos;imposition</div>
              <div className="flex gap-1">
                {["0%", "11%", "30%", "41%", "45%"].map((t, i) => (
                  <span
                    key={t}
                    className={`flex-1 text-center text-[10px] font-bold py-1 rounded ${
                      i === fiscalImpact.trancheIndex
                        ? "bg-brand-500 text-white"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </ImpactSection>

          <ImpactSection title="Impact sur ma rémunération">
            <ImpactRow label={`Décaissement en ${currentYear}`} value={formatEur(0)} />
            <ImpactRow label={`Gain en ${currentYear + 1}`} value="—" />
          </ImpactSection>
        </aside>
      </div>
    </div>
  );
}

function ImpactSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-base font-semibold text-gray-900 mb-4">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function ImpactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-900">{value}</span>
    </div>
  );
}
