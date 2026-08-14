// ── Charges professionnelles annualisées pour l'assiette des cotisations ──
// Mutualisé entre le préchargement serveur (management/page.tsx) et le
// ManagementDataProvider (management/client.tsx) : les deux DOIVENT calculer
// exactement le même montant, sinon l'estimation seedée côté serveur diverge
// de celle recalculée côté client.
//
// Règle (même logique que `computeSummaryMetrics` de l'onglet Ma synthèse) :
//   chargesAnnuelles = annualisation(chargesPro + madelin)
//                    + rétrocession observée UNIQUEMENT si le profil n'a pas de
//                      rétrocession configurée.
// Quand la rétrocession du profil est renseignée, `getCotisationsEstimate` la
// déduit déjà lui-même de l'assiette (`retrocessionAnnualise`) : ajouter en
// plus la rétrocession observée dans les transactions déduirait deux fois la
// même charge.

/** Sous-ensemble mensuel nécessaire au calcul (compatible MonthlyActivityMonth). */
export type ChargesMonth = {
  chargesPro: number;
  retrocession: number;
  madelin: number;
};

/**
 * Vrai si le profil praticien a une rétrocession configurée et strictement
 * positive — mêmes critères que `computeRetrocessionDeduction` de
 * `cotisations-estimate.ts` (type + valeur numérique > 0).
 */
export function hasRetrocessionProfil(
  retrocessionType: string | null | undefined,
  retrocessionValue: string | null | undefined,
): boolean {
  if (!retrocessionType || !retrocessionValue) return false;
  const v = parseFloat(retrocessionValue);
  return Number.isFinite(v) && v > 0;
}

/**
 * Charges professionnelles déductibles ANNUALISÉES à passer à
 * `getCotisationsEstimate` (hors cotisations sociales, qui ne se déduisent pas
 * de leur propre assiette dans cette estimation).
 *
 * Annualisation alignée sur les conventions de `getCotisationsEstimate` :
 * année passée → totaux réels (12/12, pas d'extrapolation) ; année courante →
 * extrapolation YTD × 12 / mois écoulés ; année future → pas d'extrapolation
 * (les mois, s'ils existent, sont déjà une projection annuelle).
 */
export function computeChargesAnnuelles(params: {
  months: ChargesMonth[];
  year: number;
  /** Rétrocession configurée au profil : si oui, on N'ajoute PAS la rétrocession observée. */
  retrocessionProfil: boolean;
}): number {
  const { months, year, retrocessionProfil } = params;
  const now = new Date();
  const currentYear = now.getFullYear();
  const monthsElapsed = year === currentYear ? now.getMonth() + 1 : 12;
  const annualize = (ytd: number) => (monthsElapsed > 0 ? Math.round((ytd / monthsElapsed) * 12) : 0);

  const chargesProMadelin = annualize(months.reduce((s, m) => s + m.chargesPro + m.madelin, 0));
  const retrocessionObservee = retrocessionProfil
    ? 0
    : annualize(months.reduce((s, m) => s + m.retrocession, 0));
  return Math.max(0, chargesProMadelin + retrocessionObservee);
}
