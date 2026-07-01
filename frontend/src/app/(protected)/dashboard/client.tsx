"use client";

import { useEffect, useState, useMemo } from "react";
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import Link from "next/link";
import { useUser } from "@/providers/user-provider";
import { usePractitioner } from "@/providers/practitioner-provider";
import { useData } from "@/providers/data-provider";
import { PracticeSuggestionBanner } from "@/components/practice-suggestion-banner";
import { DataMissingOverlay } from "@/components/data-missing-overlay";
import { getTransactionKpisAction, getMonthlyActivityAction, type MonthlyActivityMonth } from "@/actions/transaction";
import { getCotisationsEstimate, type CotisationsEstimate } from "@/actions/cotisations-estimate";
import { getHealthScoreAction, type HealthScore } from "@/actions/health-score";
import { getEffectiveCAAction, type EffectiveCASource } from "@/actions/effective-ca";
import { getMonthlyActivityFromBordereauxAction } from "@/actions/monthly-activity-bordereaux";
import { HealthScoreCard } from "@/components/health-score-card";
import { CASourceIndicator } from "@/components/ca-source-indicator";
import {
  buildCalendar,
  MONTH_NAMES,
  EVENT_BADGE,
  EVENT_SUBTITLE,
  getUpcomingEvents,
  type PaymentPreferences,
  DEFAULT_PREFERENCES,
} from "@/lib/data/fiscal-calendar";

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  en_attente: { label: "En attente", color: "text-brand-700", bg: "bg-brand-50" },
  paye: { label: "Payé", color: "text-menthe-700", bg: "bg-menthe-50" },
  rejete: { label: "Rejeté", color: "text-alerte-600", bg: "bg-alerte-50" },
};

