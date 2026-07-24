import { DashboardClient, type DashboardInitialData } from "./client";
import { getSession } from "@/lib/session";
import * as practitionerService from "@/lib/services/practitioner.service";
import { getHealthScoreAction } from "@/actions/health-score";
import { getTransactionKpisAction, getMonthlyActivityAction, getAccountMonthlyNetAction } from "@/actions/transaction";
import { getMonthlyActivityFromBordereauxAction } from "@/actions/monthly-activity-bordereaux";
import { getEffectiveCAAction } from "@/actions/effective-ca";
import { getCotisationsEstimate } from "@/actions/cotisations-estimate";

// Réplique server-side de l'effect "reste à vivre" du DashboardClient. Garder les
// deux en phase : CA effectif "transactions" + fallback bordereaux + estimation.
async function loadRav(year: number) {
  const eca = await getEffectiveCAAction(year, "transactions");
  const useFallback = eca.source === "bordereaux";
  const monthly = useFallback
    ? await getMonthlyActivityFromBordereauxAction(year)
    : await getMonthlyActivityAction(year);
  const months = monthly.months ?? [];
  const totalCA = months.reduce((s, m) => s + m.income, 0);
  const estimate = totalCA > 0 ? await getCotisationsEstimate(totalCA, 0, year) : null;
  return { months, estimate, source: eca.source };
}

export default async function DashboardPage() {
  const currentYear = new Date().getFullYear();
  const session = await getSession();
  const hp = session ? await practitionerService.getByUserId(session.id) : null;
  const bankConnected = !!hp?.bridgeUserUuid;
  const defaultAccId = hp?.defaultBankAccountId ?? null;

  // Préchargement EN PROCESS et en parallèle (pas de POST server-action sérialisé) :
  // ces 4 jeux de données alimentaient 4 useEffect qui partaient en cascade au
  // montage. Ils seedent désormais l'état initial du client → zéro aller-retour.
  const [healthScore, kpisRaw, rav, defaultMonthlyNet] = await Promise.all([
    getHealthScoreAction(),
    bankConnected ? getTransactionKpisAction(defaultAccId, undefined, true) : null,
    loadRav(currentYear),
    defaultAccId ? getAccountMonthlyNetAction(defaultAccId, currentYear) : [],
  ]);

  const kpis = kpisRaw
    ? {
        encaissement: kpisRaw.encaissement,
        decaissement: kpisRaw.decaissement,
        nbTransactionsDepenses: kpisRaw.nbTransactionsDepenses ?? 0,
      }
    : null;

  const initial: DashboardInitialData = { healthScore, kpis, rav, defaultMonthlyNet };
  return <DashboardClient initial={initial} />;
}
