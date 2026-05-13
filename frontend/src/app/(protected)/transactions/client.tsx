"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePractitioner } from "@/providers/practitioner-provider";
import { useData } from "@/providers/data-provider";
import { Modal } from "@/components/modal";
import { ConnectBankBanner } from "@/components/connect-bank-banner";
import { toast } from "sonner";
import { connectBankAction } from "@/actions/bridge";
import { fetchPaginatedTransactionsAction, updateTransactionCategoryAction, getTransactionKpisAction } from "@/actions/transaction";
import { setDefaultBankAccountAction, deleteBankAccountAction } from "@/actions/bank-account";
import { getBankAlertAction, upsertBankAlertAction } from "@/actions/bank-alert";
import { downloadCSV, downloadPDF } from "@/lib/export";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: "Compte courant",
  savings: "Épargne",
  card: "Carte bancaire",
  loan: "Prêt",
  brokerage: "Compte-titres",
  life_insurance: "Assurance vie",
  investment: "Investissement",
};

// sign: "+" = revenus, "-" = dépenses, null = les deux
const CATEGORIES: Record<string, { label: string; icon: React.ReactNode; sign: "+" | "-" | null }> = {
  income: {
    label: "Recettes", sign: "+",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.25" /><path d="M12 16V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" /><path d="M8 12l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" /></svg>,
  },
  professional_reimbursement: {
    label: "Rembours. pro", sign: "+",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.25" /><path d="M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" /><path d="M12 8l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" /></svg>,
  },
  retrocession: {
    label: "Rétrocession", sign: null,
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.25" /><path d="M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" /><path d="M12 16l-4-4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" /></svg>,
  },
  compensation: {
    label: "Rémunération", sign: "-",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="5" fill="currentColor" opacity="0.35" /><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2" fill="currentColor" opacity="0.2" /></svg>,
  },
  royalty: {
    label: "Redevance", sign: null,
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" fill="currentColor" opacity="0.25" /><rect x="3" y="5" width="18" height="5" rx="2" fill="currentColor" opacity="0.4" /><rect x="6" y="13" width="5" height="2" rx="1" fill="currentColor" opacity="0.3" /></svg>,
  },
  urssaf: {
    label: "URSSAF", sign: "-",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill="currentColor" opacity="0.25" /><path d="M12 2L3 7v10l9 5V2z" fill="currentColor" opacity="0.4" /></svg>,
  },
  carpimko: {
    label: "CARPIMKO", sign: "-",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="8" width="18" height="13" rx="2" fill="currentColor" opacity="0.25" /><path d="M12 3L4 8h16L12 3z" fill="currentColor" opacity="0.4" /><rect x="9" y="14" width="6" height="7" rx="1" fill="currentColor" opacity="0.2" /></svg>,
  },
  professional_expenses: {
    label: "Charges pro", sign: "-",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.25" /><path d="M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" /><path d="M16 12l-4 4-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" /></svg>,
  },
  madelin: {
    label: "Madelin", sign: "-",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.25" /><path d="M12 7v4l2.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" /><circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.4" /></svg>,
  },
  taxes: {
    label: "Impôts", sign: "-",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" opacity="0.25" /><rect x="3" y="3" width="18" height="6" rx="2" fill="currentColor" opacity="0.4" /><rect x="7" y="2" width="2" height="4" rx="1" fill="currentColor" opacity="0.5" /><rect x="15" y="2" width="2" height="4" rx="1" fill="currentColor" opacity="0.5" /></svg>,
  },
  reprocessing: {
    label: "Retraitement", sign: null,
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" fill="currentColor" opacity="0.25" /><path d="M14 2v6h6" fill="currentColor" opacity="0.4" /><rect x="8" y="13" width="8" height="1.5" rx=".75" fill="currentColor" opacity="0.3" /><rect x="8" y="17" width="5" height="1.5" rx=".75" fill="currentColor" opacity="0.3" /></svg>,
  },
};

const CATEGORY_OPTIONS = Object.entries(CATEGORIES);

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

