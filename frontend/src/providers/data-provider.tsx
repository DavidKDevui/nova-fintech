"use client";

import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { getPendingSuggestions, getPendingSuggestionsCount } from "@/actions/practice-links";
import { getFacturationData, type FacturationSummary, type CarePassageRow } from "@/actions/facturation";
import { fetchLocalAccountsAction, fetchLocalTransactionsAction } from "@/actions/bridge";
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

  // Refresh
  refresh: () => Promise<void>;
  refreshFacturation: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
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
  refresh: async () => {},
  refreshFacturation: async () => {},
  refreshTransactions: async () => {},
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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState("");

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
    const [accResult, txResult] = await Promise.all([
      fetchLocalAccountsAction(),
      fetchLocalTransactionsAction(),
    ]);

    if (accResult.error) {
      setTransactionsError(accResult.error);
    } else if (accResult.accounts) {
      setAccounts(accResult.accounts as Account[]);
    }

    if (txResult.error && !accResult.error) {
      setTransactionsError(txResult.error);
    } else if (txResult.transactions) {
      setTransactions(txResult.transactions as Transaction[]);
    }

    setTransactionsLoading(false);
  }, [isAdmin, hp?.bridgeUserUuid]);

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

  // Initial load
  useEffect(() => {
    refresh();
    refreshFacturation();
    refreshTransactions();
  }, [refresh, refreshFacturation, refreshTransactions]);

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
      refresh,
      refreshFacturation,
      refreshTransactions,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  return useContext(DataContext);
}
