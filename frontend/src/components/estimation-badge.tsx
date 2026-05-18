"use client";

/**
 * Badge discret signalant qu'une valeur est estimée (et non observée).
 * Utilisé notamment dans "Mon activité" quand la banque n'est pas connectée :
 * URSSAF, CARPIMKO et provision d'impôt sont alors calculés à partir du CA
 * issu des bordereaux.
 */
export function EstimationBadge({
  tooltip = "Valeur estimée à partir de votre chiffre d'affaires. Connectez votre banque pour le montant réellement prélevé.",
  label = "estim.",
}: {
  tooltip?: string;
  label?: string;
}) {
  return (
    <span className="relative group inline-flex items-center align-middle">
      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 bg-gray-100 rounded px-1 py-px cursor-help hover:bg-gray-200 hover:text-gray-600 transition-colors">
        {label}
      </span>
      <span className="absolute left-1/2 -translate-x-1/2 top-5 w-64 bg-gray-900 text-white text-xs rounded-lg px-3.5 py-3 hidden group-hover:block z-[9999] shadow-lg leading-relaxed text-left font-normal normal-case">
        {tooltip}
      </span>
    </span>
  );
}