export function TransactionsClient() {
  const hp = usePractitioner();
  const { accounts, transactionsLoading: loading, transactionsError: error, uncategorizedCount, setUncategorizedCount } = useData();

  const [selectedAccount, setSelectedAccount] = useState<string | null>(hp?.defaultBankAccountId ?? null);
  const [pendingDefaultId, setPendingDefaultId] = useState<string | null>(null);
  const [savingDefault, setSavingDefault] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [txPage, setTxPage] = useState(1);
  const [txTab, setTxTab] = useState<"all" | "uncategorized">("all");
  const [txSortBy, setTxSortBy] = useState<"date" | "description" | "amount">("date");
  const [txSortDir, setTxSortDir] = useState<"asc" | "desc">("desc");
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const TX_PER_PAGE = 10;

  const [paginatedTx, setPaginatedTx] = useState<Transaction[]>([]);
  const [paginatedTotal, setPaginatedTotal] = useState(0);
  const [paginatedLoading, setPaginatedLoading] = useState(false);
  const [kpiEncaissement, setKpiEncaissement] = useState(0);
  const [kpiDecaissement, setKpiDecaissement] = useState(0);
  const [kpiRemuneration, setKpiRemuneration] = useState(0);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiYear, setKpiYear] = useState(new Date().getFullYear());

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const accountDropdownRef = useRef<HTMLDivElement>(null);

  // Alert state
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState("");
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertLoading, setAlertLoading] = useState(false);
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertLoaded, setAlertLoaded] = useState(false);
  const alertConfigured = alertLoaded && alertEnabled && alertThreshold !== "";

  const needsDefaultAccount = hp?.bridgeUserUuid && !hp.defaultBankAccountId && accounts.length > 1 && !loading;

  // Load alert state on mount
  useEffect(() => {
    if (!hp?.defaultBankAccountId || alertLoaded) return;
    getBankAlertAction().then(({ alert }) => {
      if (alert) {
        setAlertThreshold(String(Number(alert.threshold)));
        setAlertEnabled(alert.enabled);
      }
      setAlertLoaded(true);
    });
  }, [hp?.defaultBankAccountId, alertLoaded]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => { setSearchDebounced(searchQuery); setTxPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close account dropdown on outside click
  useEffect(() => {
    if (!accountDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
        setAccountDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [accountDropdownOpen]);

  // Fetch paginated transactions from server
  useEffect(() => {
    if (!hp?.bridgeUserUuid) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setPaginatedLoading(true);
    fetchPaginatedTransactionsAction(
      txPage, TX_PER_PAGE, selectedAccount, txSortBy, txSortDir, txTab === "uncategorized",
      searchDebounced || null, dateFrom || null, dateTo || null, categoryFilter || null,
    ).then((result) => {
      if (cancelled) return;
      if (result.transactions) {
        setPaginatedTx(result.transactions as Transaction[]);
        setPaginatedTotal(result.total ?? 0);
        if (result.uncategorizedCount !== undefined) setUncategorizedCount(result.uncategorizedCount);
      }
      setPaginatedLoading(false);
    });
    return () => { cancelled = true; };
  }, [txPage, selectedAccount, txSortBy, txSortDir, txTab, searchDebounced, dateFrom, dateTo, categoryFilter, hp?.bridgeUserUuid]);

  // Fetch KPIs from server
  useEffect(() => {
    if (!hp?.bridgeUserUuid) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setKpiLoading(true);
    getTransactionKpisAction(selectedAccount, kpiYear).then((result) => {
      setKpiEncaissement(result.encaissement);
      setKpiDecaissement(result.decaissement);
      setKpiRemuneration(result.remuneration ?? 0);
      setKpiLoading(false);
    });
  }, [selectedAccount, kpiYear, hp?.bridgeUserUuid]);

  const saveAlert = useCallback(async () => {
    const value = parseFloat(alertThreshold);
    if (isNaN(value) || value < 0) return;
    setAlertSaving(true);
    const result = await upsertBankAlertAction(value, alertEnabled);
    setAlertSaving(false);
    if (result.success) {
      setShowAlertModal(false);
      if (alertEnabled) {
        toast.success(`Alerte paramétrée à ${formatCurrency(value)}`);
      } else {
        toast.success("Alerte désactivée");
      }
    }
  }, [alertThreshold, alertEnabled]);

  // Auto-set default if only one account
  useEffect(() => {
    if (hp?.bridgeUserUuid && !hp.defaultBankAccountId && accounts.length === 1 && !loading) {
      setDefaultBankAccountAction(accounts[0]!.id).then((result) => {
        if (result.success) window.location.reload();
      });
    }
  }, [hp?.bridgeUserUuid, hp?.defaultBankAccountId, accounts, loading]);

  const filteredAccounts = selectedAccount ? accounts.filter((a) => a.id === selectedAccount) : accounts;

  const lastSyncAt = (() => {
    const dates = accounts.map((a) => a.lastSyncAt).filter((d): d is Date => d !== null);
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates.map((d) => new Date(d).getTime())));
  })();

  const nextSyncAt = lastSyncAt ? new Date(lastSyncAt.getTime() + 15 * 24 * 60 * 60 * 1000) : null;

  const refreshKpis = () => {
    getTransactionKpisAction(selectedAccount, kpiYear).then((kpi) => {
      setKpiEncaissement(kpi.encaissement);
      setKpiDecaissement(kpi.decaissement);
      setKpiRemuneration(kpi.remuneration ?? 0);
    });
  };

  if (!hp?.bridgeUserUuid) {
    return <ConnectBankBanner />;
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-5 animate-pulse">
          <div className="h-3 bg-gray-200 rounded w-24 mb-3" />
          <div className="h-6 bg-gray-200 rounded w-32" />
        </div>
        <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-5 animate-pulse">
          <div className="h-48 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="bg-red-50 p-4 text-sm text-red-600">{error}</div>;
  }

  const totalBalance = filteredAccounts.reduce((sum, acc) => sum + Number(acc.balance), 0);
  const txTotalPages = Math.max(1, Math.ceil(paginatedTotal / TX_PER_PAGE));

  return (
    <div>
      {/* Account selector + sync info */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="relative" ref={accountDropdownRef}>
          <button
            type="button"
            onClick={() => setAccountDropdownOpen((v) => !v)}
            className="flex items-center justify-between gap-3 bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] px-3 py-2 transition-all hover:bg-white/90 cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-brand-100 text-brand-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="4" width="20" height="16" rx="3" fill="currentColor" opacity="0.5" />
                  <rect x="2" y="4" width="20" height="5" rx="3" fill="currentColor" opacity="0.7" />
                </svg>
              </div>
              <p className="text-xs font-medium text-gray-900">
                {selectedAccount
                  ? accounts.find((a) => a.id === selectedAccount)?.name ?? "Compte"
                  : `Tous les comptes (${accounts.length})`}
              </p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-gray-400 transition-transform ${accountDropdownOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
          </button>

          {accountDropdownOpen && (
            <div className="absolute z-50 top-full left-0 mt-1.5 w-[calc(100vw-2rem)] sm:w-auto sm:min-w-[280px] bg-white border border-gray-200 rounded-lg shadow-lg py-1 animate-fade-up-fast">
              <button
                type="button"
                onClick={() => { setSelectedAccount(null); setTxPage(1); setAccountDropdownOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${!selectedAccount ? "bg-brand-50" : "hover:bg-gray-50"}`}
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                </div>
                <div>
                  <p className={`text-sm font-medium ${!selectedAccount ? "text-brand-700" : "text-gray-900"}`}>Tous les comptes</p>
                  <p className="text-xs text-gray-400">{accounts.length} compte{accounts.length > 1 ? "s" : ""} connecté{accounts.length > 1 ? "s" : ""}</p>
                </div>
                {!selectedAccount && (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-brand-600"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </button>

              {accounts.length > 0 && <div className="border-t border-gray-100 my-1" />}

              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${selectedAccount === acc.id ? "bg-brand-50" : "hover:bg-gray-50"}`}
                >
                  <button
                    type="button"
                    onClick={() => { setSelectedAccount(acc.id); setTxPage(1); setAccountDropdownOpen(false); }}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-100 text-brand-600 shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <rect x="2" y="4" width="20" height="16" rx="3" fill="currentColor" opacity="0.5" />
                        <rect x="2" y="4" width="20" height="5" rx="3" fill="currentColor" opacity="0.7" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${selectedAccount === acc.id ? "text-brand-700" : "text-gray-900"}`}>{acc.name}</p>
                      <p className="text-xs text-gray-400">{ACCOUNT_TYPE_LABELS[acc.type] || acc.type}</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 shrink-0">
                      {acc.balance != null ? formatCurrency(Number(acc.balance)) : "—"}
                    </span>
                    {selectedAccount === acc.id && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-600 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeleteAccountId(acc.id); setAccountDropdownOpen(false); }}
                    className="shrink-0 p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Supprimer ce compte"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              ))}

              <div className="border-t border-gray-100 my-1" />

              <button
                type="button"
                onClick={async () => {
                  setAccountDropdownOpen(false);
                  const result = await connectBankAction();
                  if (result.url) window.location.href = result.url;
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-brand-600 hover:bg-brand-50 transition-colors"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-dashed border-brand-300 text-brand-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
                <p className="text-sm font-medium">Ajouter un compte</p>
              </button>
            </div>
          )}
        </div>

        {lastSyncAt && (
          <div className="flex flex-col text-[11px] text-gray-400">
            <span>Dernière synchro : <span className="font-medium text-gray-500">{formatDateFr(lastSyncAt.toISOString().split("T")[0]!)}</span></span>
            {nextSyncAt && (
              <span>Prochaine : <span className="font-medium text-gray-500">{formatDateFr(nextSyncAt.toISOString().split("T")[0]!)}</span></span>
            )}
          </div>
        )}
      </div>

      {/* Year selector + KPI cards */}
      <div className="flex items-center justify-end gap-1 mt-3 mb-1.5">
        <button
          type="button"
          onClick={() => setKpiYear((y) => y - 1)}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="text-sm font-semibold text-gray-900 w-12 text-center">{kpiYear}</span>
        <button
          type="button"
          onClick={() => setKpiYear((y) => y + 1)}
          disabled={kpiYear >= new Date().getFullYear()}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Solde de trésorerie — toujours visible */}
        <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-blue-600">
                <rect x="2" y="4" width="20" height="16" rx="3" fill="currentColor" opacity="0.4" />
                <rect x="2" y="4" width="20" height="5" rx="3" fill="currentColor" opacity="0.6" />
                <rect x="5" y="12" width="6" height="2" rx="1" fill="currentColor" opacity="0.2" />
                <rect x="5" y="16" width="4" height="1.5" rx="0.75" fill="currentColor" opacity="0.15" />
              </svg>
              <p className="text-xs font-medium text-gray-500">Solde de trésorerie</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAlertModal(true)}
              className={`flex items-center justify-center w-6 h-6 rounded-md transition-all ${
                alertConfigured ? "text-brand-600 hover:bg-brand-50" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              }`}
              title="Alerte seuil"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill={alertConfigured ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
            </button>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatCurrencyRounded(totalBalance)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{filteredAccounts.length === 1 ? filteredAccounts[0]!.name : `${filteredAccounts.length} comptes`}</p>
        </div>

        {/* Encaissement, Décaissement, Rémunération — skeleton on loading */}
        {kpiLoading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-4 animate-pulse">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 bg-gray-200 rounded" />
                  <div className="h-3 bg-gray-200 rounded w-20" />
                </div>
                <div className="h-6 bg-gray-200 rounded w-28" />
              </div>
            ))}
          </>
        ) : (<>
        <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-4">
          <div className="flex items-center gap-2 mb-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-green-600">
              <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.3" />
              <path d="M12 16V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
              <path d="M8 12l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
            </svg>
            <p className="text-xs font-medium text-gray-500">Encaissement</p>
          </div>
          <p className="text-xl font-bold text-gray-900">+{formatCurrencyRounded(kpiEncaissement)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Sur l&apos;année {kpiYear}</p>
        </div>
        <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-4">
          <div className="flex items-center gap-2 mb-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-red-500">
              <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.3" />
              <path d="M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
              <path d="M16 12l-4 4-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
            </svg>
            <p className="text-xs font-medium text-gray-500">Décaissement</p>
          </div>
          <p className="text-xl font-bold text-gray-900">-{formatCurrencyRounded(kpiDecaissement)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Sur l&apos;année {kpiYear}</p>
        </div>
        <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-4">
          <div className="flex items-center gap-2 mb-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-brand-600">
              <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3" />
              <path d="M12 7v4l2.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
              <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.5" />
            </svg>
            <p className="text-xs font-medium text-gray-500">Rémunération</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{kpiRemuneration > 0 ? "-" : ""}{formatCurrencyRounded(kpiRemuneration)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Sur l&apos;année {kpiYear}</p>
        </div>
        </>)}
      </div>

      {/* Transactions list */}
      <div className="bg-white/70 backdrop-blur-xl border border-gray-200/70 rounded-[15px] mt-6">
        <div className="px-5 pt-4 pb-0 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-4">Transactions bancaires</h2>
            <div className="flex items-center gap-0">
              <button
                type="button"
                onClick={() => { setTxTab("all"); setTxPage(1); }}
                className={`px-1.5 pb-2.5 text-sm font-medium border-b-2 transition-all ${
                  txTab === "all" ? "border-brand-600 text-brand-600" : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                Toutes les transactions
              </button>
              <button
                type="button"
                onClick={() => { setTxTab("uncategorized"); setTxPage(1); }}
                className={`px-1.5 pb-2.5 text-sm font-medium border-b-2 transition-all ${
                  txTab === "uncategorized" ? "border-brand-600 text-brand-600" : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                À catégoriser
                {uncategorizedCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-100 text-brand-700 text-[11px] font-bold">
                    {uncategorizedCount}
                  </span>
                )}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {paginatedTotal > 0 && (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    const result = await fetchPaginatedTransactionsAction(1, 10000, selectedAccount, txSortBy, txSortDir, txTab === "uncategorized", searchDebounced || null, dateFrom || null, dateTo || null, categoryFilter || null);
                    if ("transactions" in result && result.transactions) {
                      const headers = ["Date", "Libellé", "Catégorie", "Montant"];
                      const rows = result.transactions.map((tx: Transaction) => [
                        formatDateFr(tx.date),
                        tx.cleanDescription || tx.description,
                        tx.category ? (CATEGORIES[tx.category]?.label ?? tx.category) : "",
                        Number(tx.amount).toFixed(2).replace(".", ","),
                      ]);
                      downloadCSV("transactions", headers, rows);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  CSV
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const result = await fetchPaginatedTransactionsAction(1, 10000, selectedAccount, txSortBy, txSortDir, txTab === "uncategorized", searchDebounced || null, dateFrom || null, dateTo || null, categoryFilter || null);
                    if ("transactions" in result && result.transactions) {
                      const headers = ["Date", "Libellé", "Catégorie", "Montant"];
                      const rows = result.transactions.map((tx: Transaction) => [
                        formatDateFr(tx.date),
                        tx.cleanDescription || tx.description,
                        tx.category ? (CATEGORIES[tx.category]?.label ?? tx.category) : "",
                        new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(tx.amount)),
                      ]);
                      downloadPDF("transactions", "Transactions bancaires", headers, rows);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  PDF
                </button>
              </>
            )}
            {txTotalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={txPage <= 1 || paginatedLoading}
                  onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span className="text-sm font-medium text-gray-500 min-w-[3rem] text-center">{txPage} / {txTotalPages}</span>
                <button
                  type="button"
                  disabled={txPage >= txTotalPages || paginatedLoading}
                  onClick={() => setTxPage((p) => Math.min(txTotalPages, p + 1))}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher..."
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent w-full sm:w-44"
            />
          </div>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setTxPage(1); }}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
          />
          <span className="text-xs text-gray-400">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setTxPage(1); }}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
          />
          <CategoryFilterDropdown value={categoryFilter} onChange={(v) => { setCategoryFilter(v); setTxPage(1); }} />
          {(searchQuery || dateFrom || dateTo || categoryFilter) && (
            <button
              type="button"
              onClick={() => { setSearchQuery(""); setDateFrom(""); setDateTo(""); setCategoryFilter(""); setTxPage(1); }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Réinitialiser
            </button>
          )}
        </div>

        {paginatedLoading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3.5 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-200 rounded" />
                  <div>
                    <div className="h-4 bg-gray-200 rounded w-40 mb-1" />
                    <div className="h-3 bg-gray-200 rounded w-24" />
                  </div>
                </div>
                <div className="h-4 bg-gray-200 rounded w-20" />
              </div>
            ))}
          </div>
        ) : paginatedTx.length === 0 ? (
          <div className="p-5 text-center text-sm text-gray-400">
            Aucune transaction trouvée.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[650px]">
            {/* Header */}
            <div className="grid grid-cols-[170px_1fr_200px_140px] border-b border-gray-200/60">
              <SortHeader label="Date" column="date" current={txSortBy} dir={txSortDir} onSort={(col, dir) => { setTxSortBy(col); setTxSortDir(dir); setTxPage(1); }} />
              <SortHeader label="Libellé" column="description" current={txSortBy} dir={txSortDir} onSort={(col, dir) => { setTxSortBy(col); setTxSortDir(dir); setTxPage(1); }} />
              <div className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Catégorie</div>
              <SortHeader label="Montant" column="amount" current={txSortBy} dir={txSortDir} onSort={(col, dir) => { setTxSortBy(col); setTxSortDir(dir); setTxPage(1); }} align="right" />
            </div>

            {/* Rows */}
            {paginatedTx.map((tx) => {
              const isExpanded = expandedTxId === tx.id;
              const txSign = Number(tx.amount) >= 0 ? "+" as const : "-" as const;
              const filteredCategories = CATEGORY_OPTIONS.filter(([, { sign }]) => sign === null || sign === txSign);
              return (
                <div key={tx.id} className="border-b border-gray-200/60 last:border-b-0">
                  <div className="grid grid-cols-[170px_1fr_200px_140px] items-center hover:bg-white/50 transition-colors">
                    <div className="px-5 py-3.5 text-sm text-gray-500 whitespace-nowrap">{formatDateFr(tx.date)}</div>
                    <div className="px-5 py-3.5 text-sm font-medium text-gray-900 truncate">{tx.cleanDescription || tx.description}</div>
                    <div className="px-5 py-3.5 text-sm">
                      <button
                        type="button"
                        onClick={() => setExpandedTxId(isExpanded ? null : tx.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          tx.category
                            ? "text-brand-700 bg-brand-50 hover:bg-brand-100"
                            : "text-gray-500 bg-gray-100 hover:bg-gray-200"
                        }`}
                      >
                        {tx.category && CATEGORIES[tx.category]?.icon && (
                          <span className="text-brand-500">{CATEGORIES[tx.category].icon}</span>
                        )}
                        {tx.category ? (CATEGORIES[tx.category]?.label ?? tx.category) : "À catégoriser"}
                        {!tx.category && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
                        )}
                      </button>
                    </div>
                    <div className={`px-5 py-3.5 text-base font-semibold text-right whitespace-nowrap ${
                      Number(tx.amount) >= 0 ? "text-green-600" : "text-gray-900"
                    }`}>
                      {Number(tx.amount) >= 0 ? "+" : ""}{formatCurrency(Number(tx.amount))}
                    </div>
                  </div>

                  {/* Expandable category panel */}
                  <div
                    className="overflow-hidden transition-all duration-300 ease-in-out"
                    style={{ maxHeight: isExpanded ? "200px" : "0", opacity: isExpanded ? 1 : 0 }}
                  >
                    <div className="px-5 pb-4 pt-1">
                      <div className="flex flex-wrap gap-2 justify-center">
                        {filteredCategories.map(([key, { label, icon }]) => (
                          <CategoryPill
                            key={key}
                            label={label}
                            icon={icon}
                            active={tx.category === key}
                            onClick={async () => {
                              const hadCategory = !!tx.category;
                              const result = await updateTransactionCategoryAction(tx.id, key);
                              if (result.success) {
                                setExpandedTxId(null);
                                const auto = result.autoCount ?? 0;
                                if (auto > 0) {
                                  toast.success(`${auto} transaction${auto > 1 ? "s" : ""} similaire${auto > 1 ? "s" : ""} catégorisée${auto > 1 ? "s" : ""} automatiquement`);
                                  // Refetch to reflect all changes
                                  fetchPaginatedTransactionsAction(
                                    txPage, TX_PER_PAGE, selectedAccount, txSortBy, txSortDir, txTab === "uncategorized",
                                    searchDebounced || null, dateFrom || null, dateTo || null, categoryFilter || null,
                                  ).then((r) => {
                                    if (r.transactions) {
                                      setPaginatedTx(r.transactions as Transaction[]);
                                      setPaginatedTotal(r.total ?? 0);
                                      if (r.uncategorizedCount !== undefined) setUncategorizedCount(r.uncategorizedCount);
                                    }
                                  });
                                } else {
                                  setPaginatedTx((prev) => prev.map((t) => t.id === tx.id ? { ...t, category: key } : t));
                                  if (!hadCategory) setUncategorizedCount((c) => Math.max(0, c - 1));
                                }
                                refreshKpis();
                              }
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}
      </div>

      {/* Default account selection modal */}
      <Modal open={!!needsDefaultAccount} onClose={() => {}}>
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Sélectionnez votre compte par défaut</h3>
            <p className="text-sm text-gray-500 mt-1">
              Choisissez le compte professionnel qui sera utilisé par défaut pour le suivi de votre activité.
            </p>
          </div>
          <div className="space-y-2">
            {accounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => setPendingDefaultId(acc.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all text-left ${
                  pendingDefaultId === acc.id
                    ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{acc.name}</p>
                  <p className="text-xs text-gray-400">{ACCOUNT_TYPE_LABELS[acc.type] || acc.type}</p>
                </div>
                <span className="text-sm font-semibold text-gray-900">{acc.balance != null ? formatCurrency(Number(acc.balance)) : "En attente"}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!pendingDefaultId || savingDefault}
            onClick={async () => {
              if (!pendingDefaultId) return;
              setSavingDefault(true);
              const result = await setDefaultBankAccountAction(pendingDefaultId);
              setSavingDefault(false);
              if (result.success) window.location.reload();
            }}
            className="w-full bg-brand-600 text-white text-sm font-medium py-2.5 rounded-lg transition-all hover:bg-brand-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingDefault ? "Enregistrement..." : "Confirmer le compte par défaut"}
          </button>
        </div>
      </Modal>

      {/* Alert threshold modal */}
      <Modal open={showAlertModal} onClose={() => setShowAlertModal(false)}>
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Alerte de trésorerie</h3>
            <p className="text-sm text-gray-500 mt-1">
              Recevez un email si le solde de votre compte passe sous un seuil défini.
            </p>
          </div>
          {alertLoading ? (
            <div className="py-6 text-center text-sm text-gray-400">Chargement...</div>
          ) : (
            <>
              <div>
                <label htmlFor="alert-threshold" className="block text-sm font-medium text-gray-700 mb-1">
                  Seuil d&apos;alerte (€)
                </label>
                <input
                  id="alert-threshold"
                  type="number"
                  min="0"
                  step="100"
                  value={alertThreshold}
                  onChange={(e) => setAlertThreshold(e.target.value)}
                  placeholder="Ex : 2000"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  Vous serez notifié par email (maximum une fois tous les 7 jours).
                </p>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  type="button"
                  role="switch"
                  aria-checked={alertEnabled}
                  onClick={() => setAlertEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${alertEnabled ? "bg-brand-600" : "bg-gray-200"}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${alertEnabled ? "translate-x-5" : "translate-x-0"}`} />
                </button>
                <span className="text-sm text-gray-700">Alerte activée</span>
              </label>
              <button
                type="button"
                disabled={!alertThreshold || alertSaving}
                onClick={saveAlert}
                className="w-full bg-brand-600 text-white text-sm font-medium py-2.5 rounded-lg transition-all hover:bg-brand-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {alertSaving ? "Enregistrement..." : "Enregistrer l'alerte"}
              </button>
            </>
          )}
        </div>
      </Modal>

      {/* Delete account confirmation modal */}
      <Modal open={!!deleteAccountId} onClose={() => setDeleteAccountId(null)}>
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Supprimer ce compte ?</h3>
            <p className="text-sm text-gray-500 mt-1">
              Toutes les transactions associées seront définitivement supprimées. Cette action est irréversible.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDeleteAccountId(null)}
              className="border-2 border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 rounded-lg transition-all hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={async () => {
                if (!deleteAccountId) return;
                setDeleting(true);
                const result = await deleteBankAccountAction(deleteAccountId);
                setDeleting(false);
                if (result.success) {
                  setDeleteAccountId(null);
                  if (selectedAccount === deleteAccountId) setSelectedAccount(null);
                  window.location.reload();
                } else {
                  toast.error(result.error || "Erreur lors de la suppression");
                }
              }}
              className="border-2 border-red-600 bg-red-600 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-all hover:bg-red-700 hover:border-red-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? "Suppression..." : "Supprimer"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Utilities ──

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);
}

function formatCurrencyRounded(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(amount));
}

function formatDateFr(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// ── Sub-components ──

function CategoryPill({ label, icon, active, onClick }: {
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <button
      type="button"
      disabled={saving}
      onClick={async () => { setSaving(true); await onClick(); setSaving(false); }}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
        saving ? "opacity-50 cursor-wait" :
        active ? "text-brand-700 bg-brand-100 border border-brand-300 ring-1 ring-brand-200" :
        "text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-gray-300"
      }`}
    >
      {icon && <span className={active ? "text-brand-600" : "text-gray-400"}>{icon}</span>}
      {saving ? "..." : label}
    </button>
  );
}

type SortColumn = "date" | "description" | "amount";

function CategoryFilterDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selected = value ? CATEGORIES[value] : null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-gray-200 rounded-md bg-white hover:bg-gray-50 transition-colors"
      >
        {selected?.icon && <span className="text-gray-400">{selected.icon}</span>}
        <span className={value ? "text-gray-700 font-medium" : "text-gray-500"}>{selected?.label ?? "Catégorie"}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-64 overflow-y-auto">
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); }}
            className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2 ${!value ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-50"}`}
          >
            Toutes les catégories
          </button>
          <div className="border-t border-gray-100 my-1" />
          {CATEGORY_OPTIONS.map(([key, { label, icon }]) => (
            <button
              key={key}
              type="button"
              onClick={() => { onChange(key); setOpen(false); }}
              className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2 ${value === key ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-50"}`}
            >
              <span className={value === key ? "text-brand-600" : "text-gray-400"}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SortHeader({ label, column, current, dir, onSort, align = "left" }: {
  label: string;
  column: SortColumn;
  current: SortColumn;
  dir: "asc" | "desc";
  onSort: (col: SortColumn, dir: "asc" | "desc") => void;
  align?: "left" | "right";
}) {
  const active = current === column;
  return (
    <div className={`px-5 py-3 text-${align}`}>
      <button
        type="button"
        onClick={() => onSort(column, active && dir === "desc" ? "asc" : "desc")}
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
          active ? "text-gray-700" : "text-gray-400 hover:text-gray-600"
        }`}
      >
        {label}
        <span className="flex flex-col -space-y-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={active && dir === "asc" ? "text-gray-700" : "text-gray-300"}><polyline points="18 15 12 9 6 15"/></svg>
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={active && dir === "desc" ? "text-gray-700" : "text-gray-300"}><polyline points="6 9 12 15 18 9"/></svg>
        </span>
      </button>
    </div>
  );
}
