import type { CotisationsEstimate } from "@/actions/cotisations-estimate";
import type { MonthlyActivityMonth } from "@/actions/transaction";

// Calcul unique du « reste à vivre » projeté, partagé entre le dashboard et
// l'espace Gestion (carte « Trésorerie prévisionnelle » + onglet « Reste à
// vivre »). Auparavant dupliqué à trois endroits, ce qui avait fini par diverger.
//
// Modèle : on part du solde bancaire, on ajoute les encaissements estimés
// (moyenne mensuelle des mois actifs écoulés × nombre de mois projetés) et on
// déduit :
//   - les cotisations provisionnées AU PRORATA des encaissements projetés
//     (taux effectif = montant annuel / CA brut annualisé), et non aux seules
//     dates d'échéance — sinon le chiffre gonfle mécaniquement plus l'horizon
//     s'éloigne ;
//   - les charges pro. et rétrocessions/Madelin projetées.

type ActivityMonth = Pick<MonthlyActivityMonth, "income" | "chargesPro" | "retrocession" | "madelin">;

export type ResteAVivreInput = {
  /** Activité mensuelle, index 0 = janvier. */
  months: ActivityMonth[];
  estimate: CotisationsEstimate | null;
  /** Solde de départ (compte par défaut). */
  startingBalance: number;
  /** Mois cible de la projection (0-11). Borné au mois courant (pas de passé). */
  targetMonthIdx: number;
  /** Date de référence — injectable pour les tests. Défaut : maintenant. */
  now?: Date;
};

export type ResteAVivreBreakdown = {
  projIncome: number;
  urssafDue: number;
  carpimkoDue: number;
  pasDue: number;
  /** Somme des trois cotisations provisionnées. */
  provisionCotisations: number;
  projChargesPro: number;
  projRetroMadelin: number;
  /** Somme charges pro. + rétrocessions/Madelin projetées. */
  chargesProProjetees: number;
  /** Reste à vivre projeté. */
  total: number;
};

export function computeResteAVivre({
  months,
  estimate,
  startingBalance,
  targetMonthIdx,
  now = new Date(),
}: ResteAVivreInput): ResteAVivreBreakdown {
  const currentMonthIdx = now.getMonth();
  const year = now.getFullYear();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(year, currentMonthIdx + 1, 0).getDate();
  const fractionRemainingCurrentMonth = Math.max(0, (daysInMonth - dayOfMonth) / daysInMonth);
  const targetIdx = Math.max(currentMonthIdx, targetMonthIdx);

  // Moyenne sur les mois réellement actifs (encaissements > 0). Les mois à zéro
  // en début d'année (avant démarrage d'activité) sous-estimeraient sinon les
  // projections. Fallback : tous les mois écoulés, puis le premier mois.
  const pastMonths = months.slice(0, currentMonthIdx);
  const activeMonths = pastMonths.filter((m) => m.income > 0);
  const sample = activeMonths.length > 0
    ? activeMonths
    : pastMonths.length > 0 ? pastMonths : months.slice(0, 1);
  const avg = (sel: (m: ActivityMonth) => number) =>
    sample.length ? sample.reduce((s, m) => s + sel(m), 0) / sample.length : 0;
  const avgIncome = avg((m) => m.income);
  const avgChargesPro = avg((m) => m.chargesPro);
  const avgRetroMadelin = avg((m) => m.retrocession + m.madelin);

  const monthsBetween = targetIdx > currentMonthIdx
    ? fractionRemainingCurrentMonth + (targetIdx - currentMonthIdx)
    : fractionRemainingCurrentMonth;

  const projIncome = avgIncome * monthsBetween;
  const projChargesPro = avgChargesPro * monthsBetween;
  const projRetroMadelin = avgRetroMadelin * monthsBetween;

  // Provision des cotisations au prorata des encaissements projetés.
  const baseCA = estimate?.caBrutAnnualise ?? 0;
  const rate = (annuel: number) => (baseCA > 0 ? annuel / baseCA : 0);
  const urssafDue = projIncome * rate(estimate?.urssafAnnuel ?? 0);
  const carpimkoDue = projIncome * rate(estimate?.carpimkoAnnuel ?? 0);
  const pasDue = projIncome * rate(estimate?.pasAnnuel ?? 0);
  const provisionCotisations = urssafDue + carpimkoDue + pasDue;

  const chargesProProjetees = projChargesPro + projRetroMadelin;
  const total = startingBalance + projIncome - provisionCotisations - chargesProProjetees;

  return {
    projIncome,
    urssafDue,
    carpimkoDue,
    pasDue,
    provisionCotisations,
    projChargesPro,
    projRetroMadelin,
    chargesProProjetees,
    total,
  };
}
