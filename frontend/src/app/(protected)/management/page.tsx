import { ManagementClient, type ManagementInitialData } from "./client";
import { getEffectiveCAAction } from "@/actions/effective-ca";
import { getMonthlyActivityAction } from "@/actions/transaction";
import { getMonthlyActivityFromBordereauxAction } from "@/actions/monthly-activity-bordereaux";
import { getCotisationsEstimate } from "@/actions/cotisations-estimate";
import { getFiscalSituationAction } from "@/actions/fiscal-situation";

// Réplique server-side de ManagementDataProvider.loadYearCore (client). Les deux
// DOIVENT rester en phase : même CA effectif "transactions" + fallback bordereaux.
async function loadYearCore(year: number) {
  const effectiveCA = await getEffectiveCAAction(year, "transactions");
  const useFallback = effectiveCA.source === "bordereaux";
  const monthly = useFallback
    ? await getMonthlyActivityFromBordereauxAction(year)
    : await getMonthlyActivityAction(year);
  const months = monthly.months ?? [];
  const totalCA = months.reduce((s, m) => s + m.income, 0);
  return { effectiveCA, months, totalCA, isEstimated: useFallback };
}

async function loadYear(year: number) {
  const [core, fiscal] = await Promise.all([loadYearCore(year), getFiscalSituationAction(year)]);
  const estimate = core.totalCA > 0 ? await getCotisationsEstimate(core.totalCA, 0, year) : null;
  return { core, estimate, fiscal };
}

export default async function ManagementPage() {
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  // Préchargement server-side, EN PROCESS (pas de POST server-action sérialisé) et
  // en parallèle sur les deux années. Ces données seedent le cache du
  // ManagementDataProvider → l'onglet « synthèse » (défaut) s'affiche sans aucun
  // aller-retour au montage, au lieu de la cascade de server actions d'avant.
  const [cy, py] = await Promise.all([loadYear(currentYear), loadYear(prevYear)]);
  const initial: ManagementInitialData = {
    years: { [currentYear]: cy, [prevYear]: py },
  };

  return <ManagementClient initial={initial} />;
}
