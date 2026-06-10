"use client";

import { createContext, useContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getPendingSuggestions, getPendingSuggestionsCount } from "@/actions/practice-links";
import { getFacturationData, type FacturationSummary, type CarePassageRow } from "@/actions/facturation";
import { fetchLocalAccountsAction } from "@/actions/bridge";
import { getUncategorizedCountAction } from "@/actions/transaction";
import { getEffectiveCAAction, type EffectiveCA } from "@/actions/effective-ca";
import { getCotisationsEstimate, type CotisationsEstimate } from "@/actions/cotisations-estimate";
import { usePractitioner } from "./practitioner-provider";
import { useUser } from "./user-provider";

type Suggestion = {
  suggestionId: string;
  practiceId: string;
  practiceName: string;
  finess: string;
};

type Account = {
  id: string;
  name: string;
  balance: string;
  currencyCode: string;
  type: string;
  status: string;
  lastSyncAt: Date | null;
};

type Transaction = {
  id: string;
  bankAccountId: string;
  amount: string;
  currencyCode: string;
  date: string;
  description: string;
  cleanDescription: string | null;
  operationType: string | null;
  categoryId: number | null;
  category: string | null;
};

interface DataContextValue {
  // Suggestions
  pendingSuggestionsCount: number;
  suggestions: Suggestion[];
  setSuggestions: React.Dispatch<React.SetStateAction<Suggestion[]>>;
  suggestionsLoading: boolean;

  // Facturation
  facturationSummary: FacturationSummary | null;
  facturationPassages: CarePassageRow[];
  facturationLoading: boolean;

  // Transactions
  accounts: Account[];
  transactions: Transaction[];
  transactionsLoading: boolean;
  transactionsError: string;
  uncategorizedCount: number;
  setUncategorizedCount: React.Dispatch<React.SetStateAction<number>>;
  defaultBankAccountMissing: boolean;

  // Fiscal (CA effectif + estimation cotisations, année courante)
  effectiveCA: EffectiveCA;
  cotisationsEstimate: CotisationsEstimate | null;
  fiscalLoading: boolean;

  // Refresh
  refresh: () => Promise<void>;
  refreshFacturation: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  refreshFiscal: () => Promise<void>;
  /** Recharge toutes les données client du provider (utilisé par le bouton « Actualiser »). */
  refreshAll: () => Promise<void>;
}

const DataContext = createContext<DataContextValue>({
  pendingSuggestionsCount: 0,
  suggestions: [],
  setSuggestions: () => {},
  suggestionsLoading: true,
  facturationSummary: null,
  facturationPassages: [],
  facturationLoading: true,
  accounts: [],
  transactions: [],
  transactionsLoading: true,
  transactionsError: "",
  uncategorizedCount: 0,
  setUncategorizedCount: () => {},
  defaultBankAccountMissing: false,
  effectiveCA: { ca: 0, source: "none" },
  cotisationsEstimate: null,
  fiscalLoading: true,
  refresh: async () => {},
  refreshFacturation: async () => {},
  refreshTransactions: async () => {},
  refreshFiscal: async () => {},
  refreshAll: async () => {},
});

export function DataProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const hp = usePractitioner();
  const isAdmin = user.accountType === "admin";

  // Suggestions
  const [pendingSuggestionsCount, setPendingSuggestionsCount] = useState(0);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);

  // Facturation
  const [facturationSummary, setFacturationSummary] = useState<FacturationSummary | null>(null);
  const [facturationPassages, setFacturationPassages] = useState<CarePassageRow[]>([]);
  const [facturationLoading, setFacturationLoading] = useState(true);

  // Transactions
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState("");
  const [uncategorizedCount, setUncategorizedCount] = useState(0);

  // Fiscal (CA effectif + estimation cotisations, année courante)
  const [effectiveCA, setEffectiveCA] = useState<EffectiveCA>({ ca: 0, source: "none" });
  const [cotisationsEstimate, setCotisationsEstimate] = useState<CotisationsEstimate | null>(null);
  const [fiscalLoading, setFiscalLoading] = useState(true);

  const refreshFacturation = useCallback(async () => {
    if (isAdmin || !hp) {
      setFacturationLoading(false);
      return;
    }
    const result = await getFacturationData();
    if ("summary" in result && result.summary) {
      setFacturationSummary(result.summary);
    }
    if ("passages" in result && result.passages) {
      setFacturationPassages(result.passages);
    }
    setFacturationLoading(false);
  }, [isAdmin, hp]);

  const refreshTransactions = useCallback(async () => {
    if (isAdmin || !hp?.bridgeUserUuid) {
      setTransactionsLoading(false);
      return;
    }
    setTransactionsError("");
    const [accResult, uncatCount] = await Promise.all([
      fetchLocalAccountsAction(),
      getUncategorizedCountAction(),
    ]);
    setUncategorizedCount(uncatCount);

    if (accResult.error) {
      setTransactionsError(accResult.error);
    } else if (accResult.accounts) {
      setAccounts(accResult.accounts as Account[]);
    }

    setTransactionsLoading(false);
  }, [isAdmin, hp?.bridgeUserUuid]);

  const refreshFiscal = useCallback(async () => {
    if (isAdmin || !hp) {
      setFiscalLoading(false);
      return;
    }
    const year = new Date().getFullYear();
    const ca = await getEffectiveCAAction(year, "bordereaux");
    setEffectiveCA(ca);
    if (ca.ca > 0) {
      const est = await getCotisationsEstimate(ca.ca);
      if (est) setCotisationsEstimate(est);
    }
    setFiscalLoading(false);
  }, [isAdmin, hp]);

  const refresh = useCallback(async () => {
    if (isAdmin || !hp) return;
    const [count, sug] = await Promise.all([
      getPendingSuggestionsCount(),
      getPendingSuggestions(),
    ]);
    setPendingSuggestionsCount(count);
    setSuggestions(sug);
    setSuggestionsLoading(false);
  }, [isAdmin, hp]);

  const defaultBankAccountMissing = useMemo(() => {
    if (transactionsLoading) return false;
    if (!hp) return false;
    return !accounts.some((a) => a.id === hp.defaultBankAccountId);
  }, [transactionsLoading, hp, accounts]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refresh(),
      refreshFacturation(),
      refreshTransactions(),
      refreshFiscal(),
    ]);
  }, [refresh, refreshFacturation, refreshTransactions, refreshFiscal]);

  // Initial load
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    refresh();
    refreshFacturation();
    refreshTransactions();
    refreshFiscal();
  }, [refresh, refreshFacturation, refreshTransactions, refreshFiscal]);

  return (
    <DataContext.Provider value={{
      pendingSuggestionsCount,
      suggestions,
      setSuggestions,
      suggestionsLoading,
      facturationSummary,
      facturationPassages,
      facturationLoading,
      accounts,
      transactions,
      transactionsLoading,
      transactionsError,
      uncategorizedCount,
      setUncategorizedCount,
      defaultBankAccountMissing,
      effectiveCA,
      cotisationsEstimate,
      fiscalLoading,
      refresh,
      refreshFacturation,
      refreshTransactions,
      refreshFiscal,
      refreshAll,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  return useContext(DataContext);
}
