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

const ICON_PROPS = { xmlns: "http://www.w3.org/2000/svg", width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/* Icône par sous-score. */
const ICON: Record<HealthSubscoreKey, React.ReactNode> = {
  treasury: <svg {...ICON_PROPS}><rect x="2" y="6" width="20" height="14" rx="2.5" /><path d="M2 10h20" /><circle cx="17" cy="15" r="1" /></svg>,
  charges_ratio: <svg {...ICON_PROPS}><path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" /><path d="m3 12 9 4.5 9-4.5" /><path d="m3 16.5 9 4.5 9-4.5" /></svg>,
  data_quality: <svg {...ICON_PROPS}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" /><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" /></svg>,
  collection_rate: <svg {...ICON_PROPS}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 4 21 10 15 10" /></svg>,
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
    <li className="flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
        {ICON[sub.key]}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${sub.available ? "text-ardoise-900" : "text-ardoise-400"}`}>{sub.label}</p>
        <p className="text-xs text-ardoise-400 leading-snug line-clamp-2">{sub.detail}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
    </li>
  );
}
