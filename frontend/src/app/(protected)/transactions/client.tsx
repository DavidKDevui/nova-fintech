"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePractitioner } from "@/providers/practitioner-provider";
import { useData } from "@/providers/data-provider";
import { Modal } from "@/components/modal";
import { ConnectBankBanner } from "@/components/connect-bank-banner";
import { toast } from "sonner";
import { connectBankAction } from "@/actions/bridge";
import { setDefaultBankAccountAction } from "@/actions/bank-account";
import { getBankAlertAction, upsertBankAlertAction } from "@/actions/bank-alert";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: "Compte courant",
  savings: "Épargne",
  card: "Carte bancaire",
  loan: "Prêt",
  brokerage: "Compte-titres",
  life_insurance: "Assurance vie",
  investment: "Investissement",
};


const MONTH_NAMES = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
  "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc",
];

export function TransactionsClient() {
  const hp = usePractitioner();
  const { accounts, transactions, transactionsLoading: loading, transactionsError: error } = useData();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [showPrevYear, setShowPrevYear] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(hp?.defaultBankAccountId ?? null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [patrimoineYear, setPatrimoineYear] = useState(currentYear);
  const [showPatrimoinePrev, setShowPatrimoinePrev] = useState(false);
  const [pendingDefaultId, setPendingDefaultId] = useState<string | null>(null);
  const [savingDefault, setSavingDefault] = useState(false);

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

  // Filter by selected account
  const filteredAccounts = useMemo(() => {
    if (!selectedAccount) return accounts;
    return accounts.filter((a) => a.id === selectedAccount);
  }, [accounts, selectedAccount]);

  const filteredTransactions = useMemo(() => {
    const filtered = selectedAccount
      ? transactions.filter((tx) => tx.bankAccountId === selectedAccount)
      : transactions;
    return [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, selectedAccount]);

  // Build chart data grouped by month for selected year (+ optional prev year)
  const chartData = useMemo(() => {
    const MONTH_SHORT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
    const months: { key: string; label: string; revenus: number; depenses: number; revenusPrev?: number; depensesPrev?: number }[] = [];

    for (let m = 0; m < 12; m++) {
      const key = `${selectedYear}-${String(m + 1).padStart(2, "0")}`;
      months.push({
        key,
        label: MONTH_SHORT[m]!,
        revenus: 0,
        depenses: 0,
        ...(showPrevYear ? { revenusPrev: 0, depensesPrev: 0 } : {}),
      });
    }

    const monthMap = new Map(months.map((m) => [m.key, m]));

    for (const tx of filteredTransactions) {
      const [y, m] = tx.date.split("-");
      const key = `${y}-${m}`;
      const bucket = monthMap.get(key!);
      if (bucket) {
        const amount = Number(tx.amount);
        if (amount >= 0) bucket.revenus += amount;
        else bucket.depenses += Math.abs(amount);
      }

      // Previous year data
      if (showPrevYear && y === String(selectedYear - 1)) {
        const currentYearKey = `${selectedYear}-${m}`;
        const currentBucket = monthMap.get(currentYearKey!);
        if (currentBucket) {
          const amount = Number(tx.amount);
          if (amount >= 0) currentBucket.revenusPrev = (currentBucket.revenusPrev || 0) + amount;
          else currentBucket.depensesPrev = (currentBucket.depensesPrev || 0) + Math.abs(amount);
        }
      }
    }

    for (const m of months) {
      m.revenus = Math.round(m.revenus * 100) / 100;
      m.depenses = Math.round(m.depenses * 100) / 100;
      if (showPrevYear) {
        m.revenusPrev = Math.round((m.revenusPrev || 0) * 100) / 100;
        m.depensesPrev = Math.round((m.depensesPrev || 0) * 100) / 100;
      }
    }

    return months;
  }, [filteredTransactions, selectedYear, showPrevYear]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBarClick = useCallback((data: any) => {
    if (data?.activePayload?.[0]?.payload?.key) {
      setSelectedMonth(data.activePayload[0].payload.key);
    }
  }, []);

  const monthTransactions = useMemo(() => {
    if (!selectedMonth) return [];
    return filteredTransactions.filter((tx) => {
      const [y, m] = tx.date.split("-");
      return `${y}-${m}` === selectedMonth;
    });
  }, [selectedMonth, filteredTransactions]);

  const selectedMonthLabel = useMemo(() => {
    if (!selectedMonth) return "";
    const [y, m] = selectedMonth.split("-");
    const monthIdx = parseInt(m!, 10) - 1;
    const FULL_MONTHS = [
      "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
      "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
    ];
    return `${FULL_MONTHS[monthIdx]} ${y}`;
  }, [selectedMonth]);

  const lastSyncAt = useMemo(() => {
    const dates = accounts
      .map((a) => a.lastSyncAt)
      .filter((d): d is Date => d !== null);
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates.map((d) => new Date(d).getTime())));
  }, [accounts]);

  const nextSyncAt = useMemo(() => {
    if (!lastSyncAt) return null;
    const next = new Date(lastSyncAt);
    next.setDate(next.getDate() + 15);
    return next;
  }, [lastSyncAt]);

  // Build patrimoine (net worth) evolution chart
  const patrimoineData = useMemo(() => {
    const MONTH_SHORT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

    // Compute cumulative balance per month for the selected year
    const computeMonthlyBalance = (year: number) => {
      const monthly: number[] = Array(12).fill(0);
      for (const tx of filteredTransactions) {
        const [y, m] = tx.date.split("-");
        if (Number(y) === year) {
          monthly[Number(m) - 1] += Number(tx.amount);
        }
      }
      // Cumulative sum
      let cumul = 0;
      return monthly.map((v) => { cumul += v; return Math.round(cumul * 100) / 100; });
    };

    const balances = computeMonthlyBalance(patrimoineYear);
    const prevBalances = showPatrimoinePrev ? computeMonthlyBalance(patrimoineYear - 1) : null;

    return MONTH_SHORT.map((label, i) => ({
      label,
      solde: balances[i]!,
      ...(prevBalances ? { soldePrev: prevBalances[i]! } : {}),
    }));
  }, [filteredTransactions, patrimoineYear, showPatrimoinePrev]);

  const monthRevenus = monthTransactions.filter((tx) => Number(tx.amount) >= 0).reduce((s, tx) => s + Number(tx.amount), 0);
  const monthDépenses = monthTransactions.filter((tx) => Number(tx.amount) < 0).reduce((s, tx) => s + Math.abs(Number(tx.amount)), 0);

  if (!hp?.bridgeUserUuid) {
    return <ConnectBankBanner />;
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-5 animate-pulse">
          <div className="h-3 bg-gray-200 rounded w-24 mb-3" />
          <div className="h-6 bg-gray-200 rounded w-32" />
        </div>
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-5 animate-pulse">
          <div className="h-48 bg-gray-200 rounded" />
        </div>
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-5 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex justify-between py-3">
              <div className="h-4 bg-gray-200 rounded w-48" />
              <div className="h-4 bg-gray-200 rounded w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 p-4 text-sm text-red-600">{error}</div>
    );
  }

  const totalBalance = filteredAccounts.reduce((sum, acc) => sum + Number(acc.balance), 0);

  const totalRevenus = chartData.reduce((s, m) => s + m.revenus, 0);
  const totalDépenses = chartData.reduce((s, m) => s + m.depenses, 0);

  return (
    <div className="space-y-6">
      {/* Sync info */}
      {lastSyncAt && (
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-gray-500">
            <span>Dernière synchro : <span className="font-medium text-gray-700">{formatDateFr(lastSyncAt.toISOString().split("T")[0]!)}</span></span>
            {nextSyncAt && (
              <span>Prochaine synchro : <span className="font-medium text-gray-700">{formatDateFr(nextSyncAt.toISOString().split("T")[0]!)}</span></span>
            )}
            <InfoBadge tooltip={{ dot: "bg-blue-400", text: "Vos transactions sont synchronisées automatiquement tous les 15 jours via votre connexion bancaire." }} />
          </div>
        </div>
      )}

      {/* Account selector */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <select
          value={selectedAccount || ""}
          onChange={(e) => setSelectedAccount(e.target.value || null)}
          className="flex-1 bg-transparent text-sm font-medium text-gray-900 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="">Tous les comptes ({accounts.length})</option>
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name} — {acc.balance != null ? formatCurrency(Number(acc.balance)) : "—"}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={async () => {
            const result = await connectBankAction();
            if (result.url) window.location.href = result.url;
          }}
          className="shrink-0 flex items-center gap-1.5 bg-brand-600 px-3.5 py-2 text-xs font-medium text-white rounded-lg transition-all hover:bg-brand-700 active:scale-[0.98]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Ajouter un compte
        </button>
      </div>

      {/* Summary card */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Trésorerie disponible</p>
              <InfoBadge tooltip={{ dot: "bg-blue-500", text: "Solde actuel de votre compte professionnel, synchronisé automatiquement avec votre banque." }} />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{formatCurrency(totalBalance)}</p>
            <p className="text-xs text-gray-400 mt-1">{filteredAccounts.length} compte{filteredAccounts.length > 1 ? "s" : ""}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAlertModal(true)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
              alertConfigured
                ? "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
                : "border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={alertConfigured ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
            {alertConfigured ? `Alerte : ${formatCurrency(Number(alertThreshold))}` : "Alerte seuil"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="bg-green-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-green-700">Revenus ({selectedYear})</p>
              <InfoBadge tooltip={{ dot: "bg-green-500", text: "Total des entrées d'argent sur la période : virements CPAM, rétrocessions, honoraires." }} />
            </div>
            <p className="text-lg font-bold text-green-700 mt-0.5">+{formatCurrency(totalRevenus)}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-red-700">Dépenses ({selectedYear})</p>
              <InfoBadge tooltip={{ dot: "bg-red-600", text: "Total des sorties : cotisations (URSSAF, CARPIMKO), impôts, loyer, charges pro et perso." }} />
            </div>
            <p className="text-lg font-bold text-red-700 mt-0.5">-{formatCurrency(totalDépenses)}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-blue-700">Moyenne mensuelle nette</p>
              <InfoBadge tooltip={{ dot: "bg-blue-500", text: "Différence moyenne entre revenus et dépenses par mois sur l'année sélectionnée." }} />
            </div>
            <p className={`text-lg font-bold mt-0.5 ${totalRevenus - totalDépenses >= 0 ? "text-blue-700" : "text-red-600"}`}>{(totalRevenus - totalDépenses) / 12 >= 0 ? "+" : ""}{formatCurrency((totalRevenus - totalDépenses) / 12)}/mois</p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Revenus & Dépenses</h2>
            <p className="text-xs text-gray-400">Répartition mensuelle{showPrevYear ? ` — comparaison ${selectedYear - 1}` : ""}</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <button
              type="button"
              onClick={() => setShowPrevYear((v) => !v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                showPrevYear
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-900 bg-gray-100 hover:bg-gray-200"
              }`}
            >
              Comparer avec {selectedYear - 1}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedYear((y) => y - 1)}
                className="flex items-center justify-center w-7 h-7 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span className="text-sm font-medium text-gray-900 w-10 text-center">{selectedYear}</span>
              <button
                type="button"
                onClick={() => setSelectedYear((y) => y + 1)}
                disabled={selectedYear >= currentYear}
                className="flex items-center justify-center w-7 h-7 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>
        </div>
        <div className="h-52 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={2} onClick={handleBarClick} style={{ cursor: "pointer" }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: 0,
                  fontSize: 13,
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => [formatCurrency(Number(value ?? 0)), name]}
              />
              <Legend formatter={(value: string) => <span className="text-xs text-gray-500">{value}</span>} />
              {showPrevYear && <Bar dataKey="revenusPrev" fill="#86efac" radius={[2, 2, 0, 0]} animationDuration={300} name={`Revenus ${selectedYear - 1}`} />}
              {showPrevYear && <Bar dataKey="depensesPrev" fill="#fca5a5" radius={[2, 2, 0, 0]} animationDuration={300} name={`Dépenses ${selectedYear - 1}`} />}
              <Bar dataKey="revenus" fill="#16a34a" radius={[2, 2, 0, 0]} animationDuration={300} name={`Revenus ${selectedYear}`} />
              <Bar dataKey="depenses" fill="#DC2626" radius={[2, 2, 0, 0]} animationDuration={300} name={`Dépenses ${selectedYear}`} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Patrimoine evolution chart */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Évolution du patrimoine</h2>
            <p className="text-xs text-gray-400">Solde cumulé mensuel{showPatrimoinePrev ? ` — comparaison ${patrimoineYear - 1}` : ""}</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <button
              type="button"
              onClick={() => setShowPatrimoinePrev((v) => !v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                showPatrimoinePrev
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-900 bg-gray-100 hover:bg-gray-200"
              }`}
            >
              Comparer avec {patrimoineYear - 1}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPatrimoineYear((y) => y - 1)}
                className="flex items-center justify-center w-7 h-7 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span className="text-sm font-medium text-gray-900 w-10 text-center">{patrimoineYear}</span>
              <button
                type="button"
                onClick={() => setPatrimoineYear((y) => y + 1)}
                disabled={patrimoineYear >= currentYear}
                className="flex items-center justify-center w-7 h-7 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>
        </div>
        <div className="h-52 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={patrimoineData}>
              <defs>
                <linearGradient id="soldeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EC6C12" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#EC6C12" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="soldePrevGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#9ca3af" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#9ca3af" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: 0,
                  fontSize: 13,
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => [
                  formatCurrency(Number(value ?? 0)),
                  name === "soldePrev" ? `Solde ${patrimoineYear - 1}` : `Solde ${patrimoineYear}`,
                ]}
              />
              <Legend formatter={(value: string) => <span className="text-xs text-gray-500">{value}</span>} />
              {showPatrimoinePrev && (
                <Area
                  type="monotone"
                  dataKey="soldePrev"
                  stroke="#d1d5db"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  fill="url(#soldePrevGradient)"
                  animationDuration={300}
                  name={`Solde ${patrimoineYear - 1}`}
                />
              )}
              <Area
                type="monotone"
                dataKey="solde"
                stroke="#EC6C12"
                strokeWidth={2}
                fill="url(#soldeGradient)"
                animationDuration={300}
                name={`Solde ${patrimoineYear}`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Transactions list */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Transactions récentes</h2>
          <p className="text-xs text-gray-400">{filteredTransactions.length} transaction{filteredTransactions.length > 1 ? "s" : ""}</p>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="p-5 text-center text-sm text-gray-400">
            Aucune transaction trouvée.
          </div>
        ) : (
          <div className="h-[375px] overflow-y-auto divide-y divide-gray-100">
            {filteredTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-white/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex items-center justify-center w-8 h-8 shrink-0 ${
                    Number(tx.amount) >= 0 ? "bg-brand-50 text-brand-600" : "bg-gray-100 text-gray-500"
                  }`}>
                    {Number(tx.amount) >= 0 ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {tx.cleanDescription || tx.description}
                    </p>
                    <p className="text-xs text-gray-400">{formatDateFr(tx.date)}</p>
                  </div>
                </div>
                <span className={`text-sm font-semibold shrink-0 ml-4 ${
                  Number(tx.amount) >= 0 ? "text-brand-600" : "text-gray-900"
                }`}>
                  {Number(tx.amount) >= 0 ? "+" : ""}{formatCurrency(Number(tx.amount))}
                </span>
              </div>
            ))}
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
              if (result.success) {
                window.location.reload();
              }
            }}
            className="w-full bg-brand-600 text-white text-sm font-medium py-2.5 rounded-lg transition-all hover:bg-brand-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingDefault ? "Enregistrement..." : "Confirmer le compte par défaut"}
          </button>
        </div>
      </Modal>

      {/* Month detail modal */}
      <Modal open={!!selectedMonth} onClose={() => setSelectedMonth(null)}>
        <div className="max-h-[70vh] flex flex-col">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-gray-900">{selectedMonthLabel}</h3>
            <div className="flex gap-4 mt-2">
              <p className="text-xs text-gray-400">
                Revenus : <span className="font-semibold text-brand-600">{formatCurrency(monthRevenus)}</span>
              </p>
              <p className="text-xs text-gray-400">
                Dépenses : <span className="font-semibold text-gray-900">{formatCurrency(monthDépenses)}</span>
              </p>
            </div>
          </div>

          {monthTransactions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucune transaction ce mois-ci.</p>
          ) : (
            <div className="overflow-y-auto -mx-6 px-6 divide-y divide-gray-100">
              {monthTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex items-center justify-center w-7 h-7 shrink-0 ${
                      Number(tx.amount) >= 0 ? "bg-brand-50 text-brand-600" : "bg-gray-100 text-gray-500"
                    }`}>
                      {Number(tx.amount) >= 0 ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {tx.cleanDescription || tx.description}
                      </p>
                      <p className="text-xs text-gray-400">{formatDateFr(tx.date)}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold shrink-0 ml-3 ${
                    Number(tx.amount) >= 0 ? "text-brand-600" : "text-gray-900"
                  }`}>
                    {Number(tx.amount) >= 0 ? "+" : ""}{formatCurrency(Number(tx.amount))}
                  </span>
                </div>
              ))}
            </div>
          )}
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
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                    alertEnabled ? "bg-brand-600" : "bg-gray-200"
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    alertEnabled ? "translate-x-5" : "translate-x-0"
                  }`} />
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
    </div>
  );
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function formatDateFr(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function InfoBadge({ tooltip }: { tooltip: { dot: string; text: string } }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
        className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-500 hover:text-gray-700 text-xs font-semibold transition-colors"
      >
        i
      </button>
      {open && (
        <div className="absolute top-7 left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs text-gray-600 z-[60]">
          <span className={`inline-block w-2 h-2 rounded-full ${tooltip.dot} mr-2`} />
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
