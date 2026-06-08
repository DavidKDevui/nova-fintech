"use client";

import { useState } from "react";
import {
  CALENDAR,
  MONTH_NAMES,
  EVENT_DOT,
  EVENT_BADGE,
  EVENT_LABEL,
  getUpcomingEvents,
} from "@/lib/data/fiscal-calendar";

export function HelpClient() {
  const [openSection, setOpenSection] = useState<string | null>("comprendre");
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();
  const upcoming = getUpcomingEvents(currentMonth, currentDay);

  function toggle(id: string) {
    setOpenSection(openSection === id ? null : id);
  }

  return (
    <div className="max-w-3xl space-y-8">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold mb-2">Aide — Comprendre vos charges</h1>
        <p className="text-sm text-ardoise-500 leading-relaxed">
          En tant qu&apos;infirmier(e) libéral(e), vous êtes soumis(e) à plusieurs prélèvements obligatoires.
          Cette page vous explique simplement <strong>quoi</strong>, <strong>combien</strong> et <strong>quand</strong> vous payez.
        </p>
      </div>

      {/* ── En bref ── */}
      <div className="bg-violet-50 border border-violet-200 rounded-lg p-5">
        <h2 className="text-sm font-bold text-violet-900 mb-3">En bref : où va votre argent ?</h2>
        <p className="text-sm text-violet-800 leading-relaxed mb-4">
          Sur un chiffre d&apos;affaires de <strong>70 000 EUR</strong> (bénéfice net d&apos;environ 50 000 EUR),
          vous reversez entre <strong>25 000 et 31 000 EUR</strong> par an en impôts et cotisations.
          Il vous reste <strong>environ 40 à 50 EUR sur chaque 100 EUR</strong> facturé.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Impôt sur le revenu", value: "7-11%", sub: "du CA", color: "bg-violet-100 text-violet-800" },
            { label: "URSSAF", value: "14-17%", sub: "du CA", color: "bg-violet-100 text-violet-800" },
            { label: "Retraite CARPIMKO", value: "~14%", sub: "du CA", color: "bg-amber-100 text-amber-800" },
            { label: "Impôts locaux", value: "0-2%", sub: "du CA", color: "bg-menthe-100 text-menthe-800" },
          ].map((item) => (
            <div key={item.label} className={`${item.color} rounded-lg p-3 text-center`}>
              <p className="text-lg font-bold">{item.value}</p>
              <p className="text-[11px] opacity-70">{item.sub}</p>
              <p className="text-[11px] font-medium mt-1">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Prochaines échéances ── */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-ardoise-100">
          <h2 className="text-sm font-bold text-ardoise-900">Vos prochaines échéances</h2>
          <p className="text-xs text-ardoise-400 mt-0.5">Les dates à retenir dans les semaines qui viennent</p>
        </div>
        <div className="divide-y divide-ardoise-100">
          {upcoming.slice(0, 6).map((evt, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <div className="w-14 shrink-0">
                <p className="text-xs text-ardoise-400">{MONTH_NAMES[evt.month]?.slice(0, 3)}</p>
                <p className="text-lg font-bold text-ardoise-900 -mt-0.5">{evt.day}</p>
              </div>
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${EVENT_DOT[evt.type]}`} />
              <p className="text-sm text-ardoise-700 flex-1">{evt.label}</p>
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${EVENT_BADGE[evt.type]}`}>
                {EVENT_LABEL[evt.type]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Sections accordeon ── */}

      {/* 1. Comprendre les prelevements */}
      <Section
        title="Comprendre vos prélèvements"
        subtitle="Les 4 grandes familles de charges que vous payez"
        open={openSection === "comprendre"}
        onToggle={() => toggle("comprendre")}
      >
        <div className="space-y-5">
          <Explainer
            color="violet"
            title="Impôt sur le revenu"
            what="C'est l'impôt que tout le monde paie sur ses revenus. En libéral, vous êtes imposé sur votre bénéfice (BNC = recettes - charges)."
            howMuch="De 0 à 45% selon les tranches. En pratique, 7 à 11% de votre CA."
            when="Prélevé automatiquement le 15 de chaque mois (ou chaque trimestre) via le prélèvement à la source."
            tip="Vous pouvez moduler vos acomptes si vos revenus varient. Rendez-vous sur impots.gouv.fr, rubrique 'Gérer mon prélèvement à la source'."
          />
          <Explainer
            color="blue"
            title="Cotisations URSSAF"
            what="Ce sont vos cotisations sociales : maladie (8,5%), CSG/CRDS (9,7%), allocations familiales (0 à 3,1%), formation, invalidité-décès. Elles financent votre couverture santé, vos indemnités journalières, etc."
            howMuch="Environ 18% de votre BNC au total. C'est le plus gros poste après l'impôt."
            when="Le 5 ou le 20 de chaque mois (au choix). Ou trimestriel : 5 février, 5 mai, 5 août, 5 novembre."
            tip="Les cotisations sont d'abord provisionnelles (basées sur N-2), puis régularisées après votre déclaration. Si vos revenus augmentent, anticipez le complément !"
          />
          <Explainer
            color="amber"
            title="Retraite CARPIMKO"
            what="C'est votre caisse de retraite obligatoire. Elle couvre la retraite de base, la complémentaire, l'invalidité-décès et l'ASV (si conventionné)."
            howMuch="Environ 9 600 EUR/an. Retraite de base : 8,23% + 1,87%. Complémentaire : forfait 2 312 EUR + 3%."
            when="Le 10 de chaque mois, de janvier à octobre (10 prélèvements). Pas de prélèvement en novembre et décembre."
            tip="La 1re année d'installation, les cotisations sont réduites : environ 3 500 EUR seulement."
          />
          <Explainer
            color="emerald"
            title="Impôts locaux (CFE, taxe foncière)"
            what="La CFE est un impôt local que vous payez pour exercer dans votre commune. La taxe foncière s'ajoute si vous êtes propriétaire de votre local."
            howMuch="CFE : de 250 à 1 500 EUR selon la commune. Taxe foncière : variable."
            when="CFE : soldé le 15 décembre (acompte 15 juin si > 3 000 EUR). Taxe foncière : 15-20 octobre."
            tip="Vous êtes exonéré(e) de CFE votre 1re année d'activité. En ZRR ou commune < 2 000 hab., des exonérations supplémentaires existent."
          />
        </div>
      </Section>

      {/* 2. TVA et CVAE */}
      <Section
        title="Ce que vous ne payez PAS"
        subtitle="Bonne nouvelle : certaines taxes ne vous concernent pas"
        open={openSection === "exonerations"}
        onToggle={() => toggle("exonerations")}
      >
        <div className="space-y-3">
          <div className="flex gap-3 items-start bg-menthe-50 border border-menthe-200 rounded-lg p-4">
            <span className="text-menthe-600 text-lg mt-0.5">&#10003;</span>
            <div>
              <p className="text-sm font-semibold text-menthe-900">TVA : exonéré(e)</p>
              <p className="text-sm text-menthe-700 mt-1">
                Vos actes de soins sont exonérés de TVA (article 261-4-1 du CGI).
                Vous ne facturez pas de TVA, vous ne la déclarez pas, vous ne la payez pas.
                Seules des activités annexes (conseil, formation, vente) pourraient y être soumises.
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-start bg-menthe-50 border border-menthe-200 rounded-lg p-4">
            <span className="text-menthe-600 text-lg mt-0.5">&#10003;</span>
            <div>
              <p className="text-sm font-semibold text-menthe-900">CVAE : non concerné(e)</p>
              <p className="text-sm text-menthe-700 mt-1">
                La CVAE ne s&apos;applique qu&apos;au-delà de 500 000 EUR de chiffre d&apos;affaires.
                En pratique, aucun(e) IDEL n&apos;est concerné(e).
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* 3. Declarations */}
      <Section
        title="Vos déclarations obligatoires"
        subtitle="Quels formulaires remplir et quand les envoyer"
        open={openSection === "declarations"}
        onToggle={() => toggle("declarations")}
      >
        <div className="space-y-3">
          {[
            {
              name: "Déclaration 2035",
              desc: "Votre déclaration de résultat BNC (régime réel). Elle détaille vos recettes et vos charges déductibles.",
              deadline: "5 mai (papier) / 20 mai (télétransmission)",
              who: "Uniquement si vous êtes au régime de la déclaration contrôlée.",
            },
            {
              name: "Déclaration 2042 C Pro",
              desc: "Votre déclaration de revenus professionnels, intégrée à la déclaration de revenus classique.",
              deadline: "21 mai (dept 01-19), 28 mai (dept 20-54), 4 juin (dept 55-976)",
              who: "Tous les IDEL, quel que soit le régime.",
            },
            {
              name: "DS PAMC",
              desc: "Déclaration sociale des praticiens et auxiliaires médicaux. Depuis 2023, elle est intégrée directement à votre déclaration de revenus sur impots.gouv.fr.",
              deadline: "Même date que la 2042 C Pro",
              who: "Tous les IDEL conventionnés.",
            },
            {
              name: "DAS2",
              desc: "Déclaration des honoraires que vous avez versés à des tiers (rétrocessions, remplacements...) au-delà de 1 200 EUR par bénéficiaire.",
              deadline: "5 mai (papier) / 20 mai (en ligne)",
              who: "Si vous avez versé des honoraires à un tiers.",
            },
          ].map((decl) => (
            <div key={decl.name} className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-4">
              <p className="text-sm font-semibold text-ardoise-900">{decl.name}</p>
              <p className="text-sm text-ardoise-600 mt-1">{decl.desc}</p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3">
                <span className="text-xs text-ardoise-500">
                  Date limite : <span className="font-semibold text-ardoise-800">{decl.deadline}</span>
                </span>
                <span className="text-xs text-ardoise-400">{decl.who}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 4. Calendrier mensuel */}
      <Section
        title="Calendrier fiscal mois par mois"
        subtitle="Sélectionnez un mois pour voir toutes les échéances"
        open={openSection === "calendrier"}
        onToggle={() => toggle("calendrier")}
      >
        <div className="space-y-4">
          <div className="flex gap-1 flex-wrap">
            {MONTH_NAMES.map((name, i) => (
              <button
                key={i}
                onClick={() => setCalMonth(i)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                  calMonth === i
                    ? "bg-ardoise-900 text-white"
                    : i === currentMonth
                      ? "bg-violet-50 text-violet-700 font-semibold"
                      : "bg-ardoise-100 text-ardoise-500 hover:text-ardoise-900"
                }`}
              >
                {name.slice(0, 3)}
              </button>
            ))}
          </div>

          <div className="bg-ardoise-50 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-ardoise-200">
              <p className="text-sm font-semibold text-ardoise-900">{MONTH_NAMES[calMonth]} 2026</p>
            </div>
            <div className="divide-y divide-ardoise-200">
              {(CALENDAR[calMonth] || []).map((evt, i) => {
                const isPast = calMonth < currentMonth || (calMonth === currentMonth && evt.day < currentDay);
                const isToday = calMonth === currentMonth && evt.day === currentDay;
                return (
                  <div key={i} className={`flex items-center gap-4 px-4 py-3 ${isToday ? "bg-violet-50" : isPast ? "opacity-40" : ""}`}>
                    <span className={`text-base font-bold w-8 text-center shrink-0 ${isToday ? "text-violet-600" : "text-ardoise-900"}`}>
                      {evt.day}
                    </span>
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${EVENT_DOT[evt.type]}`} />
                    <p className="text-sm text-ardoise-700 flex-1">{evt.label}</p>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full shrink-0 ${EVENT_BADGE[evt.type]}`}>
                      {EVENT_LABEL[evt.type]}
                    </span>
                  </div>
                );
              })}
              {(!CALENDAR[calMonth] || CALENDAR[calMonth].length === 0) && (
                <p className="px-4 py-5 text-sm text-ardoise-400 text-center">Aucune échéance ce mois-ci.</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ardoise-500">
            {Object.entries(EVENT_DOT).map(([key, color]) => (
              <span key={key} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${color}`} /> {EVENT_LABEL[key]}
              </span>
            ))}
          </div>
        </div>
      </Section>

      {/* 5. 1re annee */}
      <Section
        title="Première année d'installation"
        subtitle="Ce qui change quand vous débutez en libéral"
        open={openSection === "premiere-annee"}
        onToggle={() => toggle("premiere-annee")}
      >
        <div className="space-y-3">
          {[
            { label: "URSSAF", text: "Cotisations provisionnelles réduites (base forfaitaire basse). Régularisation l'année suivante." },
            { label: "CARPIMKO", text: "Cotisations réduites la 1re année : environ 3 500 à 3 600 EUR au lieu de ~9 600 EUR." },
            { label: "CFE", text: "Exonération totale la 1re année civile d'activité." },
            { label: "Impôt sur le revenu", text: "Acompte PAS à 0 EUR tant que vous n'avez pas fait votre 1re déclaration. La régularisation interviendra l'année suivante." },
            { label: "Taxe foncière", text: "Aucune particularité — dépend uniquement de la propriété du local." },
          ].map((item) => (
            <div key={item.label} className="flex gap-3 items-start">
              <span className="text-xs font-bold text-ardoise-900 bg-ardoise-100 rounded px-2 py-1 shrink-0 w-24 text-center">{item.label}</span>
              <p className="text-sm text-ardoise-600">{item.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <p className="text-xs text-ardoise-400 text-center pb-4">
        Données fiscales 2026 — À titre informatif, ne se substitue pas à un expert-comptable.
      </p>
    </div>
  );
}

/* ────────────────────────────── COMPONENTS ──────────────────────── */

function Section({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/40 transition-colors"
      >
        <div>
          <p className="text-sm font-bold text-ardoise-900">{title}</p>
          <p className="text-xs text-ardoise-400 mt-0.5">{subtitle}</p>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18" height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-ardoise-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="px-5 pb-5 border-t border-ardoise-100 pt-4">{children}</div>}
    </div>
  );
}

const EXPLAINER_COLORS: Record<string, { border: string; title: string; accent: string }> = {
  violet: { border: "border-l-violet-400", title: "text-violet-900", accent: "text-violet-700" },
  blue: { border: "border-l-violet-400", title: "text-violet-900", accent: "text-violet-700" },
  amber: { border: "border-l-amber-400", title: "text-amber-900", accent: "text-amber-700" },
  emerald: { border: "border-l-menthe-400", title: "text-menthe-900", accent: "text-menthe-700" },
};

function Explainer({
  color,
  title,
  what,
  howMuch,
  when,
  tip,
}: {
  color: string;
  title: string;
  what: string;
  howMuch: string;
  when: string;
  tip: string;
}) {
  const c = EXPLAINER_COLORS[color] || EXPLAINER_COLORS.violet;
  return (
    <div className={`border-l-4 ${c.border} pl-4 space-y-2`}>
      <p className={`text-sm font-bold ${c.title}`}>{title}</p>
      <div>
        <p className={`text-xs font-semibold uppercase tracking-wider ${c.accent} opacity-60`}>C&apos;est quoi ?</p>
        <p className="text-sm text-ardoise-600 mt-0.5">{what}</p>
      </div>
      <div>
        <p className={`text-xs font-semibold uppercase tracking-wider ${c.accent} opacity-60`}>Combien ?</p>
        <p className="text-sm text-ardoise-600 mt-0.5">{howMuch}</p>
      </div>
      <div>
        <p className={`text-xs font-semibold uppercase tracking-wider ${c.accent} opacity-60`}>Quand ?</p>
        <p className="text-sm text-ardoise-600 mt-0.5">{when}</p>
      </div>
      <div className="bg-ardoise-50 rounded px-3 py-2 mt-1">
        <p className="text-xs text-ardoise-500"><span className="font-semibold text-ardoise-700">Bon à savoir :</span> {tip}</p>
      </div>
    </div>
  );
}