export function DashboardClient() {
  const user = useUser();
  const hp = usePractitioner();
  const {
    facturationSummary: summary,
    facturationPassages: passages,
    facturationLoading: loading,
    accounts,
    transactionsLoading: bankLoading,
    uncategorizedCount,
    effectiveCA,
    cotisationsEstimate: estimate,
    defaultBankAccountMissing,
  } = useData();

  const name = hp?.firstName || user.email.split("@")[0] || "";

  // Mois sélectionné (par défaut : mois courant). Scope les cards mensuelles (CA, dépenses).
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth());

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

  // effectiveCA + estimation cotisations : centralisés dans DataProvider (useData ci-dessus).

  const hasWarnings = !bankConnected || uncategorizedCount > 0;

  // ── Reste à vivre (horizon « fin du mois ») ──
  // Mêmes requêtes que /management (RemainderTab) : CA effectif + activité
  // mensuelle (avec fallback bordereaux) + estimation cotisations.
  const [ravMonths, setRavMonths] = useState<MonthlyActivityMonth[]>([]);
  const [ravEstimate, setRavEstimate] = useState<CotisationsEstimate | null>(null);
  const [ravLoading, setRavLoading] = useState(true);
  // Source réelle des données mensuelles : "transactions" = données bancaires,
  // "bordereaux"/"none" = pas de transactions bancaires exploitables. Optimiste au
  // départ pour ne pas faire clignoter le message pendant le chargement.
  const [ravSource, setRavSource] = useState<EffectiveCASource>("transactions");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const eca = await getEffectiveCAAction(currentYear, "transactions");
      const useFallback = eca.source === "bordereaux";
      const monthly = useFallback
        ? await getMonthlyActivityFromBordereauxAction(currentYear)
        : await getMonthlyActivityAction(currentYear);
      const months = monthly.months ?? [];
      const totalCA = months.reduce((s, m) => s + m.income, 0);
      const est = totalCA > 0 ? await getCotisationsEstimate(totalCA, 0, currentYear) : null;
      if (cancelled) return;
      setRavMonths(months);
      setRavEstimate(est);
      setRavSource(eca.source);
      setRavLoading(false);
    })().catch(() => { if (!cancelled) setRavLoading(false); });
    return () => { cancelled = true; };
  }, [currentYear]);

  const resteAVivre = useMemo(() => {
    const prefs: PaymentPreferences = hp
      ? {
          urssafFrequency: hp.urssafFrequency,
          urssafPayDay: hp.urssafPayDay,
          pasFrequency: hp.pasFrequency,
          carpimkoFrequency: hp.carpimkoFrequency,
          carpimkoPayDay: hp.carpimkoPayDay,
          activityStartDate: hp.activityStartDate,
        }
      : DEFAULT_PREFERENCES;
    const calendar = buildCalendar(prefs);

    const now = new Date();
    const currentMonthIdx = now.getMonth();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(currentYear, currentMonthIdx + 1, 0).getDate();
    const fractionRemainingCurrentMonth = Math.max(0, (daysInMonth - dayOfMonth) / daysInMonth);

    const pastMonths = ravMonths.slice(0, currentMonthIdx);
    const sample = pastMonths.length > 0 ? pastMonths : ravMonths.slice(0, 1);
    const avg = (sel: (m: MonthlyActivityMonth) => number) =>
      sample.length ? sample.reduce((s, m) => s + sel(m), 0) / sample.length : 0;
    const avgIncome = avg((m) => m.income);
    const avgChargesPro = avg((m) => m.chargesPro);
    const avgAutres = avg((m) => m.autresDepenses);
    const avgRetroMadelin = avg((m) => m.retrocession + m.madelin);

    // Horizon « fin du mois » → cible = mois courant, monthsBetween = fraction restante.
    const monthsBetween = fractionRemainingCurrentMonth;
    const projIncome = avgIncome * monthsBetween;
    const projChargesPro = avgChargesPro * monthsBetween;
    const projAutres = avgAutres * monthsBetween;
    const projRetroMadelin = avgRetroMadelin * monthsBetween;

    let urssafDue = 0;
    let carpimkoDue = 0;
    let pasDue = 0;
    for (const e of calendar[currentMonthIdx] || []) {
      if (e.day < dayOfMonth) continue;
      if (e.type === "urssaf") urssafDue += ravEstimate?.urssafParEcheance ?? 0;
      else if (e.type === "carpimko") carpimkoDue += ravEstimate?.carpimkoParEcheance ?? 0;
      else if (e.type === "ir") pasDue += ravEstimate?.pasParEcheance ?? 0;
    }

    const totalCharges = urssafDue + carpimkoDue + pasDue + projChargesPro + projAutres + projRetroMadelin;
    return (solde ?? 0) + projIncome - totalCharges;
  }, [hp, ravMonths, ravEstimate, solde, currentYear]);

  // ── Solde de fin de mois reconstruit ──
  // `transactions` du DataProvider n'est pas peuplé ; on reconstruit donc le solde
  // de fin de mois à partir des mouvements nets mensuels (revenus − charges) de
  // `ravMonths`, à rebours depuis le solde actuel.
  //
  // IMPORTANT : `ravMonths` agrège TOUS les comptes, donc on reconstruit depuis la
  // trésorerie TOTALE (somme des comptes), pas depuis le seul compte par défaut —
  // sinon on soustrait des flux « tous comptes » d'un solde « un seul compte », ce
  // qui fait plonger la courbe dans le négatif.
  const totalSolde = useMemo(
    () => (accounts.length ? accounts.reduce((s, a) => s + Number(a.balance ?? 0), 0) : null),
    [accounts],
  );

  const balances = useMemo(
    () => (totalSolde === null ? [] : reconstructBalances(totalSolde, ravMonths, new Date().getMonth())),
    [totalSolde, ravMonths],
  );
  const soldePrevMonth = balances[new Date().getMonth() - 1] ?? null;

  // ── Tendances mois-sur-mois pour les cards (best-effort) ──
  // Tendance trésorerie = variation de la trésorerie TOTALE (même périmètre que la courbe).
  const tresoTrend = useMemo(() => {
    if (totalSolde === null || soldePrevMonth === null || soldePrevMonth === 0) return null;
    return ((totalSolde - soldePrevMonth) / Math.abs(soldePrevMonth)) * 100;
  }, [totalSolde, soldePrevMonth]);

  const monthTrends = useMemo(() => {
    const cur = selectedMonth;
    const prev = cur - 1;
    const pct = (c: number, p: number): number | null => (p === 0 ? null : ((c - p) / Math.abs(p)) * 100);
    const mc = ravMonths[cur];
    const mp = ravMonths[prev];
    if (prev < 0 || !mc || !mp) return { ca: null as number | null, depenses: null as number | null };
    return {
      ca: pct(mc.income, mp.income),
      depenses: pct(mc.chargesPro + mc.autresDepenses, mp.chargesPro + mp.autresDepenses),
    };
  }, [ravMonths, selectedMonth]);

  // Valeurs du mois sélectionné (CA + dépenses), cohérentes avec les tendances mensuelles.
  const monthValues = useMemo(() => {
    const mc = ravMonths[selectedMonth];
    if (!mc) return { ca: null as number | null, depenses: null as number | null };
    return { ca: mc.income, depenses: mc.chargesPro + mc.autresDepenses };
  }, [ravMonths, selectedMonth]);

  // "Pas de données bancaires exploitables" = les données mensuelles ne viennent PAS
  // des transactions bancaires (fallback bordereaux, ou aucune donnée). Basé sur la
  // source réelle de `ravMonths`, pas sur `effectiveCA` (qui priorise les bordereaux).
  const noBankData = ravSource !== "transactions";
  const kpiCardsLoading = bankLoading || kpiLoading;

  // Message expliquant l'absence de trésorerie / reste à vivre (indicateurs liés au
  // compte bancaire par défaut). Mêmes états que /management.
  const bankHint: { text: string; cta: boolean } | null = !bankConnected
    ? { text: "La trésorerie, les dépenses et le reste à vivre sont calculés à partir de votre compte bancaire. Connectez votre banque pour les afficher.", cta: true }
    : !hp?.defaultBankAccountId
      ? { text: "Aucun compte par défaut n'est sélectionné : choisissez votre compte bancaire principal pour afficher la trésorerie et le reste à vivre.", cta: true }
      : defaultBankAccountMissing
        ? { text: "Votre compte par défaut est introuvable (compte déconnecté ou supprimé). Reconfigurez-le pour retrouver la trésorerie et le reste à vivre.", cta: true }
        : noBankData
          ? { text: "Aucune transaction bancaire exploitable pour l'instant : la trésorerie et les dépenses ne peuvent pas être calculées.", cta: false }
          : null;

  return (
    <div className="flex flex-col gap-6">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold mb-1">Bonjour {name} <span className="inline-block">👋</span></h1>
          <p className="text-sm text-ardoise-400">Voici la vue d&apos;ensemble de votre activité</p>
        </div>
        <MonthSelector value={selectedMonth} onChange={setSelectedMonth} year={currentYear} />
      </div>

      {/* Rangée de 4 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Trésorerie disponible"
          value={solde !== null ? formatCurrencyRounded(solde) : "—"}
          loading={kpiCardsLoading}
          icon={<KpiWalletIcon />}
          trend={{ pct: tresoTrend }}
        />
        <StatCard
          label="Chiffre d'affaires"
          value={monthValues.ca !== null ? formatCurrencyRounded(monthValues.ca) : "—"}
          loading={ravLoading}
          icon={<KpiChartIcon />}
          trend={{ pct: monthTrends.ca }}
        />
        <StatCard
          label="Dépenses"
          value={noBankData || monthValues.depenses === null ? "—" : formatCurrencyRounded(monthValues.depenses)}
          loading={ravLoading}
          icon={<KpiExpenseIcon />}
          trend={noBankData ? undefined : { pct: monthTrends.depenses, invert: true }}
        />
        <StatCard
          label="Reste à vivre"
          value={solde !== null ? formatCurrencyRounded(resteAVivre) : "—"}
          loading={ravLoading}
          icon={<KpiCoinIcon />}
        />
      </div>

      {bankHint && (
        <p className="-mt-3 text-xs text-ardoise-400">
          {bankHint.text}{" "}
          {bankHint.cta && (
            <Link href="/transactions" className="font-medium text-brand-600 hover:text-brand-700 transition-colors">
              {!bankConnected ? "Connecter ma banque →" : "Choisir mon compte →"}
            </Link>
          )}
        </p>
      )}

      {/* Grille détaillée */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-start">
      <div className="flex flex-col gap-4">
        <ApercuTresorerieCard balances={balances} months={ravMonths} />
        {hasWarnings && (
          <div className="flex flex-col gap-1.5">
            {!bankConnected && (
              <div className="bg-red-50 border-l-4 border-red-500 px-4 py-3 rounded-lg">
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
              <div className="bg-amber-50 border-l-4 border-amber-500 px-4 py-3 rounded-lg">
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
        {/* Suivi de mon activité (masqué temporairement)
        <FacturationCard loading={loading} summary={summary} />
        */}
        {/* Vue financière (masqué temporairement)
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
        */}
        <EcheancesCard hp={hp} estimate={estimate} />
      </div>
      </div>

      {/* Score de santé + Analyse des dépenses sur la même ligne, même hauteur */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-stretch">
        <HealthScoreCard loading={healthScoreLoading} data={healthScore} />
        <AnalyseDepensesCard loading={ravLoading} months={ravMonths} />
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
        <p className="text-sm text-ardoise-400">Aucune donnée de facturation disponible.</p>
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-ardoise-900">Suivi de mon activité</h2>
          <p className="text-3xl font-bold text-ardoise-900 font-mono">{formatCurrency(summary.totalCA)}</p>
          <p className="text-xs text-ardoise-400 mt-1">{summary.byStatus.paye.count} facture{summary.byStatus.paye.count > 1 ? "s" : ""}</p>
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
              <p className={`text-lg font-bold font-mono ${style.color} mt-0.5`}>{formatCurrency(data.total)}</p>
              <p className="text-xs text-ardoise-400">{data.count} facture{data.count > 1 ? "s" : ""}</p>
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
  // Fallback bordereaux : pas de transactions bancaires exploitables, on ne peut
  // pas observer Dépenses / Rémunération. On affiche "—" plutôt que 0 € pour ne
  // pas laisser croire qu'il n'y a aucune dépense.
  const noBankData = caSource === "bordereaux";
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
          <h2 className="text-lg font-bold text-ardoise-900">Vue financière</h2>
          <p className="text-[11px] text-ardoise-400">Année {new Date().getFullYear()}</p>
        </div>
        <DetailLink href="/transactions" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-ardoise-100">
        <KpiTile label="Trésorerie" value={solde !== null ? formatCurrencyRounded(solde) : "—"} sub={evolTreso} icon={<KpiWalletIcon />} />
        <KpiTile
          label={<>C.A. <CASourceIndicator source={caSource} /></>}
          value={formatCurrencyRounded(ca)}
          sub={caSource === "bordereaux" ? `${nbFactures} facture${nbFactures > 1 ? "s" : ""}` : null}
          icon={<KpiChartIcon />}
        />
        <KpiTile
          label="Dépenses"
          value={noBankData ? "—" : formatCurrencyRounded(decaissement)}
          sub={noBankData ? null : `${nbTransactionsDepenses} transaction${nbTransactionsDepenses > 1 ? "s" : ""}`}
          icon={<KpiExpenseIcon />}
        />
        <KpiTile
          label="Rémunération"
          value={noBankData ? "—" : formatCurrencyRounded(remuneration)}
          sub={noBankData ? null : `~${formatCurrencyRounded(remunerationMensuelle)}/mois`}
          icon={<KpiCoinIcon />}
          valueClass="text-brand-600"
        />
      </div>
    </Card>
  );
}

function KpiTile({ label, value, sub, icon, iconColor = "text-violet-700", valueClass = "text-ardoise-900" }: { label: React.ReactNode; value: string; sub?: string | null; icon: React.ReactNode; iconColor?: string; valueClass?: string }) {
  return (
    <div className="flex flex-col items-center py-2 px-1.5">
      <p className="text-[11px] font-mono uppercase tracking-wide text-ardoise-400 mb-1 flex items-center gap-1.5">
        <span className={iconColor}>{icon}</span>
        {label}
      </p>
      <p className={`text-lg font-bold ${valueClass} font-mono`}>{value}</p>
      {sub && (
        <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium font-mono ${sub.startsWith("+") || /économ/i.test(sub) ? "bg-menthe-50 text-menthe-700" : "bg-ardoise-100 text-ardoise-500"}`}>{sub}</span>
      )}
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
        <h2 className="text-lg font-bold text-ardoise-900">Prochaines échéances</h2>
        <DetailLink href="/deadlines" />
      </div>
      {upcoming.length === 0 ? (
        <p className="text-xs text-ardoise-400 text-center py-2">Aucune échéance à venir.</p>
      ) : (
        <div className="divide-y divide-ardoise-100 -mx-5">
          {upcoming.map((evt, i) => {
            return (
              <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                <div className={`flex flex-col items-center justify-center w-11 h-11 shrink-0 rounded-lg ${EVENT_BADGE[evt.type] ?? "bg-ardoise-100 text-ardoise-500"}`}>
                  <span className="text-[9px] font-semibold uppercase leading-none">{MONTH_NAMES[evt.month]?.slice(0, 3)}</span>
                  <span className="text-base font-bold font-mono leading-none mt-0.5">{String(evt.day).padStart(2, "0")}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ardoise-900 truncate">{evt.label}</p>
                  <p className="text-xs text-ardoise-400 truncate">{EVENT_SUBTITLE[evt.type] ?? ""}</p>
                </div>
                {evt.estimatedAmount != null && evt.estimatedAmount > 0 && (
                  <span className="text-sm font-bold text-ardoise-900 font-mono shrink-0">~{formatCurrencyRounded(evt.estimatedAmount)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ─── Analyse des dépenses (donut) ─── */
const DEPENSE_CATS: { label: string; color: string; sel: (m: MonthlyActivityMonth) => number }[] = [
  { label: "Charges sociales", color: "#7C6BF0", sel: (m) => m.urssaf + m.carpimko },
  { label: "Frais pro", color: "#3B82F6", sel: (m) => m.chargesPro },
  { label: "Rétrocessions", color: "#F87171", sel: (m) => m.retrocession },
  { label: "Impôts", color: "#34D399", sel: (m) => m.impots + m.cfe },
  { label: "Madelin", color: "#FBBF24", sel: (m) => m.madelin },
];

function AnalyseDepensesCard({ loading, months }: { loading: boolean; months: MonthlyActivityMonth[] }) {
  const { cats, total } = useMemo(() => {
    const c = DEPENSE_CATS.map((cat) => ({
      label: cat.label,
      color: cat.color,
      value: months.reduce((s, m) => s + cat.sel(m), 0),
    })).filter((cat) => cat.value > 0);
    return { cats: c, total: c.reduce((s, cat) => s + cat.value, 0) };
  }, [months]);

  if (loading) return <SkeletonCard />;

  return (
    <Card className="mb-2">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-ardoise-900">Analyse des dépenses</h2>
        <DetailLink href="/management" />
      </div>
      {total === 0 ? (
        <p className="text-sm text-ardoise-400 text-center py-6">Aucune dépense enregistrée cette année.</p>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <DepenseDonut cats={cats} total={total} />
          <ul className="flex-1 w-full space-y-2">
            {cats.map((c) => (
              <li key={c.label} className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                <span className="flex-1 text-ardoise-700 truncate">{c.label}</span>
                <span className="text-ardoise-400 font-mono text-xs tabular-nums">{Math.round((c.value / total) * 100)}%</span>
                <span className="text-ardoise-900 font-mono text-xs tabular-nums w-16 text-right">{formatCurrencyRounded(c.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function DepenseDonut({ cats, total }: { cats: { label: string; color: string; value: number }[]; total: number }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative w-[130px] h-[130px] shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        {cats.map((c, i) => {
          const seg = (c.value / total) * circ;
          // Offset = somme des segments précédents (pas de mutation d'une variable de render).
          const offset = cats.slice(0, i).reduce((s, x) => s + (x.value / total) * circ, 0);
          return (
            <circle
              key={c.label} cx="60" cy="60" r={r} fill="none" stroke={c.color} strokeWidth="14"
              strokeDasharray={`${seg} ${circ - seg}`} strokeDashoffset={-offset}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-bold text-ardoise-900 font-mono leading-none">{formatCurrencyRounded(total)}</span>
        <span className="text-[10px] text-ardoise-400 mt-0.5">Total</span>
      </div>
    </div>
  );
}

/* ─── Reconstruction du solde ─── */
// Mouvement net catégorisé d'un mois : revenus − (cotisations + charges + impôts…).
// N.B. ne compte que les transactions catégorisées (les non-catégorisées et
// virements internes ne déplacent pas la courbe).
function monthlyNet(m: MonthlyActivityMonth): number {
  return m.income - (m.urssaf + m.carpimko + m.chargesPro + m.retrocession + m.madelin + m.impots + m.cfe + m.remuneration);
}

// Solde de fin de mois, reconstruit à rebours depuis le solde actuel :
//   fin(mois M) = fin(mois M+1) − mouvements nets du mois M+1.
// Renvoie un tableau indexé par mois (0..11), rempli de janvier au mois courant.
function reconstructBalances(solde: number, months: MonthlyActivityMonth[], curMonth: number): (number | null)[] {
  const bal: (number | null)[] = new Array(12).fill(null);
  let running = solde;
  for (let m = curMonth; m >= 0; m--) {
    bal[m] = running;
    running -= months[m] ? monthlyNet(months[m]!) : 0;
  }
  return bal;
}

/* ─── Aperçu de trésorerie (graphe) ─── */
// Tooltip ordonné : Trésorerie au-dessus, Charges en dessous.
function TresoTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number | string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const valueOf = (key: string) => {
    const v = payload.find((p) => p.dataKey === key)?.value;
    return v == null ? null : formatCurrencyRounded(Number(v));
  };
  const treso = valueOf("tresorerie");
  const charges = valueOf("charges");
  const row = (color: string, name: string, value: string) => (
    <p className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-ardoise-600">{name}</span>
      <span className="ml-auto pl-4 font-mono font-semibold text-ardoise-900 tabular-nums">{value}</span>
    </p>
  );
  return (
    <div className="rounded-lg border border-ardoise-200 bg-white px-3 py-2 shadow-1 text-xs min-w-[170px] space-y-1">
      <p className="font-semibold text-ardoise-500">{label}</p>
      {treso != null && row("#7C6BF0", "Trésorerie", treso)}
      {charges != null && row("#A79EB5", "Charges", charges)}
    </div>
  );
}


function ApercuTresorerieCard({ balances, months }: {
  balances: (number | null)[];
  months: MonthlyActivityMonth[];
}) {
  const chartData = useMemo(() => {
    const curMonth = new Date().getMonth();
    const out: { name: string; tresorerie: number; charges: number }[] = [];
    for (let m = 0; m <= curMonth; m++) {
      const bal = balances[m];
      if (bal == null) continue;
      const mm = months[m];
      const charges = mm ? mm.urssaf + mm.carpimko + mm.chargesPro : 0;
      const name = (MONTH_NAMES[m] ?? "").slice(0, 3);
      out.push({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        tresorerie: Math.round(bal),
        charges: Math.round(charges),
      });
    }
    return out;
  }, [balances, months]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-ardoise-900">Aperçu de trésorerie</h2>
        <span className="text-xs font-medium text-ardoise-500 border border-ardoise-200 rounded-lg px-2.5 py-1">Cette année</span>
      </div>
      {chartData.length === 0 ? (
        <p className="text-sm text-ardoise-400 text-center py-12">
          Connectez votre compte bancaire pour visualiser l&apos;évolution de votre trésorerie.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-4 mb-3 text-xs text-ardoise-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#7C6BF0]" />Trésorerie disponible</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 border-t-2 border-dashed border-ardoise-400" />Charges</span>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 6, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="tresoFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7C6BF0" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#7C6BF0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#847A95" }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: "#847A95" }} tickLine={false} axisLine={false} width={52}
                tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k€` : `${v}€`)}
              />
              <Tooltip content={<TresoTooltip />} />
              <Area type="monotone" dataKey="tresorerie" name="Trésorerie disponible" stroke="#7C6BF0" strokeWidth={2.5} fill="url(#tresoFill)" dot={{ r: 2.5, fill: "#7C6BF0" }} />
              <Line type="monotone" dataKey="charges" name="Charges" stroke="#A79EB5" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </Card>
  );
}

/* ─── Sélecteur de mois ─── */
function MonthSelector({ value, onChange, year }: { value: number; onChange: (m: number) => void; year: number }) {
  const maxMonth = new Date().getMonth();
  const options = Array.from({ length: maxMonth + 1 }, (_, i) => maxMonth - i); // décroissant, mois courant en tête
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Mois"
        className="appearance-none rounded-lg border border-ardoise-200 bg-white pl-3.5 pr-9 py-2 text-sm font-medium text-ardoise-700 cursor-pointer hover:border-ardoise-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
      >
        {options.map((m) => (
          <option key={m} value={m}>{cap(MONTH_NAMES[m] ?? "")} {year}</option>
        ))}
      </select>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ardoise-400">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}

/* ─── Stat card (rangée du haut) ─── */
function StatCard({ label, value, icon, loading, empty, trend }: { label?: string; value?: string; icon?: React.ReactNode; loading?: boolean; empty?: boolean; trend?: { pct: number | null; invert?: boolean } }) {
  if (empty) {
    return <div className="rounded-[14px] border border-dashed border-ardoise-200 min-h-[104px]" />;
  }
  return (
    <Card className="min-h-[104px]">
      <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide text-ardoise-400 mb-2">
        <span className="text-violet-700">{icon}</span>
        {label}
      </div>
      {loading ? (
        <div className="h-7 w-24 bg-ardoise-200 rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-ardoise-900 font-mono">{value}</p>
      )}
      {!loading && trend?.pct != null && <TrendLine pct={trend.pct} invert={trend.invert} />}
    </Card>
  );
}

function TrendLine({ pct, invert = false }: { pct: number; invert?: boolean }) {
  const rounded = Math.round(pct * 10) / 10;
  const up = rounded >= 0;
  const good = invert ? rounded <= 0 : rounded >= 0;
  const color = rounded === 0 ? "text-ardoise-400" : good ? "text-menthe-600" : "text-red-500";
  const label = `${rounded > 0 ? "+" : ""}${rounded.toFixed(1).replace(".", ",")}% vs mois dernier`;
  return (
    <p className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${color}`}>
      {label}
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {up ? (
          <><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></>
        ) : (
          <><line x1="7" y1="7" x2="17" y2="17" /><polyline points="17 7 17 17 7 17" /></>
        )}
      </svg>
    </p>
  );
}

/* ─── Shared components ─── */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-5 ${className}`}>{children}</div>;
}

function DetailLink({ href }: { href: string }) {
  return (
    <Link href={href} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors">
      Voir le détail
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <div className="animate-pulse">
        <div className="h-3 bg-ardoise-200 rounded w-24 mb-3" />
        <div className="h-6 bg-ardoise-200 rounded w-32 mb-6" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map((i) => <div key={i} className="h-16 bg-ardoise-200 rounded" />)}
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
function ClockIcon({ className = "text-ardoise-400" }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
}
function XCircleIcon({ className = "text-ardoise-400" }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>;
}
function KpiWalletIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="14" rx="2.5" fill="currentColor" opacity="0.5" /><rect x="2" y="6" width="20" height="4" rx="2.5" fill="currentColor" opacity="0.7" /><circle cx="17" cy="15" r="1.5" fill="currentColor" opacity="0.3" /></svg>;
}
function KpiChartIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="4" height="9" rx="1" fill="currentColor" opacity="0.4" /><rect x="10" y="7" width="4" height="14" rx="1" fill="currentColor" opacity="0.6" /><rect x="17" y="3" width="4" height="18" rx="1" fill="currentColor" opacity="0.45" /></svg>;
}
function KpiExpenseIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.4" /><path d="M8 12h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" /></svg>;
}
function KpiCoinIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.4" /><path d="M12 7v10M9 9.5c0-.8 1.3-1.5 3-1.5s3 .7 3 1.5-1.3 1.5-3 1.5-3 .7-3 1.5 1.3 1.5 3 1.5 3-.7 3-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" /></svg>;
}
