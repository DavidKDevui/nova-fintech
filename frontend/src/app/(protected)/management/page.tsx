import { ManagementClient, type ManagementInitialData } from "./client";
import { getEffectiveCAAction } from "@/actions/effective-ca";
import { getMonthlyActivityAction } from "@/actions/transaction";
import { getMonthlyActivityFromBordereauxAction } from "@/actions/monthly-activity-bordereaux";
import { getCotisationsEstimate } from "@/actions/cotisations-estimate";
import { getFiscalSituationAction } from "@/actions/fiscal-situation";
import { computeChargesAnnuelles, hasRetrocessionProfil } from "@/lib/data/charges-annualisees";
import { getSession } from "@/lib/session";
import * as practitionerService from "@/lib/services/practitioner.service";

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

async function loadYear(year: number, retrocessionProfil: boolean) {
  const [core, fiscal] = await Promise.all([loadYearCore(year), getFiscalSituationAction(year)]);
  // Mêmes charges annualisées que ManagementDataProvider.loadEstimate (client) :
  // les données mensuelles sont déjà chargées ici (core.months), on transmet donc
  // les charges déductibles pour asseoir les cotisations sur le bénéfice — le
  // montant seedé côté client doit être identique à celui qu'il recalculerait.
  const chargesAnnuelles = computeChargesAnnuelles({
    months: core.months,
    year,
    retrocessionProfil,
  });
  const estimate = core.totalCA > 0
    ? await getCotisationsEstimate(core.totalCA, 0, year, chargesAnnuelles)
    : null;
  return { core, estimate, fiscal };
}

export default async function ManagementPage() {
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  // Rétrocession du profil : conditionne l'ajout (ou non) de la rétrocession
  // observée aux charges — même règle que côté client (cf. charges-annualisees.ts).
  const session = await getSession();
  const profile = session && session.accountType === "practitioner"
    ? await practitionerService.getByUserId(session.id)
    : null;
  const retrocessionProfil = hasRetrocessionProfil(profile?.retrocessionType, profile?.retrocessionValue);

  // Préchargement server-side, EN PROCESS (pas de POST server-action sérialisé) et
  // en parallèle sur les deux années. Ces données seedent le cache du
  // ManagementDataProvider → l'onglet « synthèse » (défaut) s'affiche sans aucun
  // aller-retour au montage, au lieu de la cascade de server actions d'avant.
  const [cy, py] = await Promise.all([
    loadYear(currentYear, retrocessionProfil),
    loadYear(prevYear, retrocessionProfil),
  ]);
  const initial: ManagementInitialData = {
    years: { [currentYear]: cy, [prevYear]: py },
  };

  return <ManagementClient initial={initial} />;
}
