"use client";

import Link from "next/link";
import type { HealthScore } from "@/actions/health-score";

function scoreColor(score: number): { text: string; bg: string; bar: string; label: string } {
  if (score >= 80) return { text: "text-green-600", bg: "bg-green-50", bar: "bg-green-500", label: "Excellent" };
  if (score >= 60) return { text: "text-emerald-600", bg: "bg-emerald-50", bar: "bg-emerald-500", label: "Bon" };
  if (score >= 40) return { text: "text-amber-600", bg: "bg-amber-50", bar: "bg-amber-500", label: "À surveiller" };
  return { text: "text-red-600", bg: "bg-red-50", bar: "bg-red-500", label: "Critique" };
}

function severityStyle(s: "info" | "warning" | "critical"): { icon: string; text: string } {
  if (s === "critical") return { icon: "text-red-500", text: "text-red-900" };
  if (s === "warning") return { icon: "text-amber-500", text: "text-amber-900" };
  return { icon: "text-gray-400", text: "text-gray-700" };
}

export function HealthScoreCard({ loading, data }: { loading: boolean; data: HealthScore | null }) {
  if (loading) {
    return (
      <div className="rounded-lg bg-white backdrop-blur-xl border border-gray-200/70 p-4 mb-2">
        <div className="animate-pulse space-y-2">
          <div className="h-3 bg-gray-200 rounded w-32" />
          <div className="h-7 bg-gray-200 rounded w-20" />
          <div className="h-1.5 bg-gray-200 rounded w-full" />
          <div className="h-1.5 bg-gray-200 rounded w-full" />
        </div>
      </div>
    );
  }
  if (!data) return null;
  const color = scoreColor(data.score);
  const availableSubs = data.subscores.filter((s) => s.available);

  return (
    <div className="rounded-lg bg-white backdrop-blur-xl border border-gray-200/70 px-4 py-3.5 mb-2">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Score de santé financière</p>
          <p className={`text-xs font-medium ${color.text}`}>{color.label}</p>
        </div>
        <div className={`flex items-baseline gap-1 ${color.text}`}>
          <span className="text-3xl font-bold">{data.score}</span>
          <span className="text-sm font-medium text-gray-400">/100</span>
        </div>
      </div>

      <div className="space-y-2.5 mb-3">
        {data.subscores.map((s) => {
          const sColor = scoreColor(s.score);
          return (
            <div key={s.key}>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] w-36 shrink-0 truncate ${s.available ? "text-gray-700" : "text-gray-400"}`}>
                  {s.label}
                </span>
                <div
                  className={`flex-1 h-1.5 rounded-full overflow-hidden ${
                    s.available
                      ? "bg-gray-100"
                      : "bg-transparent border border-dashed border-gray-200"
                  }`}
                >
                  {s.available && (
                    <div
                      className={`h-full ${sColor.bar} transition-all`}
                      style={{ width: `${s.score}%` }}
                    />
                  )}
                </div>
                <span
                  className={`text-[11px] font-medium w-12 text-right tabular-nums ${
                    s.available ? sColor.text : "text-gray-300"
                  }`}
                >
                  {s.available ? (
                    <>
                      {Math.round(s.score)}
                      <span className="text-gray-400 font-normal">/100</span>
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
              <p
                className={`text-[10px] mt-0.5 ml-0 ${
                  s.available ? "text-gray-400" : "text-gray-400 italic"
                }`}
              >
                {s.detail}
              </p>
            </div>
          );
        })}
      </div>

      {availableSubs.length < data.subscores.length && (
        <p className="text-[10px] text-gray-400 mb-2">
          Score partiel basé sur {availableSubs.length} indicateur{availableSubs.length > 1 ? "s" : ""} sur {data.subscores.length}.
        </p>
      )}

      {data.recommendations.length > 0 && (
        <div className="border-t border-gray-100 pt-2.5 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Recommandations</p>
          {data.recommendations.map((r) => {
            const style = severityStyle(r.severity);
            return (
              <div key={r.key} className="flex items-start gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 mt-0.5 ${style.icon}`}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs ${style.text}`}>{r.message}</p>
                  {r.cta && (
                    <Link href={r.cta.href} className="text-[11px] font-medium text-brand-600 hover:text-brand-700 mt-0.5 inline-block transition-colors">
                      {r.cta.label} →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
