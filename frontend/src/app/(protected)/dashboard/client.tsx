"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useUser } from "@/providers/user-provider";
import { usePractitioner } from "@/providers/practitioner-provider";
import { useData } from "@/providers/data-provider";
import { PracticeSuggestionBanner } from "@/components/practice-suggestion-banner";

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  en_attente: { label: "En attente", color: "text-amber-700", bg: "bg-amber-50" },
  paye: { label: "Payé", color: "text-green-700", bg: "bg-green-50" },
  rejete: { label: "Rejeté", color: "text-red-700", bg: "bg-red-50" },
};

export function DashboardClient() {
  const user = useUser();
  const hp = usePractitioner();
  const {
    facturationSummary: summary,
    facturationLoading: loading,
    accounts,
    transactions,
    transactionsLoading: bankLoading,
  } = useData();

  const name = hp?.firstName || user.email.split("@")[0] || "";

  // Get default account balance
  const bankConnected = !!hp?.bridgeUserUuid;
  const defaultAccount = hp?.defaultBankAccountId
    ? accounts.find((a) => a.id === hp.defaultBankAccountId)
    : null;
  const solde = defaultAccount ? Number(defaultAccount.balance) : null;

  // Last 30 days revenue & expenses on default account
  const { revenus30j, depenses30j } = useMemo(() => {
    if (!hp?.defaultBankAccountId) return { revenus30j: 0, depenses30j: 0 };
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString().split("T")[0]!;

    let rev = 0;
    let dep = 0;
    for (const tx of transactions) {
      if (tx.bankAccountId !== hp.defaultBankAccountId) continue;
      if (tx.date < cutoff) continue;
      const amount = Number(tx.amount);
      if (amount >= 0) rev += amount;
      else dep += Math.abs(amount);
    }
    return { revenus30j: Math.round(rev * 100) / 100, depenses30j: Math.round(dep * 100) / 100 };
  }, [transactions, hp?.defaultBankAccountId]);

  return (
    <div>
      <h1 className="text-xl md:text-2xl font-bold mb-1">Hello, {name}</h1>
      <p className="text-sm text-gray-400 mb-6 md:mb-8">Voici un aperçu de votre activité.</p>

      <PracticeSuggestionBanner />

      {/* Row 1: existing Facturation + Trésorerie */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FacturationCard loading={loading} summary={summary} />
        <TresorerieCard
          bankLoading={bankLoading}
          bankConnected={bankConnected}
          solde={solde}
          defaultAccount={defaultAccount}
          revenus30j={revenus30j}
          depenses30j={depenses30j}
        />
      </div>

    </div>
  );
}

/* ─── 0a. Facturation (existing) ─── */
function FacturationCard({ loading, summary }: { loading: boolean; summary: ReturnType<typeof useData>["facturationSummary"] }) {
  if (loading) return <SkeletonCard />;
  if (!summary || summary.passageCount === 0) {
    return (
      <Card className="flex items-center justify-center min-h-[200px]">
        <p className="text-sm text-gray-400">Aucune donnée de facturation disponible.</p>
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <SectionLabel icon={<DocIcon />}>Total CA — Payé</SectionLabel>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(summary.totalCA)}</p>
          <p className="text-xs text-gray-400 mt-1">{summary.byStatus.paye.count} facture{summary.byStatus.paye.count > 1 ? "s" : ""}</p>
        </div>
        <DetailLink href="/facturation" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Object.entries({
          en_attente: {
            count: summary.byStatus.a_securiser.count + summary.byStatus.a_envoyer.count,
            total: summary.byStatus.a_securiser.total + summary.byStatus.a_envoyer.total,
          },
          rejete: summary.byStatus.rejete,
        }).map(([status, data]) => {
          if (data.count === 0) return null;
          const style = STATUS_LABELS[status];
          if (!style) return null;
          return (
            <div key={status} className={`${style.bg} rounded-lg p-3`}>
              <div className="flex items-center gap-1.5">
                {status === "en_attente" && <ClockIcon className={style.color} />}
                {status === "rejete" && <XCircleIcon className={style.color} />}
                <p className={`text-xs font-medium ${style.color}`}>{style.label}</p>
              </div>
              <p className={`text-lg font-bold ${style.color} mt-0.5`}>{formatCurrency(data.total)}</p>
              <p className="text-xs text-gray-400">{data.count} facture{data.count > 1 ? "s" : ""}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ─── 0b. Trésorerie (existing) ─── */
function TresorerieCard({
  bankLoading, bankConnected, solde, defaultAccount, revenus30j, depenses30j,
}: {
  bankLoading: boolean; bankConnected: boolean; solde: number | null;
  defaultAccount: { name: string; lastSyncAt: Date | null } | null | undefined;
  revenus30j: number; depenses30j: number;
}) {
  if (bankLoading) return <SkeletonCard />;
  if (bankConnected && solde !== null) {
    return (
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <SectionLabel icon={<CreditCardIcon />}>Trésorerie disponible</SectionLabel>
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(solde)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {defaultAccount?.name}
              {defaultAccount?.lastSyncAt && (
                <span className="ml-2 text-gray-300">· Synchro {formatDateRelative(new Date(defaultAccount.lastSyncAt))}</span>
              )}
            </p>
          </div>
          <DetailLink href="/transactions" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50 rounded-lg p-3">
            <div className="flex items-center gap-1.5">
              <ArrowUpIcon className="text-green-700" />
              <p className="text-xs font-medium text-green-700">Entrées d&apos;argent</p>
            </div>
            <p className="text-lg font-bold text-green-700 mt-0.5">+{formatCurrency(revenus30j)}</p>
            <p className="text-xs text-gray-400">30 derniers jours glissants</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <div className="flex items-center gap-1.5">
              <ArrowDownIcon className="text-red-700" />
              <p className="text-xs font-medium text-red-700">Dépenses professionnelles</p>
            </div>
            <p className="text-lg font-bold text-red-700 mt-0.5">-{formatCurrency(depenses30j)}</p>
            <p className="text-xs text-gray-400">30 derniers jours glissants</p>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card className="relative overflow-hidden">
      <div className="blur-sm select-none pointer-events-none">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Trésorerie disponible</p>
          <p className="text-3xl font-bold text-gray-900">1 234,56 €</p>
          <p className="text-xs text-gray-400 mt-1">Compte pro</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-xs font-medium text-green-700">Entrées d&apos;argent</p>
            <p className="text-lg font-bold text-green-700 mt-0.5">+3 200 €</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <p className="text-xs font-medium text-red-700">Dépenses professionnelles</p>
            <p className="text-lg font-bold text-red-700 mt-0.5">-1 850 €</p>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <Link
          href="/transactions"
          className="flex items-center gap-2 px-4 py-2.5 bg-white/80 backdrop-blur-sm border border-gray-200 text-xs font-medium text-gray-700 rounded-lg shadow-md hover:bg-white hover:shadow-lg transition-all"
        >
          <CreditCardIcon />
          {bankConnected ? "Choisir mon compte par défaut" : "Ajouter un compte bancaire"}
        </Link>
      </div>
    </Card>
  );
}

/* ─── Shared components ─── */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-5 ${className}`}>{children}</div>;
}

function SectionLabel({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1.5">
      {icon}
      {children}
    </p>
  );
}

function DetailLink({ href }: { href: string }) {
  return (
    <Link href={href} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors">
      Voir le détail
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <div className="animate-pulse">
        <div className="h-3 bg-gray-200 rounded w-24 mb-3" />
        <div className="h-6 bg-gray-200 rounded w-32 mb-6" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map((i) => <div key={i} className="h-16 bg-gray-200 rounded" />)}
        </div>
      </div>
    </Card>
  );
}

/* ─── Helpers ─── */
function formatCurrency(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);
}

function formatDateRelative(date: Date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "aujourd'hui";
  if (diffDays === 1) return "hier";
  if (diffDays < 7) return `il y a ${diffDays}j`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/* ─── Icons ─── */
function DocIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>;
}
function CreditCardIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>;
}
function ClockIcon({ className = "text-gray-400" }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
}
function XCircleIcon({ className = "text-gray-400" }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>;
}
function ArrowUpIcon({ className = "text-green-700" }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>;
}
function ArrowDownIcon({ className = "text-red-700" }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>;
}
