"use client";

import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

  // Signal de changement des charges manuelles (édition dans Gestion → Mon activité).
  // Vit dans ce provider (partagé/persistant entre pages) pour que le Dashboard
  // se rafraîchisse sans reload. Les consommateurs mettent `manualChargesVersion`
  // dans les dépendances de leur effet de fetch.
  manualChargesVersion: number;
  notifyManualChargesChanged: () => void;
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
  manualChargesVersion: 0,
  notifyManualChargesChanged: () => {},
});

// Données préchargées côté serveur (layout protégé) pour éviter les 4 refresh*
// client en cascade au montage. Voir preload-protected-data.ts.
export type DataProviderInitialData = {
  pendingSuggestionsCount: number;
  suggestions: Suggestion[];
  facturationSummary: FacturationSummary | null;
  facturationPassages: CarePassageRow[];
  accounts: Account[];
  uncategorizedCount: number;
  transactionsError: string;
  effectiveCA: EffectiveCA;
  cotisationsEstimate: CotisationsEstimate | null;
};

export function DataProvider({ initialDataPromise, children }: { initialDataPromise?: Promise<DataProviderInitialData> | null; children: ReactNode }) {
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

  // Compteur incrémenté à chaque édition de charge manuelle.
  const [manualChargesVersion, setManualChargesVersion] = useState(0);
  const notifyManualChargesChanged = useCallback(() => setManualChargesVersion((v) => v + 1), []);

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

  // Applique les données préchargées côté serveur (résolution de la promesse que
  // le layout streame en parallèle du rendu de la page — pas de POST client).
  const applyInitial = useCallback((d: DataProviderInitialData) => {
    setPendingSuggestionsCount(d.pendingSuggestionsCount);
    setSuggestions(d.suggestions);
    setSuggestionsLoading(false);
    setFacturationSummary(d.facturationSummary);
    setFacturationPassages(d.facturationPassages);
    setFacturationLoading(false);
    setAccounts(d.accounts);
    setUncategorizedCount(d.uncategorizedCount);
    setTransactionsError(d.transactionsError);
    setTransactionsLoading(false);
    setEffectiveCA(d.effectiveCA);
    setCotisationsEstimate(d.cotisationsEstimate);
    setFiscalLoading(false);
  }, []);

  // Chargement initial. Si le layout a fourni une promesse de préchargement serveur,
  // on l'attend (streamée en parallèle du rendu, un seul aller-retour) ; sinon
  // fallback sur les refresh client. Ref stable au double-invoke du Strict Mode
  // (dev). Les refreshs manuels (bouton Actualiser, charges) passent par
  // refreshAll/refresh* et ne sont donc pas concernés.
  const initialLoadDoneRef = useRef(false);
  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    if (initialDataPromise) {
      // `initialDataPromise` est un thenable React (promesse streamée serveur→client),
      // pas une vraie Promise : son `.then` n'est pas chaînable. On l'adopte via
      // Promise.resolve pour pouvoir enchaîner `.then().catch()`.
      Promise.resolve(initialDataPromise)
        .then(applyInitial)
        .catch(() => {
          // Préchargement serveur échoué → on refait le fetch côté client.
          refresh();
          refreshFacturation();
          refreshTransactions();
          refreshFiscal();
        });
      return;
    }
    // Fallback (pas de préchargement serveur) : refetch client. Ces refresh* font
    // du setState, mais c'est un chargement initial one-shot gardé par
    // initialLoadDoneRef → pas de cascade de rendus, on désactive la règle.
    /* eslint-disable react-hooks/set-state-in-effect */
    refresh();
    refreshFacturation();
    refreshTransactions();
    refreshFiscal();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initialDataPromise, applyInitial, refresh, refreshFacturation, refreshTransactions, refreshFiscal]);

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
      manualChargesVersion,
      notifyManualChargesChanged,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  return useContext(DataContext);
}
