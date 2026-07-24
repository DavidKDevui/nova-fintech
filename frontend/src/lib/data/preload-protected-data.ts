import { getPendingSuggestions, getPendingSuggestionsCount } from "@/actions/practice-links";
import { getFacturationData } from "@/actions/facturation";
import { fetchLocalAccountsAction } from "@/actions/bridge";
import { getUncategorizedCountAction } from "@/actions/transaction";
import { getEffectiveCAAction } from "@/actions/effective-ca";
import { getCotisationsEstimate } from "@/actions/cotisations-estimate";
import type { DataProviderInitialData } from "@/providers/data-provider";

// Réplique server-side des 4 refresh* du DataProvider (refresh, refreshFacturation,
// refreshTransactions, refreshFiscal). Garder en phase avec le provider. Appelé
// UNE fois par chargement dur depuis le layout protégé → seede l'état du provider,
// en parallèle et en process, au lieu de 4 refresh client en cascade (POST).
export async function preloadProtectedData(hasBank: boolean): Promise<DataProviderInitialData> {
  const currentYear = new Date().getFullYear();

  const [suggestions, count, facturation, transactions, fiscal] = await Promise.all([
    getPendingSuggestions(),
    getPendingSuggestionsCount(),
    (async () => {
      const result = await getFacturationData();
      return {
        summary: "summary" in result ? (result.summary ?? null) : null,
        passages: "passages" in result ? (result.passages ?? []) : [],
      };
    })(),
    (async () => {
      // refreshTransactions court-circuite sans banque connectée.
      if (!hasBank) return { accounts: [] as DataProviderInitialData["accounts"], uncategorizedCount: 0, error: "" };
      const [accResult, uncatCount] = await Promise.all([fetchLocalAccountsAction(), getUncategorizedCountAction()]);
      return {
        accounts: ("accounts" in accResult ? accResult.accounts : []) as DataProviderInitialData["accounts"],
        uncategorizedCount: uncatCount,
        error: "error" in accResult ? accResult.error : "",
      };
    })(),
    (async () => {
      const ca = await getEffectiveCAAction(currentYear, "bordereaux");
      const estimate = ca.ca > 0 ? await getCotisationsEstimate(ca.ca) : null;
      return { effectiveCA: ca, cotisationsEstimate: estimate };
    })(),
  ]);

  return {
    pendingSuggestionsCount: count,
    suggestions,
    facturationSummary: facturation.summary,
    facturationPassages: facturation.passages,
    accounts: transactions.accounts,
    uncategorizedCount: transactions.uncategorizedCount,
    transactionsError: transactions.error ?? "",
    effectiveCA: fiscal.effectiveCA,
    cotisationsEstimate: fiscal.cotisationsEstimate,
  };
}
