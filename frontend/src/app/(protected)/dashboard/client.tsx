"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useUser } from "@/providers/user-provider";
import { usePractitioner } from "@/providers/practitioner-provider";
import { useData } from "@/providers/data-provider";
import { PracticeSuggestionBanner } from "@/components/practice-suggestion-banner";
import { DataMissingOverlay } from "@/components/data-missing-overlay";
import { getTransactionKpisAction } from "@/actions/transaction";
import { getCotisationsEstimate, type CotisationsEstimate } from "@/actions/cotisations-estimate";
import { getHealthScoreAction, type HealthScore } from "@/actions/health-score";
import { getEffectiveCAAction, type EffectiveCA, type EffectiveCASource } from "@/actions/effective-ca";
import { HealthScoreCard } from "@/components/health-score-card";
import { CASourceIndicator } from "@/components/ca-source-indicator";
import {
  buildCalendar,
  MONTH_NAMES,
  EVENT_DOT,
  getUpcomingEvents,
  type PaymentPreferences,
  DEFAULT_PREFERENCES,
} from "@/lib/data/fiscal-calendar";

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
    facturationPassages: passages,
    facturationLoading: loading,
    accounts,
    transactions,
    transactionsLoading: bankLoading,
    uncategorizedCount,
  } = useData();

  const name = hp?.firstName || user.email.split("@")[0] || "";

  // Get default account balance
  const bankConnected = !!hp?.bridgeUserUuid;
  const defaultAccount = hp?.defaultBankAccountId
    ? accounts.find((a) => a.id === hp.defaultBankAccountId)
    : null;
  const solde = defaultAccount ? Number(defaultAccount.balance) : null;

  // KPIs from server (same as /transactions)
  const [kpiEncaissement, setKpiEncaissement] = useState(0);
  const [kpiDecaissement, setKpiDecaissement] = useState(0);
  const [kpiNbDepenses, setKpiNbDepenses] = useState(0);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [estimate, setEstimate] = useState<CotisationsEstimate | null>(null);
  const [effectiveCA, setEffectiveCA] = useState<EffectiveCA>({ ca: 0, source: "none" });
  const [healthScore, setHealthScore] = useState<HealthScore | null>(null);
  const [healthScoreLoading, setHealthScoreLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getHealthScoreAction().then((result) => {
      if (cancelled) return;
      setHealthScore(result);
      setHealthScoreLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    if (!hp?.bridgeUserUuid) { setKpiLoading(false); return; }
    getTransactionKpisAction(hp.defaultBankAccountId).then((result) => {
      setKpiEncaissement(result.encaissement);
      setKpiDecaissement(result.decaissement);
      setKpiNbDepenses(result.nbTransactionsDepenses ?? 0);
      setKpiLoading(false);
    });
  }, [hp?.bridgeUserUuid, hp?.defaultBankAccountId]);

  // CA et nb factures de l'année courante (cohérent avec les autres KPIs du dashboard)
  const currentYear = new Date().getFullYear();
  const nbFacturesCurrentYear = useMemo(() => {
    let count = 0;
    for (const p of passages) {
      if (p.status !== "paye") continue;
      if (parseInt(p.careDate.split("-")[0]!, 10) !== currentYear) continue;
      count++;
    }
    return count;
  }, [passages, currentYear]);

  useEffect(() => {
    getEffectiveCAAction(currentYear, "bordereaux").then(setEffectiveCA).catch(() => {});
  }, [currentYear]);

  // Cotisations estimate (annual URSSAF + CARPIMKO projected from YTD CA) — used by EcheancesCard.
  useEffect(() => {
    if (effectiveCA.ca <= 0) return;
    getCotisationsEstimate(effectiveCA.ca).then((res) => {
      if (res) setEstimate(res);
    }).catch(() => {});
  }, [effectiveCA.ca]);

  // Profile completion
  const profileCompletion = useMemo(() => {
    if (!hp) return 0;
    const fields = [
      hp.firstName,
      hp.lastName,
      hp.profession,
      hp.activityStartDate,
      hp.taxRegime,
      hp.rppsNumber,
      hp.bridgeUserUuid,
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }, [hp]);

  const hasWarnings = !bankConnected || uncategorizedCount > 0;

  // Évolution trésorerie vs mois dernier
  const soldePrevMonth = useMemo(() => {
    if (solde === null) return null;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let thisMonthBalance = 0;
    for (const tx of transactions) {
      if (hp?.defaultBankAccountId && tx.bankAccountId !== hp.defaultBankAccountId) continue;
      if (tx.date.startsWith(thisMonth)) thisMonthBalance += Number(tx.amount);
    }
    return solde - thisMonthBalance;
  }, [transactions, hp, solde]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-start">
      <div>
        <h1 className="text-xl md:text-2xl font-bold mb-1">Hello {name},</h1>
        <p className="text-sm text-gray-400 mb-4">On fait le point ensemble ?</p>

        <HealthScoreCard loading={healthScoreLoading} data={healthScore} />

        {profileCompletion < 100 && (
          <div className="rounded-lg bg-white backdrop-blur-xl border border-gray-200/70 px-3.5 py-3 mb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Profil complété</span>
              <span className="text-sm font-semibold text-gray-900">{profileCompletion}%</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-brand-600 rounded-full transition-all" style={{ width: `${profileCompletion}%` }} />
            </div>
            <Link href="/profile" className="text-xs text-gray-400 hover:text-gray-600 mt-1.5 inline-block transition-colors">
              Compléter mon profil
            </Link>
          </div>
        )}

        {hasWarnings && (
          <div className="flex flex-col gap-1.5">
            {!bankConnected && (
              <div className="bg-red-50 px-4 py-3 rounded-lg">
                <div className="flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" className="shrink-0">
                    <rect x="2" y="4" width="20" height="16" rx="3" fill="#F87171" opacity="0.6" />
                    <rect x="2" y="4" width="20" height="5" rx="3" fill="#EF4444" />
                    <line x1="6" y1="13" x2="10" y2="13" stroke="#FCA5A5" strokeWidth="1.5" />
                    <line x1="6" y1="16" x2="12" y2="16" stroke="#FCA5A5" strokeWidth="1.5" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-red-900">Compte bancaire non connecté</p>
                    <p className="text-xs text-red-700">Connectez votre banque pour suivre votre trésorerie.</p>
                  </div>
                  <Link href="/transactions" className="shrink-0 bg-red-600 px-2.5 py-1 text-xs font-medium text-white rounded-md hover:bg-red-700 transition-colors">
                    Connecter
                  </Link>
                </div>
              </div>
            )}

            {uncategorizedCount > 0 && (
              <div className="bg-amber-50 px-4 py-3 rounded-lg">
                <div className="flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" className="shrink-0">
                    <rect x="3" y="3" width="18" height="18" rx="3" fill="#FBBF24" opacity="0.5" />
                    <rect x="3" y="3" width="18" height="6" rx="3" fill="#F59E0B" />
                    <rect x="7" y="12" width="4" height="2" rx="0.5" fill="#FDE68A" />
                    <rect x="13" y="12" width="4" height="2" rx="0.5" fill="#FDE68A" />
                    <rect x="7" y="16" width="4" height="2" rx="0.5" fill="#FDE68A" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-900">{uncategorizedCount} transaction{uncategorizedCount > 1 ? "s" : ""} à catégoriser</p>
                    <p className="text-xs text-amber-700">Catégorisez vos transactions pour un suivi précis.</p>
                  </div>
                  <Link href="/transactions" className="shrink-0 bg-amber-600 px-2.5 py-1 text-xs font-medium text-white rounded-md hover:bg-amber-700 transition-colors">
                    Voir
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        <PracticeSuggestionBanner />
      </div>

      <div className="flex flex-col gap-4">
        <FacturationCard loading={loading} summary={summary} />
        <TresorerieCard
          bankLoading={bankLoading || kpiLoading}
          bankConnected={bankConnected}
          solde={solde}
          soldePrevMonth={soldePrevMonth}
          encaissement={kpiEncaissement}
          decaissement={kpiDecaissement}
          ca={effectiveCA.ca}
          caSource={effectiveCA.source}
          nbFactures={nbFacturesCurrentYear}
          nbTransactionsDepenses={kpiNbDepenses}
        />
        <EcheancesCard hp={hp} estimate={estimate} />
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
          <h2 className="text-lg font-semibold text-gray-900">Suivi de mon activité</h2>
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

/* ─── 0b. Trésorerie (row de 4 KPIs) ─── */
function TresorerieCard({
  bankLoading, bankConnected, solde, soldePrevMonth, encaissement, decaissement, ca, caSource, nbFactures, nbTransactionsDepenses,
}: {
  bankLoading: boolean; bankConnected: boolean; solde: number | null; soldePrevMonth: number | null;
  encaissement: number; decaissement: number; ca: number; caSource: EffectiveCASource; nbFactures: number; nbTransactionsDepenses: number;
}) {
  if (bankLoading) return <SkeletonCard />;
  const remuneration = encaissement - decaissement;
  const monthsElapsed = Math.max(1, new Date().getMonth() + 1);
  const remunerationMensuelle = Math.round(remuneration / monthsElapsed);

  // Évolution trésorerie vs mois dernier
  let evolTreso: string | null = null;
  if (solde !== null && soldePrevMonth !== null && soldePrevMonth !== 0) {
    const pct = Math.round(((solde - soldePrevMonth) / Math.abs(soldePrevMonth)) * 100);
    evolTreso = pct >= 0 ? `+${pct}% vs mois dernier` : `${pct}% vs mois dernier`;
  }

  return (
    <Card className="relative overflow-hidden">
      <DataMissingOverlay bankConnected={bankConnected} />
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Vue financière</h2>
          <p className="text-[11px] text-gray-400">Année {new Date().getFullYear()}</p>
        </div>
        <DetailLink href="/transactions" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
        <KpiTile label="Trésorerie" value={solde !== null ? formatCurrencyRounded(solde) : "—"} sub={evolTreso} icon={<KpiWalletIcon />} iconColor="text-blue-400" />
        <KpiTile
          label={<>Chiffre d&apos;affaires <CASourceIndicator source={caSource} /></>}
          value={formatCurrencyRounded(ca)}
          sub={caSource === "bordereaux" ? `${nbFactures} facture${nbFactures > 1 ? "s" : ""}` : null}
          icon={<KpiChartIcon />}
          iconColor="text-green-400"
        />
        <KpiTile label="Dépenses" value={formatCurrencyRounded(decaissement)} sub={`${nbTransactionsDepenses} transaction${nbTransactionsDepenses > 1 ? "s" : ""}`} icon={<KpiExpenseIcon />} iconColor="text-red-400" />
        <KpiTile label="Rémunération" value={formatCurrencyRounded(remuneration)} sub={`~${formatCurrencyRounded(remunerationMensuelle)}/mois`} icon={<KpiCoinIcon />} iconColor="text-amber-400" />
      </div>
    </Card>
  );
}

function KpiTile({ label, value, sub, icon, iconColor = "text-gray-300" }: { label: React.ReactNode; value: string; sub?: string | null; icon: React.ReactNode; iconColor?: string }) {
  return (
    <div className="flex flex-col items-center py-2 px-1.5">
      <p className="text-xs font-medium text-gray-400 mb-1 flex items-center gap-1.5">
        <span className={iconColor}>{icon}</span>
        {label}
      </p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ─── 0c. Échéances ─── */
function EcheancesCard({ hp, estimate }: { hp: ReturnType<typeof usePractitioner>; estimate: CotisationsEstimate | null }) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();

  const prefs: PaymentPreferences = useMemo(() => {
    if (!hp) return DEFAULT_PREFERENCES;
    return {
      urssafFrequency: hp.urssafFrequency,
      urssafPayDay: hp.urssafPayDay,
      pasFrequency: hp.pasFrequency,
      carpimkoFrequency: hp.carpimkoFrequency,
      carpimkoPayDay: hp.carpimkoPayDay,
      activityStartDate: hp.activityStartDate,
    };
  }, [hp]);

  const calendar = useMemo(() => {
    const cal = buildCalendar(prefs);
    if (!estimate) return cal;
    for (const month of Object.keys(cal)) {
      const m = Number(month);
      if (m > currentMonth) continue;
      for (const evt of cal[m]) {
        if (evt.type === "urssaf") evt.estimatedAmount = estimate.urssafParEcheance;
        else if (evt.type === "carpimko") evt.estimatedAmount = estimate.carpimkoParEcheance;
        else if (evt.type === "ir") evt.estimatedAmount = estimate.pasParEcheance;
      }
    }
    return cal;
  }, [prefs, estimate, currentMonth]);

  const upcoming = useMemo(() => {
    return getUpcomingEvents(currentMonth, currentDay, 4, calendar);
  }, [currentMonth, currentDay, calendar]);

  if (!hp) return null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Prochaines échéances</h2>
        <DetailLink href="/deadlines" />
      </div>
      {upcoming.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">Aucune échéance à venir.</p>
      ) : (
        <div className="divide-y divide-gray-100 -mx-5">
          {upcoming.map((evt, i) => {
            return (
              <div key={i} className="flex items-center gap-3 px-5 py-2">
                <div className="w-10 shrink-0">
                  <p className="text-[10px] uppercase text-gray-400">{MONTH_NAMES[evt.month]?.slice(0, 3)}</p>
                  <p className="text-lg font-bold text-gray-900 -mt-0.5">{evt.day}</p>
                </div>
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${EVENT_DOT[evt.type]}`} />
                <p className="text-sm text-gray-800 truncate flex-1 min-w-0">{evt.label}</p>
                {evt.estimatedAmount != null && evt.estimatedAmount > 0 && (
                  <span className="text-sm font-bold text-gray-900 shrink-0">~{formatCurrencyRounded(evt.estimatedAmount)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ─── Shared components ─── */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white backdrop-blur-xl border border-gray-200/70 rounded-[15px] p-5 ${className}`}>{children}</div>;
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

function formatCurrencyRounded(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(amount));
}

/* ─── Icons ─── */
function ClockIcon({ className = "text-gray-400" }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
}
function XCircleIcon({ className = "text-gray-400" }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>;
}
function KpiWalletIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="14" rx="2.5" fill="currentColor" opacity="0.5" /><rect x="2" y="6" width="20" height="4" rx="2.5" fill="currentColor" opacity="0.7" /><circle cx="17" cy="15" r="1.5" fill="currentColor" opacity="0.3" /></svg>;
}
function KpiChartIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="4" height="9" rx="1" fill="currentColor" opacity="0.4" /><rect x="10" y="7" width="4" height="14" rx="1" fill="currentColor" opacity="0.6" /><rect x="17" y="3" width="4" height="18" rx="1" fill="currentColor" opacity="0.45" /></svg>;
}
function KpiExpenseIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.4" /><path d="M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" /></svg>;
}
function KpiCoinIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.4" /><path d="M12 7v10M9 9.5c0-.8 1.3-1.5 3-1.5s3 .7 3 1.5-1.3 1.5-3 1.5-3 .7-3 1.5 1.3 1.5 3 1.5 3-.7 3-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" /></svg>;
}
