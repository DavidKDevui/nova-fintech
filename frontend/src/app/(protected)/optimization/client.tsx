"use client";

import { useState } from "react";

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
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
        <h1 className="text-xl md:text-2xl font-bold mb-2">Optimisation</h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          Pistes d&apos;optimisation fiscale et sociale pour votre activité.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-sm font-bold text-gray-900 mb-4">
            Mes moyens d&apos;optimisation
          </h2>
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
                  <p className="text-sm text-white/80 leading-tight max-h-0 opacity-0 overflow-hidden group-hover:max-h-24 group-hover:opacity-100 group-hover:mt-1 transition-all duration-300">
                    {card.description}
                  </p>
                </label>
              );
            })}
          </div>
        </section>

        <aside className="space-y-4">
          <ImpactSection title="Impact sur mes cotisations sociales 2026">
            <ImpactRow label="Montant d'Urssaf" before="-268 €" after="0 €" />
            <ImpactRow label="Montant de Carpimko" before="3 774 €" after="0 €" />
          </ImpactSection>

          <ImpactSection title="Impact sur ma fiscalité 2026">
            <ImpactRow label="Montant de l'imposition" before="0 €" after="0 €" />
            <div className="pt-2">
              <div className="text-xs text-gray-500 mb-2">Tranche marginale d&apos;imposition</div>
              <div className="flex gap-1">
                {["0%", "11%", "30%", "41%", "45%"].map((t, i) => (
                  <span
                    key={t}
                    className={`flex-1 text-center text-[10px] font-bold py-1 rounded ${
                      i === 0
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
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-gray-500">Décaissement en 2026</span>
              <span className="text-sm font-semibold text-gray-900">0 €</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-gray-500">Gain en 2027</span>
              <span className="text-sm font-semibold text-gray-400">—</span>
            </div>
          </ImpactSection>
        </aside>
      </div>
    </div>
  );
}

function ImpactSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function ImpactRow({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-900 line-through opacity-50">
          {before}
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
        <span className="text-sm font-bold text-brand-600">{after}</span>
      </div>
    </div>
  );
}
