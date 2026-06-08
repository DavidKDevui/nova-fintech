import type { ComponentProps } from "react";

type Variant = "primary" | "cta" | "secondary" | "ghost" | "danger";
type Size = "default" | "compact";

// Boutons charte ActiDec v3 — radius 10px, padding 11×18, focus ring violet.
const base =
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-all " +
  "active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-900/30 " +
  "disabled:opacity-50 disabled:pointer-events-none";

const VARIANTS: Record<Variant, string> = {
  // Primaire — fond violet, action principale
  primary: "bg-violet-900 text-white hover:bg-violet-800",
  // CTA — fond orange, mise en avant / conversion
  cta: "bg-brand-600 text-white hover:bg-brand-700",
  // Secondaire — fond blanc, bordure, texte encre
  secondary: "bg-white text-ardoise-900 border border-ardoise-200 hover:bg-ardoise-50",
  // Ghost — texte seul (ex. « Annuler »)
  ghost: "text-ardoise-600 hover:text-ardoise-900 hover:bg-ardoise-50",
  // Danger — fond rosé, bordure rosée, texte rouge (charte p.10)
  danger: "bg-alerte-50 text-alerte-600 border border-alerte-100 hover:bg-alerte-100",
};

const SIZES: Record<Size, string> = {
  default: "px-[18px] py-[11px] text-sm",
  compact: "px-3 py-1.5 text-xs",
};

export function Button({
  variant = "primary",
  size = "default",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={`${base} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...props} />;
}
