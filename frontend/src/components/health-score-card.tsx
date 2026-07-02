"use client";

import type { HealthScore, HealthSubscore, HealthSubscoreKey } from "@/actions/health-score";

/* Couleur de la jauge selon le score global. */
function gaugeColorClass(score: number): string {
  if (score >= 60) return "text-menthe-500";
  if (score >= 40) return "text-amber-500";
  return "text-red-500";
}

/* Badge de statut d'un sous-score. */
function statusBadge(score: number, available: boolean): { label: string; cls: string } {
  if (!available) return { label: "Indispo.", cls: "bg-ardoise-100 text-ardoise-400" };
  if (score >= 60) return { label: "Bon", cls: "bg-menthe-50 text-menthe-700" };
  if (score >= 40) return { label: "À améliorer", cls: "bg-amber-50 text-amber-700" };
  return { label: "Critique", cls: "bg-red-50 text-red-600" };
}

/* Icône par sous-score — pleines (mêmes codes que les cartes du haut). */
const ISVG = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" } as const;
const ICON: Record<HealthSubscoreKey, React.ReactNode> = {
  // Trésorerie → portefeuille
  treasury: <svg {...ISVG}><rect x="2" y="6" width="20" height="14" rx="2.5" fill="currentColor" opacity="0.5" /><rect x="2" y="6" width="20" height="4" rx="2.5" fill="currentColor" opacity="0.7" /><circle cx="17" cy="15" r="1.5" fill="currentColor" opacity="0.35" /></svg>,
  // Poids des charges → part / camembert
  charges_ratio: <svg {...ISVG}><circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.4" /><path d="M12 3a9 9 0 0 1 9 9h-9z" fill="currentColor" opacity="0.75" /></svg>,
  // Complétude des données → base de données
  data_quality: <svg {...ISVG}><path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6z" fill="currentColor" opacity="0.4" /><ellipse cx="12" cy="6" rx="8" ry="3" fill="currentColor" opacity="0.7" /></svg>,
  // Recouvrement → pile de pièces
  collection_rate: <svg {...ISVG}><ellipse cx="12" cy="7" rx="7" ry="3" fill="currentColor" opacity="0.7" /><path d="M5 7v5c0 1.66 3.13 3 7 3s7-1.34 7-3V7" fill="currentColor" opacity="0.5" /><path d="M5 12v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" fill="currentColor" opacity="0.35" /></svg>,
};

export function HealthScoreCard({ loading, data }: { loading: boolean; data: HealthScore | null }) {
  if (loading) {
    return (
      <div className="rounded-[14px] bg-white border border-ardoise-200/70 shadow-1 p-5 mb-2">
        <div className="animate-pulse flex flex-col sm:flex-row items-center gap-6">
          <div className="h-[132px] w-[132px] rounded-full bg-ardoise-200 shrink-0" />
          <div className="flex-1 w-full space-y-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 bg-ardoise-200 rounded" />)}
          </div>
        </div>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="rounded-[14px] bg-white border border-ardoise-200/70 shadow-1 p-5 mb-2">
      <h2 className="text-lg font-bold text-ardoise-900 mb-4">Score de santé financière</h2>

      <div className="flex flex-col sm:flex-row items-center gap-6">
        <ScoreGauge score={data.score} colorClass={gaugeColorClass(data.score)} />

        <ul className="flex-1 w-full min-w-0 space-y-2.5">
          {data.subscores.map((s) => (
            <SubscoreRow key={s.key} sub={s} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function ScoreGauge({ score, colorClass }: { score: number; colorClass: string }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="relative shrink-0 w-[132px] h-[132px]">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" stroke="currentColor" className="text-ardoise-100" />
        <circle
          cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round" stroke="currentColor"
          className={`${colorClass} transition-all`}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-ardoise-900 font-mono leading-none">{score}</span>
        <span className="text-xs text-ardoise-400 mt-1">/100</span>
      </div>
    </div>
  );
}

function SubscoreRow({ sub }: { sub: HealthSubscore }) {
  const badge = statusBadge(sub.score, sub.available);
  return (
    <li>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0 text-[11px] font-mono font-medium uppercase tracking-wide text-ardoise-500">
          <span className="shrink-0 text-violet-700">{ICON[sub.key]}</span>
          <span className="truncate">{sub.label}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>{badge.label}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-ardoise-500 leading-snug line-clamp-2">{sub.detail}</p>
    </li>
  );
}
