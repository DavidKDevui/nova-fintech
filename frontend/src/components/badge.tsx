import type { ReactNode } from "react";

// Badges & statuts charte ActiDec v3.
// success = menthe (Payé, gain) · action = orange (À provisionner) ·
// alerte = rouge (En retard) · neutre = ardoise (Brouillon) · info = violet.
export type BadgeTone = "success" | "action" | "alerte" | "neutre" | "info";

const TONES: Record<BadgeTone, { text: string; bg: string; dot: string }> = {
  success: { text: "text-menthe-700", bg: "bg-menthe-50", dot: "bg-menthe-500" },
  action: { text: "text-brand-700", bg: "bg-brand-50", dot: "bg-brand-500" },
  alerte: { text: "text-alerte-600", bg: "bg-alerte-50", dot: "bg-alerte-500" },
  neutre: { text: "text-ardoise-600", bg: "bg-ardoise-100", dot: "bg-ardoise-400" },
  info: { text: "text-violet-700", bg: "bg-violet-100", dot: "bg-violet-500" },
};

export function Badge({
  tone = "neutre",
  dot = false,
  mono = false,
  className = "",
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  mono?: boolean; // badges-tags chiffrés/codes (URSSAF, CARPIMKO…) en JetBrains Mono
  className?: string;
  children: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${t.bg} ${t.text} ${mono ? "font-mono" : ""} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.dot}`} />}
      {children}
    </span>
  );
}
