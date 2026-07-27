"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, useActionState, type ReactNode } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, ReferenceLine, LabelList } from "recharts";
import { getMonthlyActivityAction, getTransactionKpisAction, getCategoryTransactionsAction, type MonthlyActivityMonth, type CategoryTransaction } from "@/actions/transaction";
import { getCotisationsEstimate, type CotisationsEstimate } from "@/actions/cotisations-estimate";
import { simulateCotisations, type SimulationResult } from "@/actions/simulate-cotisations";
import { getCAForecastAction, getManualActOptionsAction, getPlannedActsAction, saveManualPlannedActsAction, clearScenarioAction, type CAForecastResult, type ActOption } from "@/actions/ca-history";
import { getFiscalSituationAction, upsertFiscalSituationAction } from "@/actions/fiscal-situation";
import { getWorkedDaysAction, upsertWorkedDayAction } from "@/actions/vacations";
import { getManualChargesAction, upsertManualChargeCellAction, deleteManualChargeLineAction } from "@/actions/manual-charges";
import { MANUAL_CHARGE_TYPES, manualChargeLabel } from "@/lib/data/manual-charge-types";
import { useData } from "@/providers/data-provider";
import { usePractitioner } from "@/providers/practitioner-provider";
import { useAssistant } from "@/providers/assistant-provider";
import { getEffectiveCAAction, type EffectiveCA } from "@/actions/effective-ca";
import { getMonthlyActivityFromBordereauxAction } from "@/actions/monthly-activity-bordereaux";
import { DataMissingOverlay } from "@/components/data-missing-overlay";
import { CASourceIndicator } from "@/components/ca-source-indicator";
import { EstimationBadge } from "@/components/estimation-badge";
import { buildCalendar, type PaymentPreferences, DEFAULT_PREFERENCES } from "@/lib/data/fiscal-calendar";
import { computeResteAVivre } from "@/lib/data/reste-a-vivre";
import { countWorkingDays, countRemainingWorkingDays } from "@/lib/data/fr-holidays";
import { computeIR, computeParts, getBareme } from "@/lib/data/fr-tax";
import { downloadCSV, downloadPDF, getChartImage } from "@/lib/export";
import { ExportButtons } from "@/components/export-buttons";
import { Button } from "@/components/button";

const TABS = [
  { key: "summary", label: "Ma synthèse" },
  { key: "activity", label: "Mon activité" },
  { key: "contributions", label: "Mes cotisations sociales" },
  { key: "taxes", label: "Mes impôts" },
  { key: "remainder", label: "Reste à vivre" },
  { key: "simulation", label: "Simulation" },
] as const;

type Tab = (typeof TABS)[number]["key"];

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const MONTHS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
}

// ── Cache de données partagé entre les onglets ──
// Les onglets se montent un par un et refetchaient chacun le même cœur de
// données (CA effectif "transactions" + activité mensuelle + estimation cotis.)
// à chaque visite. Ces données sont read-only et stables pendant la session de
// page (rien dans /management ne mute les transactions/bordereaux), donc on les
// met en cache par année. Le cache est réinitialisé si la connexion bancaire
// change (les montants en dépendent) : les Maps sont recréées au render, donc
// avant que les effets des onglets ne tournent — pas de lecture périmée.

type YearCore = {
  effectiveCA: EffectiveCA;
  months: MonthlyActivityMonth[];
  totalCA: number;
  /** true = fallback bordereaux (CA réel issu des passages, cotisations estimées). */
  isEstimated: boolean;
};

type YearFiscal = Awaited<ReturnType<typeof getFiscalSituationAction>>;

/** Données préchargées côté serveur (page.tsx) pour seeder le cache du provider :
 *  l'onglet par défaut s'affiche sans server action au montage. */
export type ManagementInitialData = {
  years: Record<number, { core: YearCore; estimate: CotisationsEstimate | null; fiscal: YearFiscal }>;
};

type ManagementDataValue = {
  /** Cœur partagé pour une année : CA effectif + activité mensuelle (avec fallback). */
  loadYearCore: (year: number) => Promise<YearCore>;
  /** Estimation cotisations pour une année (null si CA nul). */
  loadEstimate: (year: number) => Promise<CotisationsEstimate | null>;
  /** Situation fiscale d'une année (cachée pour éviter les refetch entre onglets). */
  loadFiscal: (year: number) => Promise<YearFiscal>;
  /** Invalide les caches d'une année (après édition des charges manuelles ou de la
   *  situation fiscale) : les onglets non montés se rechargeront frais à leur
   *  prochaine ouverture. */
  bustYear: (year: number) => void;
};

const ManagementDataContext = createContext<ManagementDataValue | null>(null);

function useManagementData(): ManagementDataValue {
  const ctx = useContext(ManagementDataContext);
  if (!ctx) throw new Error("useManagementData doit être utilisé dans ManagementDataProvider");
  return ctx;
}

// Le provider est remonté (via `key`) quand la connexion bancaire change, donc
// les caches repartent vides automatiquement — pas de logique d'invalidation ici.
function ManagementDataProvider({ initial, children }: { initial?: ManagementInitialData; children: ReactNode }) {
  const coreCacheRef = useRef(new Map<number, Promise<YearCore>>());
  const estimateCacheRef = useRef(new Map<number, Promise<CotisationsEstimate | null>>());
  const fiscalCacheRef = useRef(new Map<number, Promise<YearFiscal>>());

  // Seed unique (au premier render) avec les données préchargées côté serveur.
  // `hp` étant une prop serveur stable, la `key` du provider ne change pas en cours
  // de session → ce seed n'a lieu qu'une fois, avant que les effets des onglets ne
  // tournent. Un changement de banque passe par un nouveau rendu serveur → nouveau
  // `initial` frais, donc pas de risque de seed périmé.
  const seededRef = useRef(false);
  /* eslint-disable react-hooks/refs -- seed unique et volontaire des caches au premier render (cf. commentaire ci-dessus) : lecture/écriture des refs sûre, avant tout effet des onglets. */
  if (!seededRef.current) {
    seededRef.current = true;
    if (initial) {
      for (const [y, d] of Object.entries(initial.years)) {
        const year = Number(y);
        coreCacheRef.current.set(year, Promise.resolve(d.core));
        estimateCacheRef.current.set(year, Promise.resolve(d.estimate));
        fiscalCacheRef.current.set(year, Promise.resolve(d.fiscal));
      }
    }
  }
  /* eslint-enable react-hooks/refs */

  const loadYearCore = useCallback((year: number) => {
    const cache = coreCacheRef.current;
    const cached = cache.get(year);
    if (cached) return cached;
    const p = (async (): Promise<YearCore> => {
      const effectiveCA = await getEffectiveCAAction(year, "transactions");
      const useFallback = effectiveCA.source === "bordereaux";
      const monthly = useFallback
        ? await getMonthlyActivityFromBordereauxAction(year)
        : await getMonthlyActivityAction(year);
      const months = monthly.months ?? [];
      const totalCA = months.reduce((s, m) => s + m.income, 0);
      return { effectiveCA, months, totalCA, isEstimated: useFallback };
    })().catch((err) => {
      // Échec : on retire l'entrée pour permettre une nouvelle tentative.
      coreCacheRef.current.delete(year);
      throw err;
    });
    cache.set(year, p);
    return p;
  }, []);

  const loadEstimate = useCallback((year: number) => {
    const cache = estimateCacheRef.current;
    const cached = cache.get(year);
    if (cached) return cached;
    const p = (async (): Promise<CotisationsEstimate | null> => {
      const { totalCA } = await loadYearCore(year);
      if (totalCA <= 0) return null;
      return getCotisationsEstimate(totalCA, 0, year);
    })().catch((err) => {
      estimateCacheRef.current.delete(year);
      throw err;
    });
    cache.set(year, p);
    return p;
  }, [loadYearCore]);

  const loadFiscal = useCallback((year: number) => {
    const cache = fiscalCacheRef.current;
    const cached = cache.get(year);
    if (cached) return cached;
    const p = getFiscalSituationAction(year).catch((err) => {
      fiscalCacheRef.current.delete(year);
      throw err;
    });
    cache.set(year, p);
    return p;
  }, []);

  const bustYear = useCallback((year: number) => {
    coreCacheRef.current.delete(year);
    estimateCacheRef.current.delete(year);
    fiscalCacheRef.current.delete(year);
  }, []);

  const value = useMemo(() => ({ loadYearCore, loadEstimate, loadFiscal, bustYear }), [loadYearCore, loadEstimate, loadFiscal, bustYear]);
  return <ManagementDataContext.Provider value={value}>{children}</ManagementDataContext.Provider>;
}

export function ManagementClient({ initial }: { initial?: ManagementInitialData }) {
  const hp = usePractitioner();
  const searchParams = useSearchParams();
  // Onglet deep-linkable via ?tab= (utilisé par la recherche de la sidebar).
  const paramTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(() =>
    TABS.some((x) => x.key === paramTab) ? (paramTab as Tab) : "summary",
  );
  // Resynchronise si ?tab= change alors qu'on est déjà sur la page (navigation
  // douce). Pattern React d'ajustement d'état en render, sans effet.
  const [prevParamTab, setPrevParamTab] = useState(paramTab);
  if (paramTab !== prevParamTab) {
    setPrevParamTab(paramTab);
    if (paramTab && TABS.some((x) => x.key === paramTab)) setTab(paramTab as Tab);
  }

  return (
    // key = connexion bancaire : un changement remonte tout le sous-arbre et
    // vide le cache de données partagé (les montants CA/cotisations en dépendent).
    <ManagementDataProvider key={hp?.bridgeUserUuid ?? "none"} initial={initial}><div>
      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-ardoise-100 mb-6 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-1.5 pb-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap shrink-0 ${
              tab === t.key ? "border-brand-600 text-brand-600" : "border-transparent text-ardoise-400 hover:text-ardoise-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "activity" && <ActivityTab />}

      {tab === "contributions" && <ContributionsTab />}

      {tab === "taxes" && <TaxesTab />}

      {tab === "summary" && <SummaryTab />}

      {tab === "remainder" && <RemainderTab />}

      {tab === "simulation" && <SimulationTab />}
    </div></ManagementDataProvider>
  );
}

// ── Activity Tab ──

// Ligne de détail (libellé → montant) pour les vues mobiles "un mois à la fois".
function MobileSubLine({ label, value, italic }: { label: string; value: number; italic?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-ardoise-500">{label}</span>
      <span className={`text-xs font-mono ${italic ? "text-ardoise-400 italic" : "text-ardoise-500"}`}>
        {value > 0 ? formatCurrency(value) : "—"}
      </span>
    </div>
  );
}

type MonthData = { name: string; revenus: number; cotisations: number; autresDepenses: number; urssaf: number; carpimko: number; chargesPro: number; retrocession: number; madelin: number; impots: number; remuneration: number };

// Sélecteur de mois « un mois à la fois » (vues sous lg).
function MonthStepper({ month, setMonth, year }: { month: number; setMonth: (fn: (m: number) => number) => void; year: number }) {
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={() => setMonth((mm) => Math.max(0, mm - 1))}
        disabled={month === 0}
        className="w-9 h-9 flex items-center justify-center rounded-lg border border-ardoise-200 text-ardoise-600 hover:bg-ardoise-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Mois précédent"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <span className="text-sm font-semibold text-ardoise-800 capitalize">{MONTHS_LONG[month]} {year}</span>
      <button
        type="button"
        onClick={() => setMonth((mm) => Math.min(11, mm + 1))}
        disabled={month === 11}
        className="w-9 h-9 flex items-center justify-center rounded-lg border border-ardoise-200 text-ardoise-600 hover:bg-ardoise-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Mois suivant"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>
    </div>
  );
}

// Graduations de l'axe des ordonnées : k€ au-delà du millier, € en dessous
// (sinon un CA de quelques centaines d'euros afficherait « 0 k€ » partout).
function formatAxisAmount(v: number): string {
  if (!v) return "0";
  return Math.abs(v) >= 1000 ? `${Math.round(v / 1000)} k€` : `${Math.round(v)} €`;
}

// Graphe revenus / dépenses. `single` = vue sous lg, un seul mois affiché (calée
// sur la carte détaillée en dessous) : barres bridées pour ne pas s'étaler sur
// toute la largeur, le mois étant porté par le sélecteur au-dessus.
function ActivityBarChart({ data, isEstimated, single = false }: { data: MonthData[]; isEstimated: boolean; single?: boolean }) {
  const labels: Record<string, string> = {
    revenus: isEstimated ? "Revenus (bordereaux)" : "Revenus",
    cotisations: "Cotisations sociales",
    autresDepenses: "Autres dépenses",
  };
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} barGap={single ? 8 : 2} barCategoryGap={single ? "10%" : "20%"} margin={{ left: 0, right: 0, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        {/* Abscisses masquées : les mois sont déjà portés par les en-têtes du
            tableau en dessous (vue 12 mois) et par le sélecteur (vue `single`). */}
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#A79EB5" }} tickLine={false} axisLine={false} hide />
        {/* Ordonnées en `mirror` : les graduations sont dessinées DANS le plot et
            l'axe ne consomme aucune largeur (cf. selectChartOffsetInternal, qui
            n'ampute l'offset que si `!mirror`) — les barres restent alignées sur
            les colonnes du tableau en dessous. `width` n'est PAS une largeur d'axe
            ici mais la largeur de wrap des libellés : à 0 ils se replient dans le
            vide et rien ne s'affiche. Le liseré blanc (stroke + paintOrder) garde
            le libellé lisible quand il passe par-dessus une barre. */}
        <YAxis
          mirror
          width={60}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatAxisAmount}
          tick={{ fontSize: 10, fill: "#A79EB5", stroke: "#fff", strokeWidth: 3, paintOrder: "stroke" }}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E1DBEC", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
          formatter={(value, name) => {
            const num = typeof value === "number" ? value : Number(value ?? 0);
            const key = String(name ?? "");
            return [formatCurrency(num), labels[key] ?? key];
          }}
          labelStyle={{ fontWeight: 600, marginBottom: 4 }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          formatter={(value: string) => labels[value] ?? value}
        />
        <Bar dataKey="revenus" fill="#3DB87A" radius={[3, 3, 0, 0]} maxBarSize={single ? 110 : undefined} />
        <Bar dataKey="autresDepenses" stackId="depenses" fill="#ef4444" maxBarSize={single ? 110 : undefined} />
        <Bar dataKey="cotisations" stackId="depenses" fill="#f97316" radius={[3, 3, 0, 0]} maxBarSize={single ? 110 : undefined} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ActivityTab() {
  const hp = usePractitioner();
  const { loadYearCore, bustYear, loadEstimate } = useManagementData();
  const { notifyManualChargesChanged } = useData();
  const bankConnected = !!hp?.bridgeUserUuid;
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [year, setYear] = useState(currentYear);
  // Détail mobile : mois actuellement affiché (le tableau 12 colonnes est masqué sous lg).
  const [mobileMonth, setMobileMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({ encaissement: 0, decaissement: 0, cotisations: 0, remuneration: 0 });
  const [effectiveCA, setEffectiveCA] = useState<EffectiveCA>({ ca: 0, source: "none" });
  const [chartData, setChartData] = useState<MonthData[]>([]);
  // Jours travaillés saisis par mois ; null = non saisi → défaut = jours ouvrés.
  const [workedDays, setWorkedDays] = useState<(number | null)[]>(Array(12).fill(null));
  const [chargesProOpen, setChargesProOpen] = useState(false);
  const [impotOpen, setImpotOpen] = useState(false);
  const [remOpen, setRemOpen] = useState(false);
  // Charges pro. saisies à la main : lignes { type, 12 montants }. État local =
  // source de vérité pour l'affichage ; chaque édition est persistée puis patchée
  // dans `chartData` (dont `chargesPro`/`autresDepenses` incluent déjà le manuel
  // côté serveur), pour que totaux et calculs aval restent cohérents sans refetch.
  const [manualLines, setManualLines] = useState<{ type: string; amounts: number[] }[]>([]);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  // `isEstimated` = on est en mode fallback bordereaux : CA réel issu des passages
  // mais URSSAF/CARPIMKO/PAS estimés via getCotisationsEstimate. Sert à afficher
  // les badges "estim." et le bandeau d'incitation à connecter la banque.
  const [isEstimated, setIsEstimated] = useState(false);
  // Estimation cotisations de l'année (même source que « Mes cotisations sociales »
  // et « Ma synthèse ») : sert de repli mensuel URSSAF/CARPIMKO quand aucun
  // prélèvement réel n'est encore observé. `null` en mode fallback bordereaux
  // (cf. commentaire dans fetchData) et tant que le CA est nul.
  const [estimate, setEstimate] = useState<CotisationsEstimate | null>(null);

  const fetchData = useCallback(async (y: number) => {
    setLoading(true);
    const [workedDaysResult, core, manualRows] = await Promise.all([
      getWorkedDaysAction(y),
      loadYearCore(y),
      getManualChargesAction(y),
    ]);
    const { effectiveCA: effectiveCAResult, months, totalCA, isEstimated: useFallback } = core;

    // Regroupe les charges manuelles par type → { type, 12 montants }, ordonnées
    // selon MANUAL_CHARGE_TYPES pour un affichage stable.
    const grouped = new Map<string, number[]>();
    for (const r of manualRows) {
      if (r.month < 1 || r.month > 12) continue;
      if (!grouped.has(r.chargeType)) grouped.set(r.chargeType, Array(12).fill(0));
      grouped.get(r.chargeType)![r.month - 1] = r.amount;
    }
    setManualLines(
      MANUAL_CHARGE_TYPES.filter((t) => grouped.has(t.key)).map((t) => ({ type: t.key, amounts: grouped.get(t.key)! })),
    );

    const toChartData = (ms: MonthlyActivityMonth[]) =>
      ms.map((m) => ({
        name: MONTH_LABELS[m.month - 1]!,
        revenus: m.income,
        cotisations: m.cotisations,
        autresDepenses: m.autresDepenses,
        urssaf: m.urssaf,
        carpimko: m.carpimko,
        chargesPro: m.chargesPro,
        retrocession: m.retrocession,
        madelin: m.madelin,
        impots: m.impots,
        remuneration: m.remuneration,
      }));

    // Fallback dès que le CA effectif provient des bordereaux : CA mensuel dérivé
    // des passages, et on n'estime *rien d'autre* — dépenses, cotisations sociales
    // et provision d'impôt restent à 0 (affichées "—"). Le forfaitaire
    // URSSAF/CARPIMKO début d'activité produisait des montants disproportionnés
    // par rapport au CA réel des bordereaux, donc on les masque ici. Les autres
    // tabs (Cotisations, Impôts, Synthèse) gardent l'estimation car elle a du sens
    // en projection annuelle complète.
    if (useFallback) {
      setKpis({ encaissement: totalCA, decaissement: 0, cotisations: 0, remuneration: 0 });
      setEffectiveCA(effectiveCAResult);
      setChartData(toChartData(months));
      setEstimate(null);
      setWorkedDays(workedDaysResult);
      setIsEstimated(true);
      setLoading(false);
      return;
    }

    // Flux normal : transactions bancaires. Les KPIs encaissement/décaissement
    // proviennent d'une agrégation dédiée (distincte de l'activité mensuelle).
    // L'estimation de cotisations sert de repli mensuel URSSAF/CARPIMKO (mois non
    // encore prélevés) pour rester cohérent avec les onglets Cotisations/Synthèse.
    const [kpiResult, est] = await Promise.all([
      getTransactionKpisAction(null, y, true),
      loadEstimate(y),
    ]);
    setKpis({ encaissement: kpiResult.encaissement, decaissement: kpiResult.decaissement, cotisations: kpiResult.cotisations ?? 0, remuneration: kpiResult.remuneration ?? 0 });
    setEffectiveCA(effectiveCAResult);
    setChartData(toChartData(months));
    setEstimate(est);
    setWorkedDays(workedDaysResult);
    setIsEstimated(false);
    setLoading(false);
  }, [loadYearCore, loadEstimate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    fetchData(year);
  }, [year, fetchData]);

  const daysPerWeek = hp?.daysPerWeekWorked ?? 5;
  const chartRef = useRef<HTMLDivElement>(null);

  // ── Charges pro. manuelles : dérivés + handlers ──
  // Somme mensuelle (tous types) — sert à retrancher le manuel de la sous-ligne
  // « Charges pro » (bancaire pur) puisque `chartData.chargesPro` l'inclut déjà.
  const manualByMonth = useMemo(() => {
    const arr = Array(12).fill(0);
    for (const line of manualLines) {
      for (let i = 0; i < 12; i++) arr[i]! += line.amounts[i] ?? 0;
    }
    return arr;
  }, [manualLines]);

  const availableChargeTypes = useMemo(() => {
    const used = new Set(manualLines.map((l) => l.type));
    return MANUAL_CHARGE_TYPES.filter((t) => !used.has(t.key));
  }, [manualLines]);

  // Répercute une variation de montant sur chartData (total charges pro + dépenses)
  // et sur le KPI décaissement, pour une mise à jour instantanée sans refetch.
  const patchChartCharges = useCallback((monthIdx: number, delta: number) => {
    if (delta === 0) return;
    setChartData((prev) => prev.map((m, i) =>
      i === monthIdx ? { ...m, chargesPro: m.chargesPro + delta, autresDepenses: m.autresDepenses + delta } : m,
    ));
    setKpis((k) => ({ ...k, decaissement: Math.max(0, k.decaissement + delta) }));
  }, []);

  const commitManualCell = useCallback(async (type: string, monthIdx: number, raw: string) => {
    const parsed = parseFloat(raw.replace(",", ".").replace(/[^0-9.]/g, ""));
    const value = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
    const line = manualLines.find((l) => l.type === type);
    const old = line?.amounts[monthIdx] ?? 0;
    const delta = value - old;
    if (delta === 0) return;
    setManualLines((prev) => prev.map((l) =>
      l.type === type ? { ...l, amounts: l.amounts.map((a, i) => (i === monthIdx ? value : a)) } : l,
    ));
    patchChartCharges(monthIdx, delta);
    bustYear(year);
    notifyManualChargesChanged();
    const res = await upsertManualChargeCellAction(year, monthIdx + 1, type, value);
    if (res?.error) console.error("[manual-charges]", res.error);
  }, [manualLines, patchChartCharges, bustYear, notifyManualChargesChanged, year]);

  const handleAddChargeLine = useCallback((type: string) => {
    setManualLines((prev) => (prev.some((l) => l.type === type) ? prev : [...prev, { type, amounts: Array(12).fill(0) }]));
    setAddMenuOpen(false);
  }, []);

  const handleRemoveChargeLine = useCallback(async (type: string) => {
    const line = manualLines.find((l) => l.type === type);
    setManualLines((prev) => prev.filter((l) => l.type !== type));
    if (!line) return;
    // Retire les montants de chartData avant de purger la ligne en base.
    line.amounts.forEach((a, i) => { if (a > 0) patchChartCharges(i, -a); });
    if (line.amounts.some((a) => a > 0)) {
      bustYear(year);
      notifyManualChargesChanged();
      const res = await deleteManualChargeLineAction(year, type);
      if (res?.error) console.error("[manual-charges]", res.error);
    }
  }, [manualLines, patchChartCharges, bustYear, notifyManualChargesChanged, year]);

  // Tableau des en-têtes et lignes pour l'export du détail mensuel.
  const exportData = useMemo(() => {
    const headers = ["Mois", "CA encaissé", "Total dépenses", "URSSAF", "CARPIMKO", "Charges pro", "Rétrocession", "Madelin", "Impôts versés", "Rémunération versée", "Rém. avant impôt", "Jours travaillés"];
    const rows = chartData.map((m, i) => {
      const totalDepenses = m.cotisations + m.autresDepenses;
      const remAvantImpot = m.revenus - m.urssaf - m.carpimko - m.chargesPro - m.retrocession - m.madelin;
      return [
        m.name,
        Math.round(m.revenus),
        Math.round(totalDepenses),
        Math.round(m.urssaf),
        Math.round(m.carpimko),
        Math.round(m.chargesPro),
        Math.round(m.retrocession),
        Math.round(m.madelin),
        Math.round(m.impots),
        Math.round(m.remuneration),
        Math.round(remAvantImpot),
        workedDays[i] ?? countWorkingDays(year, i + 1, daysPerWeek),
      ];
    });
    return { headers, rows };
  }, [chartData, workedDays, year, daysPerWeek]);

  const handleExportCsv = useCallback(() => {
    downloadCSV(`activite_${year}`, exportData.headers, exportData.rows);
  }, [exportData, year]);

  const handleExportPdf = useCallback(async () => {
    const totalCA = chartData.reduce((s, m) => s + m.revenus, 0);
    const totalDepenses = chartData.reduce((s, m) => s + m.cotisations + m.autresDepenses, 0);
    const totalRem = chartData.reduce((s, m) => s + (m.revenus - m.urssaf - m.carpimko - m.chargesPro - m.retrocession - m.madelin), 0);
    // Formate les colonnes monétaires en € pour le PDF (le CSV garde des nombres bruts).
    const rowsForPdf = exportData.rows.map((r) =>
      r.map((cell, i) => (i > 0 && i < r.length - 1 && typeof cell === "number" ? formatCurrency(cell) : cell)),
    );
    const chartImage = (await getChartImage(chartRef.current)) ?? undefined;
    downloadPDF(`activite_${year}`, `Mon activité ${year}`, exportData.headers, rowsForPdf, {
      subtitle: `Détail mensuel ${year}`,
      chartImage,
      summary: [
        { label: "Chiffre d'affaires", value: formatCurrency(Math.round(totalCA)) },
        { label: "Dépenses", value: formatCurrency(Math.round(totalDepenses)) },
        { label: "Rém. avant impôt", value: formatCurrency(Math.round(totalRem)) },
      ],
      footnote: isEstimated
        ? "Chiffre d'affaires issu de vos bordereaux. Connectez votre banque pour voir vos dépenses, cotisations et rémunération."
        : undefined,
    });
  }, [exportData, chartData, year, isEstimated]);

  // Daily rate computed from past months with CA > 0, neutralized of saved vacation days.
  // Used to simulate CA for current/future months in the selected year.
  const dailyRate = useMemo(() => {
    if (!chartData.length) return 0;
    const now = new Date();
    const isPastYear = year < now.getFullYear();
    const currentMonthIdx = now.getMonth();
    let totalCA = 0;
    let totalDays = 0;
    chartData.forEach((m, i) => {
      const isPast = isPastYear || (year === now.getFullYear() && i < currentMonthIdx);
      if (!isPast || m.revenus <= 0) return;
      const wd = countWorkingDays(year, i + 1, daysPerWeek);
      const worked = workedDays[i] ?? wd;
      if (worked > 0) {
        totalCA += m.revenus;
        totalDays += worked;
      }
    });
    return totalDays > 0 ? totalCA / totalDays : 0;
  }, [chartData, workedDays, year, daysPerWeek]);

  // CA mensuel projeté (mois passé = réel ; mois courant = réel + projection sur
  // les jours restants ; mois futur = dailyRate × jours travaillables). Sert à
  // afficher la ligne "Rém. avant impôt" en miroir du CA en mode fallback —
  // les charges étant inconnues, rem = CA, projeté comme le CA.
  const projectedCAByMonth = useMemo<number[]>(() => {
    if (!chartData.length) return [];
    const now = new Date();
    const isPastYear = year < now.getFullYear();
    const isFutureYear = year > now.getFullYear();
    const currentMonthIdx = now.getMonth();
    return chartData.map((m, i) => {
      const isPastMonth = isPastYear || (year === now.getFullYear() && i < currentMonthIdx);
      const isCurrentMonth = year === now.getFullYear() && i === currentMonthIdx;
      const isFutureMonth = isFutureYear || (year === now.getFullYear() && i > currentMonthIdx);
      if (isPastMonth) return Math.round(m.revenus);
      if (dailyRate <= 0) return Math.round(m.revenus);
      if (isFutureMonth) {
        const wd = countWorkingDays(year, i + 1, daysPerWeek);
        const worked = workedDays[i] ?? wd;
        return Math.round(dailyRate * worked);
      }
      if (isCurrentMonth) {
        const totalWd = countWorkingDays(year, i + 1, daysPerWeek);
        const remainingWd = countRemainingWorkingDays(year, i + 1, now.getDate() + 1, daysPerWeek);
        const ratioRemaining = totalWd > 0 ? remainingWd / totalWd : 0;
        // Jours travaillés prévus sur le mois (saisis ou défaut), ramenés à la
        // fraction restante du mois.
        const monthWorked = workedDays[i] ?? totalWd;
        const workedRemaining = Math.max(0, monthWorked * ratioRemaining);
        return Math.round(m.revenus) + Math.round(dailyRate * workedRemaining);
      }
      return 0;
    });
  }, [chartData, dailyRate, year, daysPerWeek, workedDays]);

  const projectedAnnualCA = useMemo(
    () => projectedCAByMonth.reduce((s, v) => s + v, 0),
    [projectedCAByMonth],
  );

  // ── Cotisations sociales : réel sinon estimé (cohérence inter-onglets) ──
  // Calendrier des échéances URSSAF/CARPIMKO pour ventiler l'estimation par mois,
  // exactement comme l'onglet « Mes cotisations sociales ».
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
  const calendar = useMemo(() => buildCalendar(prefs), [prefs]);

  // Montant estimé par mois (0 hors mois d'échéance).
  const estimatedCotisMonths = useMemo(() => {
    if (!estimate) return Array.from({ length: 12 }, () => ({ urssaf: 0, carpimko: 0 }));
    return Array.from({ length: 12 }, (_, i) => {
      const events = calendar[i] ?? [];
      return {
        urssaf: events.some((e) => e.type === "urssaf") ? estimate.urssafParEcheance : 0,
        carpimko: events.some((e) => e.type === "carpimko") ? estimate.carpimkoParEcheance : 0,
      };
    });
  }, [estimate, calendar]);

  // URSSAF/CARPIMKO effectifs par mois : le réel s'il a été prélevé, sinon
  // l'estimation pour le mois courant et les mois à venir (même règle que
  // « Mes cotisations sociales »). Les mois passés sans prélèvement restent à 0.
  // `estimated` = true si la valeur affichée provient de l'estimation (→ style ~).
  const cotisationsMonths = useMemo(() => {
    const currentMonthIdx = new Date().getMonth();
    return chartData.map((m, i) => {
      const hasReel = m.urssaf > 0 || m.carpimko > 0;
      const canEstimate = year > currentYear || (year === currentYear && i >= currentMonthIdx);
      const est = estimatedCotisMonths[i] ?? { urssaf: 0, carpimko: 0 };
      const urssaf = m.urssaf > 0 ? m.urssaf : (canEstimate ? est.urssaf : 0);
      const carpimko = m.carpimko > 0 ? m.carpimko : (canEstimate ? est.carpimko : 0);
      return { urssaf, carpimko, estimated: !hasReel && (urssaf > 0 || carpimko > 0) };
    });
  }, [chartData, estimatedCotisMonths, year, currentYear]);

  return (
    <div className="space-y-6">
      {/* Sélecteur d'année global du tab (au-dessus, comme dans "Mes cotisations sociales") */}
      <div className="flex items-center justify-end gap-2">
        <ExportButtons
          onCsv={handleExportCsv}
          onPdf={handleExportPdf}
          disabled={loading || chartData.length === 0}
        />
        <YearSelector year={year} setYear={setYear} maxYear={currentYear} />
      </div>

      {/* Chart + monthly breakdown (aligned) */}
      <div className="relative bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 overflow-hidden">
        {/* Overlay uniquement si pas de banque ET pas de bordereaux exploitables.
            Pendant le chargement initial on l'inhibe pour éviter un flash : les
            skeletons en dessous suffisent à indiquer l'attente. */}
        <DataMissingOverlay bankConnected={bankConnected || isEstimated || loading} />
        {isEstimated && (
          <div className="px-4 py-1.5 text-[11px] text-ardoise-400 border-b border-ardoise-100/80 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <span>
              CA issu de vos bordereaux.{" "}
              <Link href="/transactions" className="underline decoration-ardoise-300 underline-offset-2 hover:text-ardoise-600">
                Connecter ma banque
              </Link>{" "}
              pour voir vos dépenses et votre rémunération.
            </span>
          </div>
        )}
        <div className="pb-2 flex flex-col md:flex-row">
          {/* KPI cards stacked vertically */}
          <div className="flex flex-col items-center px-2 py-1 w-full md:w-[260px] md:shrink-0">
            <div className="w-[80%] mx-3 my-2 bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[10px] p-2.5">
              <div className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-menthe-600 shrink-0">
                  <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.3" />
                  <path d="M12 16V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
                  <path d="M8 12l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                </svg>
                <p className="text-[11px] font-mono uppercase tracking-wide text-ardoise-500 truncate inline-flex items-center gap-1.5">
                  Chiffre d&apos;affaires
                  <CASourceIndicator source={effectiveCA.source} primary="transactions" />
                </p>
              </div>
              {loading ? (
                <div className="h-5 bg-ardoise-200 rounded w-20 animate-pulse mt-1" />
              ) : (
                <p className="text-lg font-bold text-ardoise-900 mt-0.5 font-mono">{formatCurrency(effectiveCA.ca)}</p>
              )}
            </div>

            <div className="w-[80%] mx-3 my-2 bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[10px] p-2.5">
              <div>
                <div className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-red-500 shrink-0">
                    <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.3" />
                    <path d="M12 8v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
                    <path d="M16 12l-4 4-4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                  </svg>
                  <p className="text-[11px] font-mono uppercase tracking-wide text-ardoise-500 truncate">Dépenses</p>
                </div>
                {loading ? (
                  <div className="h-5 bg-ardoise-200 rounded w-20 animate-pulse mt-1" />
                ) : (
                  <p className="text-lg font-bold text-ardoise-900 mt-0.5 font-mono">
                    {isEstimated ? "—" : formatCurrency(kpis.decaissement)}
                  </p>
                )}
              </div>
              <div className="border-t border-ardoise-100 my-2" />
              <div>
                <div className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-orange-500 shrink-0">
                    <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.3" />
                    <path d="M12 8v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
                    <path d="M16 12l-4 4-4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                  </svg>
                  <p className="text-[11px] font-mono uppercase tracking-wide text-ardoise-500 truncate">Dont cotisations sociales</p>
                </div>
                {loading ? (
                  <div className="h-5 bg-ardoise-200 rounded w-20 animate-pulse mt-1" />
                ) : (
                  <p className="text-lg font-bold text-ardoise-900 mt-0.5 font-mono">
                    {isEstimated ? "—" : formatCurrency(kpis.cotisations)}
                  </p>
                )}
              </div>
            </div>

            <div className="w-[80%] mx-3 my-2 bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[10px] p-2.5">
              <div className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-brand-600 shrink-0">
                  <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3" />
                  <path d="M12 7v4l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                  <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.5" />
                </svg>
                <p className="text-[11px] font-mono uppercase tracking-wide text-ardoise-500 truncate inline-flex items-center gap-1.5">
                  Rém. avant impôt
                  {isEstimated && <EstimationBadge tooltip="En l'absence de données bancaires, la rémunération avant impôt est affichée en miroir du CA (charges inconnues)." />}
                </p>
              </div>
              {loading ? (
                <div className="h-5 bg-ardoise-200 rounded w-20 animate-pulse mt-1" />
              ) : isEstimated ? (
                <p className="text-lg font-bold text-ardoise-400 italic mt-0.5 font-mono">
                  {projectedAnnualCA > 0 ? `~${formatCurrency(projectedAnnualCA)}` : "—"}
                </p>
              ) : (
                <p className="text-lg font-bold text-ardoise-900 mt-0.5 font-mono">
                  {formatCurrency(
                    chartData.reduce((s, m) => s + m.revenus - m.urssaf - m.carpimko - m.chargesPro - m.retrocession - m.madelin, 0)
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-end" ref={chartRef}>
            {loading ? (
              <div className="h-60 bg-ardoise-100 rounded animate-pulse" />
            ) : (
              <>
                {/* Sous lg : un seul mois, aligné sur la carte détaillée en dessous
                    (le tableau 12 colonnes n'apparaît qu'à partir de lg). */}
                <div className="lg:hidden px-4 pt-2 space-y-2">
                  <MonthStepper month={mobileMonth} setMonth={setMobileMonth} year={year} />
                  {chartData[mobileMonth] && (
                    <ActivityBarChart data={[chartData[mobileMonth]]} isEstimated={isEstimated} single />
                  )}
                </div>
                <div className="hidden lg:block">
                  <ActivityBarChart data={chartData} isEstimated={isEstimated} />
                </div>
              </>
            )}
          </div>
        </div>

        {!loading && (<>
          <div className="border-t border-ardoise-100 text-xs overflow-x-auto hidden lg:block">
            <div className="min-w-[900px]">
              {/* Header */}
              <div className="grid border-b border-ardoise-100" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                <div className="px-3 py-3.5 sticky left-0 z-[1] bg-white border-r border-ardoise-100" />
                {chartData.map((m) => (
                  <div key={m.name} className="py-3.5 text-center font-semibold text-ardoise-500">{m.name}</div>
                ))}
              </div>
              {/* CA */}
              <div className="grid border-b border-ardoise-50" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                <div className="px-3 py-3.5 text-sm font-semibold text-ardoise-700 sticky left-0 z-[1] bg-white border-r border-ardoise-100">Chiffre d&apos;affaires</div>
                {chartData.map((m, i) => {
                  const now = new Date();
                  const isPastYear = year < now.getFullYear();
                  const isFutureYear = year > now.getFullYear();
                  const isCurrentMonth = year === now.getFullYear() && i === now.getMonth();
                  const isPastMonth = isPastYear || (year === now.getFullYear() && i < now.getMonth());
                  const isFutureMonth = isFutureYear || (year === now.getFullYear() && i > now.getMonth());

                  // Past months: real CA from bank_transactions, intact.
                  if (isPastMonth) {
                    return (
                      <div key={m.name} className="py-3.5 text-center font-medium text-ardoise-700 font-mono">
                        {m.revenus > 0 ? formatCurrency(m.revenus) : "—"}
                      </div>
                    );
                  }

                  // No daily rate yet → no simulation possible.
                  if (dailyRate <= 0) {
                    return (
                      <div key={m.name} className="py-3.5 text-center font-medium text-ardoise-700 font-mono">
                        {m.revenus > 0 ? formatCurrency(m.revenus) : "—"}
                      </div>
                    );
                  }

                  // Future month: simulated CA = daily_rate × jours travaillés (saisis ou défaut).
                  if (isFutureMonth) {
                    const wd = countWorkingDays(year, i + 1, daysPerWeek);
                    const worked = workedDays[i] ?? wd;
                    const simulated = Math.round(dailyRate * worked);
                    return (
                      <div key={m.name} className="py-3.5 text-center font-medium text-ardoise-400 italic font-mono">
                        {simulated > 0 ? `~${formatCurrency(simulated)}` : formatCurrency(0)}
                      </div>
                    );
                  }

                  // Current month: real to date + projection sur les jours travaillés
                  // prévus (saisis ou défaut), ramenés à la fraction restante du mois.
                  if (isCurrentMonth) {
                    const totalWd = countWorkingDays(year, i + 1, daysPerWeek);
                    const remainingWd = countRemainingWorkingDays(year, i + 1, now.getDate() + 1, daysPerWeek);
                    const ratioRemaining = totalWd > 0 ? remainingWd / totalWd : 0;
                    const monthWorked = workedDays[i] ?? totalWd;
                    const workedRemaining = Math.max(0, monthWorked * ratioRemaining);
                    const projection = Math.round(dailyRate * workedRemaining);
                    const total = Math.round(m.revenus) + projection;
                    return (
                      <div key={m.name} className="py-3.5 text-center font-medium text-ardoise-700 font-mono">
                        {total > 0 ? <>~{formatCurrency(total)}</> : formatCurrency(0)}
                      </div>
                    );
                  }

                  return <div key={m.name} className="py-3.5 text-center font-medium text-ardoise-300">—</div>;
                })}
              </div>
              {/* Charges pro. */}
              <div
                className="grid border-b border-ardoise-50 cursor-pointer hover:bg-ardoise-50/50 transition-colors"
                style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}
                onClick={() => setChargesProOpen((v) => !v)}
              >
                <div className="px-3 py-3.5 text-sm font-semibold text-ardoise-700 flex items-center gap-1.5 sticky left-0 z-[1] bg-white border-r border-ardoise-100">
                  Charges pro.
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`text-ardoise-400 transition-transform ${chargesProOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
                </div>
                {chartData.map((m) => {
                  const dep = m.autresDepenses;
                  return (
                    <div key={m.name} className="py-3.5 text-center font-medium text-ardoise-700 font-mono">
                      {dep > 0 ? formatCurrency(dep) : "—"}
                    </div>
                  );
                })}
              </div>
              {/* Sous-lignes charges pro. */}
              {chargesProOpen && (
                <>
                  {([
                    { key: "chargesPro", label: "Charges pro" },
                    { key: "retrocession", label: "Rétrocession" },
                    { key: "madelin", label: "Madelin" },
                  ] as const).map((sub) => (
                    <div key={sub.key} className="grid border-b border-ardoise-50 bg-ardoise-50/30" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                      <div className="pl-7 pr-3 py-2.5 text-xs font-medium text-ardoise-500 sticky left-0 z-[1] bg-white border-r border-ardoise-100">{sub.label}</div>
                      {chartData.map((m, i) => {
                        // « Charges pro » = part bancaire seule : on retranche le manuel,
                        // affiché ci-dessous en lignes séparées, pour ne pas le compter deux fois.
                        const val = sub.key === "chargesPro" ? Math.max(0, m.chargesPro - (manualByMonth[i] ?? 0)) : m[sub.key];
                        return (
                          <div key={m.name} className="py-2.5 text-center text-xs font-medium text-ardoise-500 font-mono">
                            {val > 0 ? formatCurrency(val) : "—"}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* Lignes de charges pro. saisies manuellement (montant éditable par mois).
                      Fond blanc (vs. gris des sous-lignes calculées ci-dessus) : le contraste
                      signale que la ligne est saisissable et non dérivée. */}
                  {manualLines.map((line) => (
                    <div key={line.type} className="group grid border-b border-ardoise-50 bg-white" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                      <div className="pl-7 pr-3 py-2 text-xs font-medium text-ardoise-600 flex items-center gap-1.5 sticky left-0 z-[1] bg-white border-r border-ardoise-100">
                        <button
                          type="button"
                          onClick={() => handleRemoveChargeLine(line.type)}
                          title="Supprimer cette ligne"
                          className="shrink-0 text-ardoise-300 hover:text-red-500 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                        <span className="truncate">{manualChargeLabel(line.type)}</span>
                      </div>
                      {Array.from({ length: 12 }, (_, i) => (
                        <div key={i} className="px-0.5 py-1.5">
                          <input
                            key={`${year}-${line.type}-${i}`}
                            type="text"
                            inputMode="decimal"
                            defaultValue={line.amounts[i] ? String(line.amounts[i]) : ""}
                            placeholder="0"
                            title="Cliquez pour saisir un montant"
                            onBlur={(e) => commitManualCell(line.type, i, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                            className="w-full rounded border border-ardoise-200 bg-white hover:border-ardoise-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-200 px-1 py-1 text-center text-xs font-mono text-ardoise-700 outline-none transition-colors placeholder:text-ardoise-300 cursor-text"
                          />
                        </div>
                      ))}
                    </div>
                  ))}

                  {/* Ajout d'une ligne : bouton + menu déroulant des types restants */}
                  <div className="grid border-b border-ardoise-50" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                    <div className="pl-7 pr-3 py-2 sticky left-0 z-[1] bg-white border-r border-ardoise-100">
                      {availableChargeTypes.length > 0 ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setAddMenuOpen((v) => !v)}
                            className="flex items-center gap-1.5 text-xs font-medium text-violet-700 hover:text-violet-900 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            Ajouter une charge
                          </button>
                          {addMenuOpen && (
                            <div className="mt-1.5 w-full max-h-64 overflow-y-auto rounded-md border border-ardoise-200 bg-white divide-y divide-ardoise-50">
                              {availableChargeTypes.map((t) => (
                                <button
                                  key={t.key}
                                  type="button"
                                  onClick={() => handleAddChargeLine(t.key)}
                                  className="w-full px-3 py-2 text-left text-xs text-ardoise-700 hover:bg-violet-50 transition-colors"
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-ardoise-300">Tous les types ajoutés</span>
                      )}
                    </div>
                  </div>
                </>
              )}
              {/* Impôt */}
              <div
                className="grid border-b border-ardoise-50 cursor-pointer hover:bg-ardoise-50/50 transition-colors"
                style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}
                onClick={() => setImpotOpen((v) => !v)}
              >
                <div className="px-3 py-3.5 text-sm font-semibold text-ardoise-700 flex items-center gap-1.5 sticky left-0 z-[1] bg-white border-r border-ardoise-100">
                  Impôts
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`text-ardoise-400 transition-transform ${impotOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
                </div>
                {chartData.map((m, i) => {
                  const c = cotisationsMonths[i] ?? { urssaf: m.urssaf, carpimko: m.carpimko, estimated: false };
                  const val = c.urssaf + c.carpimko + m.impots;
                  // Estimé tant qu'il n'y a que des cotisations estimées (aucun impôt réel).
                  const isEst = c.estimated && m.impots === 0;
                  return (
                    <div key={m.name} className={`py-3.5 text-center font-medium font-mono ${isEst ? "text-ardoise-400 italic" : "text-ardoise-700"}`}>
                      {val > 0 ? `${isEst ? "~" : ""}${formatCurrency(val)}` : "—"}
                    </div>
                  );
                })}
              </div>
              {/* Sous-lignes impôt */}
              {impotOpen && (
                <>
                  {([
                    { key: "urssaf", label: "URSSAF" },
                    { key: "carpimko", label: "CARPIMKO" },
                    { key: "impots", label: "Impôts versés" },
                  ] as const).map((sub) => (
                    <div key={sub.key} className="grid border-b border-ardoise-50 bg-ardoise-50/30" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                      <div className="pl-7 pr-3 py-2.5 text-xs font-medium text-ardoise-500 sticky left-0 z-[1] bg-white border-r border-ardoise-100">{sub.label}</div>
                      {chartData.map((m, i) => {
                        const c = cotisationsMonths[i] ?? { urssaf: m.urssaf, carpimko: m.carpimko, estimated: false };
                        // URSSAF/CARPIMKO : réel sinon estimé ; « Impôts versés » reste le réel.
                        const val = sub.key === "urssaf" ? c.urssaf : sub.key === "carpimko" ? c.carpimko : m.impots;
                        const isEst = (sub.key === "urssaf" || sub.key === "carpimko") && c.estimated && val > 0;
                        return (
                          <div key={m.name} className={`py-2.5 text-center text-xs font-medium font-mono ${isEst ? "text-ardoise-400 italic" : "text-ardoise-500"}`}>
                            {val > 0 ? `${isEst ? "~" : ""}${formatCurrency(val)}` : "—"}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
              {/* Rém. avant impôt */}
              <div
                className="grid border-b border-ardoise-50 cursor-pointer hover:bg-ardoise-50/50 transition-colors"
                style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}
                onClick={() => setRemOpen((v) => !v)}
              >
                <div className="px-3 py-3.5 text-sm font-semibold text-ardoise-700 flex items-center gap-1.5 sticky left-0 z-[1] bg-white border-r border-ardoise-100">
                  Rém. avant impôt
                  {isEstimated && <EstimationBadge tooltip="En l'absence de données bancaires, la rémunération avant impôt est affichée en miroir du CA (charges inconnues). Connectez votre banque pour les charges réelles." />}
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`text-ardoise-400 transition-transform ${remOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
                </div>
                {chartData.map((m, i) => {
                  // Fallback : rem = CA projeté (mêmes valeurs que la ligne CA),
                  // affichées en italique gris + ~ pour signaler l'estimation.
                  if (isEstimated) {
                    const projected = projectedCAByMonth[i] ?? 0;
                    return (
                      <div key={m.name} className="py-3.5 text-center font-medium text-ardoise-400 italic font-mono">
                        {projected > 0 ? `~${formatCurrency(projected)}` : "—"}
                      </div>
                    );
                  }
                  const charges = m.urssaf + m.carpimko + m.chargesPro + m.retrocession + m.madelin;
                  const res = m.revenus - charges;
                  const empty = m.revenus === 0 && charges === 0;
                  return (
                    <div key={m.name} className={`py-3.5 text-center font-medium font-mono ${empty ? "text-ardoise-300" : "text-ardoise-900"}`}>
                      {empty ? "—" : formatCurrency(res)}
                    </div>
                  );
                })}
              </div>
              {/* Sub-rows rém. avant impôt */}
              {remOpen && (
                <>
                  <div className="grid border-b border-ardoise-50 bg-ardoise-50/30" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                    <div className="pl-7 pr-3 py-2.5 text-xs font-medium text-ardoise-500 sticky left-0 z-[1] bg-white border-r border-ardoise-100">Rémunération versée</div>
                    {chartData.map((m) => (
                      <div key={m.name} className="py-2.5 text-center text-xs font-medium text-ardoise-500 font-mono">
                        {m.remuneration > 0 ? formatCurrency(m.remuneration) : "—"}
                      </div>
                    ))}
                  </div>
                  <div className="grid border-b border-ardoise-50 bg-ardoise-50/30" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                    <div className="pl-7 pr-3 py-2.5 text-xs font-medium text-ardoise-500 sticky left-0 z-[1] bg-white border-r border-ardoise-100">Provision d&apos;impôt estimée</div>
                    {chartData.map((m, i) => {
                      const isFuture = year > currentYear || (year === currentYear && i >= currentMonth);
                      // En fallback bordereaux : on n'estime rien dans Mon activité,
                      // les charges déductibles ne sont pas connues → tiret partout.
                      if (isEstimated) {
                        return <div key={m.name} className="py-2.5 text-center text-xs font-medium text-ardoise-300">—</div>;
                      }
                      // Past months: show real tax transactions
                      if (!isFuture) {
                        return (
                          <div key={m.name} className="py-2.5 text-center text-xs font-medium text-ardoise-500 font-mono">
                            {m.impots > 0 ? formatCurrency(m.impots) : "—"}
                          </div>
                        );
                      }
                      // Current/future months: estimate = rém. avant impôt × taux PAS
                      const pasRate = hp ? parseFloat(hp.pasRate) / 100 : 0;
                      const charges = m.urssaf + m.carpimko + m.chargesPro + m.retrocession + m.madelin;
                      const remAvantImpot = m.revenus - charges;
                      const estimated = remAvantImpot > 0 ? Math.round(remAvantImpot * pasRate) : 0;
                      return (
                        <div key={m.name} className="py-2.5 text-center text-xs font-medium text-ardoise-400 italic font-mono">
                          {estimated > 0 ? `~${formatCurrency(estimated)}` : "—"}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {/* Jours travaillés */}
              <div className="grid" style={{ gridTemplateColumns: "260px repeat(12, 1fr)" }}>
                <div className="px-3 py-3.5 text-sm font-semibold text-ardoise-700 flex items-center gap-1.5 sticky left-0 z-[1] bg-white border-r border-ardoise-100">
                  Jours travaillés
                  <InfoTooltip text="Nombre de jours travaillés prévus dans le mois. Par défaut : les jours ouvrés (lundi→vendredi, hors jours fériés) selon votre rythme. Ajustez-le pour refléter vos congés — la projection de CA et les cotisations s'ajustent." />
                </div>
                {chartData.map((m, i) => {
                  const now = new Date();
                  const isPastMonth = year < now.getFullYear() || (year === now.getFullYear() && i < now.getMonth());
                  const fullMonth = countWorkingDays(year, i + 1, daysPerWeek);
                  return (
                    <div key={m.name} className="py-2.5 flex items-center justify-center">
                      <input
                        type="number"
                        min="0"
                        max={fullMonth}
                        value={workedDays[i] ?? fullMonth}
                        disabled={isPastMonth}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(fullMonth, parseInt(e.target.value) || 0));
                          setWorkedDays((prev) => { const next = [...prev]; next[i] = v; return next; });
                        }}
                        onBlur={(e) => {
                          const v = Math.max(0, Math.min(fullMonth, parseInt(e.target.value) || 0));
                          void upsertWorkedDayAction(year, i + 1, v);
                        }}
                        className="w-10 text-center text-xs font-medium text-ardoise-700 border border-ardoise-200 rounded hover:border-ardoise-300 focus:border-brand-500 focus:outline-none bg-transparent transition-colors py-1 disabled:bg-ardoise-50 disabled:text-ardoise-300 disabled:cursor-not-allowed disabled:hover:border-ardoise-200 font-mono"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Vue mobile : un mois à la fois (le tableau ci-dessus est masqué sous lg) ── */}
          <div className="border-t border-ardoise-100 lg:hidden p-4 space-y-3">
            {/* Le sélecteur de mois est au-dessus du graphe (il pilote les deux). */}
            {(() => {
              const mi = mobileMonth;
              const m = chartData[mi];
              if (!m) return null;
              const now = new Date();
              const isPastMonth = year < now.getFullYear() || (year === now.getFullYear() && mi < now.getMonth());
              const isFuture = year > currentYear || (year === currentYear && mi >= currentMonth);
              const caProjected = !isPastMonth && dailyRate > 0;
              const caVal = projectedCAByMonth[mi] ?? Math.round(m.revenus);
              const chargesTotal = m.autresDepenses;
              const chargesProBank = Math.max(0, m.chargesPro - (manualByMonth[mi] ?? 0));
              const impotsTotal = m.urssaf + m.carpimko + m.impots;
              const pasRate = hp ? parseFloat(hp.pasRate) / 100 : 0;
              const remCharges = m.urssaf + m.carpimko + m.chargesPro + m.retrocession + m.madelin;
              const remAvantImpot = m.revenus - remCharges;
              const remEmpty = m.revenus === 0 && remCharges === 0;
              const provisionEst = remAvantImpot > 0 ? Math.round(remAvantImpot * pasRate) : 0;
              const fullMonth = countWorkingDays(year, mi + 1, daysPerWeek);
              return (
                <div className="rounded-[12px] border border-ardoise-100 overflow-hidden divide-y divide-ardoise-50">
                  {/* CA */}
                  <div className="flex items-center justify-between px-3.5 py-3">
                    <span className="text-sm font-semibold text-ardoise-700 inline-flex items-center gap-1.5">
                      Chiffre d&apos;affaires
                      <CASourceIndicator source={effectiveCA.source} primary="transactions" />
                    </span>
                    <span className={`text-sm font-semibold font-mono ${caProjected ? "text-ardoise-400 italic" : "text-ardoise-900"}`}>
                      {caVal > 0 ? (caProjected ? `~${formatCurrency(caVal)}` : formatCurrency(caVal)) : "—"}
                    </span>
                  </div>

                  {/* Charges pro. */}
                  <button type="button" onClick={() => setChargesProOpen((v) => !v)} className="w-full flex items-center justify-between px-3.5 py-3 text-left hover:bg-ardoise-50/50 transition-colors">
                    <span className="text-sm font-semibold text-ardoise-700 flex items-center gap-1.5">
                      Charges pro.
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`text-ardoise-400 transition-transform ${chargesProOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
                    </span>
                    <span className="text-sm font-semibold font-mono text-ardoise-900">{chargesTotal > 0 ? formatCurrency(chargesTotal) : "—"}</span>
                  </button>
                  {chargesProOpen && (
                    <div className="bg-ardoise-50/30 px-3.5 py-2.5 space-y-2">
                      <MobileSubLine label="Charges pro" value={chargesProBank} />
                      <MobileSubLine label="Rétrocession" value={m.retrocession} />
                      <MobileSubLine label="Madelin" value={m.madelin} />
                      {manualLines.map((line) => (
                        <div key={line.type} className="flex items-center justify-between gap-2">
                          <span className="text-xs text-ardoise-600 flex items-center gap-1.5 min-w-0">
                            <button type="button" onClick={() => handleRemoveChargeLine(line.type)} title="Supprimer cette ligne" className="shrink-0 text-ardoise-300 hover:text-red-500 transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                            <span className="truncate">{manualChargeLabel(line.type)}</span>
                          </span>
                          <input
                            key={`m-${year}-${line.type}-${mi}`}
                            type="text"
                            inputMode="decimal"
                            defaultValue={line.amounts[mi] ? String(line.amounts[mi]) : ""}
                            placeholder="0"
                            onBlur={(e) => commitManualCell(line.type, mi, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                            className="w-24 shrink-0 rounded border border-ardoise-200 bg-white hover:border-ardoise-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-200 px-2 py-1 text-right text-xs font-mono text-ardoise-700 outline-none transition-colors placeholder:text-ardoise-300"
                          />
                        </div>
                      ))}
                      {availableChargeTypes.length > 0 && (
                        <div className="pt-0.5">
                          <button type="button" onClick={() => setAddMenuOpen((v) => !v)} className="flex items-center gap-1.5 text-xs font-medium text-violet-700 hover:text-violet-900 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            Ajouter une charge
                          </button>
                          {addMenuOpen && (
                            <div className="mt-1.5 w-full max-h-64 overflow-y-auto rounded-md border border-ardoise-200 bg-white divide-y divide-ardoise-50">
                              {availableChargeTypes.map((t) => (
                                <button key={t.key} type="button" onClick={() => handleAddChargeLine(t.key)} className="w-full px-3 py-2 text-left text-xs text-ardoise-700 hover:bg-violet-50 transition-colors">{t.label}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Impôts */}
                  <button type="button" onClick={() => setImpotOpen((v) => !v)} className="w-full flex items-center justify-between px-3.5 py-3 text-left hover:bg-ardoise-50/50 transition-colors">
                    <span className="text-sm font-semibold text-ardoise-700 flex items-center gap-1.5">
                      Impôts
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`text-ardoise-400 transition-transform ${impotOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
                    </span>
                    <span className="text-sm font-semibold font-mono text-ardoise-900">{impotsTotal > 0 ? formatCurrency(impotsTotal) : "—"}</span>
                  </button>
                  {impotOpen && (
                    <div className="bg-ardoise-50/30 px-3.5 py-2.5 space-y-2">
                      <MobileSubLine label="URSSAF" value={m.urssaf} />
                      <MobileSubLine label="CARPIMKO" value={m.carpimko} />
                      <MobileSubLine label="Impôts versés" value={m.impots} />
                    </div>
                  )}

                  {/* Rém. avant impôt */}
                  <button type="button" onClick={() => setRemOpen((v) => !v)} className="w-full flex items-center justify-between px-3.5 py-3 text-left hover:bg-ardoise-50/50 transition-colors">
                    <span className="text-sm font-semibold text-ardoise-700 flex items-center gap-1.5">
                      Rém. avant impôt
                      {isEstimated && <EstimationBadge tooltip="En l'absence de données bancaires, la rémunération avant impôt est affichée en miroir du CA (charges inconnues). Connectez votre banque pour les charges réelles." />}
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`text-ardoise-400 transition-transform ${remOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
                    </span>
                    <span className={`text-sm font-semibold font-mono ${isEstimated ? "text-ardoise-400 italic" : remEmpty ? "text-ardoise-300" : "text-ardoise-900"}`}>
                      {isEstimated ? (caVal > 0 ? `~${formatCurrency(caVal)}` : "—") : remEmpty ? "—" : formatCurrency(remAvantImpot)}
                    </span>
                  </button>
                  {remOpen && (
                    <div className="bg-ardoise-50/30 px-3.5 py-2.5 space-y-2">
                      <MobileSubLine label="Rémunération versée" value={m.remuneration} />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ardoise-500">Provision d&apos;impôt estimée</span>
                        <span className={`text-xs font-mono ${isEstimated ? "text-ardoise-300" : isFuture ? "text-ardoise-400 italic" : "text-ardoise-500"}`}>
                          {isEstimated ? "—" : !isFuture ? (m.impots > 0 ? formatCurrency(m.impots) : "—") : (provisionEst > 0 ? `~${formatCurrency(provisionEst)}` : "—")}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Jours travaillés */}
                  <div className="flex items-center justify-between px-3.5 py-3">
                    <span className="text-sm font-semibold text-ardoise-700 flex items-center gap-1.5">
                      Jours travaillés
                      <InfoTooltip text="Nombre de jours travaillés prévus dans le mois. Par défaut : les jours ouvrés (lundi→vendredi, hors jours fériés) selon votre rythme. Ajustez-le pour refléter vos congés — la projection de CA et les cotisations s'ajustent." />
                    </span>
                    <input
                      type="number"
                      min="0"
                      max={fullMonth}
                      value={workedDays[mi] ?? fullMonth}
                      disabled={isPastMonth}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(fullMonth, parseInt(e.target.value) || 0));
                        setWorkedDays((prev) => { const next = [...prev]; next[mi] = v; return next; });
                      }}
                      onBlur={(e) => {
                        const v = Math.max(0, Math.min(fullMonth, parseInt(e.target.value) || 0));
                        void upsertWorkedDayAction(year, mi + 1, v);
                      }}
                      className="w-14 text-center text-sm font-medium text-ardoise-700 border border-ardoise-200 rounded hover:border-ardoise-300 focus:border-brand-500 focus:outline-none py-1 disabled:bg-ardoise-50 disabled:text-ardoise-300 disabled:cursor-not-allowed font-mono"
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        </>)}
      </div>
    </div>
  );
}

// ── Contributions Tab ──

function ContributionsTab() {
  const hp = usePractitioner();
  const { loadYearCore, loadEstimate } = useManagementData();
  const bankConnected = !!hp?.bridgeUserUuid;
  const [estimate, setEstimate] = useState<CotisationsEstimate | null>(null);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState<{ urssaf: number; carpimko: number }[]>(Array(12).fill({ urssaf: 0, carpimko: 0 }));
  // Fallback bordereaux activé quand pas de banque connectée mais des
  // bordereaux exploitables. Tous les montants affichés deviennent estimés.
  const [isEstimated, setIsEstimated] = useState(false);
  // Détail chiffré mois par mois — replié par défaut (le graphe suffit à lire la
  // tendance ; le détail est là pour qui veut les montants exacts).
  const [detailOpen, setDetailOpen] = useState(false);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  // Build calendar to know which months have payments
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

  const calendar = useMemo(() => buildCalendar(prefs), [prefs]);

  // Load monthly data + estimate.
  // Source primaire = bank_transactions (cohérent avec Mon activité). Si le
  // praticien n'a pas connecté sa banque mais a des bordereaux, on bascule sur
  // un fallback : monthly data depuis les passages (urssaf/carpimko réels = 0)
  // et estimation forcée pour l'année courante.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setTableLoading(true);
    setCardsLoading(true);
    setEstimate(null);
    (async () => {
      const core = await loadYearCore(year);
      setIsEstimated(core.isEstimated);
      setMonthlyData(core.months.map((m) => ({ urssaf: m.urssaf, carpimko: m.carpimko })));
      setTableLoading(false);

      // Estimation calée sur l'année sélectionnée : getCotisationsEstimate
      // utilise le paramètre `year` pour PASS, annualisation, début d'activité
      // et N-2 — fonctionne donc aussi sur les années passées (où le CA passé est
      // déjà la valeur annuelle complète, pas d'extrapolation).
      const est = await loadEstimate(year);
      if (est) setEstimate(est);
      setCardsLoading(false);
    })().catch(() => { setTableLoading(false); setCardsLoading(false); });
  }, [year, loadYearCore, loadEstimate, bankConnected]);

  // Totals réels (déjà versés) pour l'année sélectionnée
  const { totalUrssafReel, totalCarpimkoReel } = useMemo(() => {
    const u = monthlyData.reduce((s, m) => s + m.urssaf, 0);
    const c = monthlyData.reduce((s, m) => s + m.carpimko, 0);
    return { totalUrssafReel: u, totalCarpimkoReel: c };
  }, [monthlyData]);

  const isPastYear = year < currentYear;
  // En fallback bordereaux, aucun "réel" n'est observable même sur années passées.
  const showReel = isPastYear && !isEstimated;

  // Estimated amounts per month based on calendar events
  const estimatedMonths = useMemo(() => {
    if (!estimate) return Array(12).fill({ urssaf: 0, carpimko: 0 });
    return Array.from({ length: 12 }, (_, i) => {
      const events = calendar[i] || [];
      const hasUrssaf = events.some((e) => e.type === "urssaf");
      const hasCarpimko = events.some((e) => e.type === "carpimko");
      return {
        urssaf: hasUrssaf ? estimate.urssafParEcheance : 0,
        carpimko: hasCarpimko ? estimate.carpimkoParEcheance : 0,
      };
    });
  }, [estimate, calendar]);

  // Ventilation mensuelle « réel sinon estimé » — alimente le graphe et le détail
  // chiffré repliable (même logique que les anciennes cellules du tableau).
  const monthChart = useMemo(() => {
    const nowMonthIdx = new Date().getMonth();
    return MONTH_LABELS.map((name, i) => {
      const reelU = monthlyData[i]?.urssaf ?? 0;
      const reelC = monthlyData[i]?.carpimko ?? 0;
      const canEstimate = isEstimated || year > currentYear || (year === currentYear && i >= nowMonthIdx);
      const urssaf = reelU > 0 ? reelU : (canEstimate ? (estimatedMonths[i]?.urssaf ?? 0) : 0);
      const carpimko = reelC > 0 ? reelC : (canEstimate ? (estimatedMonths[i]?.carpimko ?? 0) : 0);
      const hasReel = reelU > 0 || reelC > 0;
      return { name, urssaf, carpimko, total: urssaf + carpimko, estimated: !hasReel && urssaf + carpimko > 0 };
    });
  }, [monthlyData, estimatedMonths, year, currentYear, isEstimated]);
  const hasEstimatedMonth = useMemo(() => monthChart.some((m) => m.estimated), [monthChart]);
  const nowMonthIdx = new Date().getMonth();

  const handleExportCotisationsCsv = useCallback(() => {
    const headers = ["Mois", "URSSAF", "CARPIMKO", "Total", "Type"];
    const rows = MONTH_LABELS.map((m, i) => {
      const reelUrssaf = monthlyData[i]?.urssaf ?? 0;
      const reelCarpimko = monthlyData[i]?.carpimko ?? 0;
      const canEstimate = isEstimated || year > currentYear || (year === currentYear && i >= new Date().getMonth());
      const estUrssaf = canEstimate ? (estimatedMonths[i]?.urssaf ?? 0) : 0;
      const estCarpimko = canEstimate ? (estimatedMonths[i]?.carpimko ?? 0) : 0;
      const urssaf = reelUrssaf > 0 ? reelUrssaf : estUrssaf;
      const carpimko = reelCarpimko > 0 ? reelCarpimko : estCarpimko;
      const isReel = reelUrssaf > 0 || reelCarpimko > 0;
      return [m, Math.round(urssaf), Math.round(carpimko), Math.round(urssaf + carpimko), isReel ? "Réel" : (urssaf + carpimko > 0 ? "Estimé" : "—")];
    });
    downloadCSV(`cotisations_${year}`, headers, rows);
  }, [monthlyData, estimatedMonths, year, currentYear, isEstimated]);

  const handleExportCotisationsPdf = useCallback(() => {
    const headers = ["Mois", "URSSAF", "CARPIMKO", "Total", "Type"];
    const rows = MONTH_LABELS.map((m, i) => {
      const reelUrssaf = monthlyData[i]?.urssaf ?? 0;
      const reelCarpimko = monthlyData[i]?.carpimko ?? 0;
      const canEstimate = isEstimated || year > currentYear || (year === currentYear && i >= new Date().getMonth());
      const estUrssaf = canEstimate ? (estimatedMonths[i]?.urssaf ?? 0) : 0;
      const estCarpimko = canEstimate ? (estimatedMonths[i]?.carpimko ?? 0) : 0;
      const urssaf = reelUrssaf > 0 ? reelUrssaf : estUrssaf;
      const carpimko = reelCarpimko > 0 ? reelCarpimko : estCarpimko;
      const isReel = reelUrssaf > 0 || reelCarpimko > 0;
      return [
        m,
        urssaf > 0 ? formatCurrency(Math.round(urssaf)) : "—",
        carpimko > 0 ? formatCurrency(Math.round(carpimko)) : "—",
        urssaf + carpimko > 0 ? formatCurrency(Math.round(urssaf + carpimko)) : "—",
        isReel ? "Réel" : (urssaf + carpimko > 0 ? "Estimé" : "—"),
      ];
    });
    const totalUrssaf = showReel ? totalUrssafReel : (estimate?.urssafAnnuel ?? 0);
    const totalCarpimko = showReel ? totalCarpimkoReel : (estimate?.carpimkoAnnuel ?? 0);
    downloadPDF(`cotisations_${year}`, `Mes cotisations sociales ${year}`, headers, rows, {
      subtitle: showReel ? `Cotisations versées en ${year}` : `Estimation des cotisations ${year}`,
      summary: [
        { label: "URSSAF", value: `${showReel ? "" : "~"}${formatCurrency(Math.round(totalUrssaf))}` },
        { label: "CARPIMKO", value: `${showReel ? "" : "~"}${formatCurrency(Math.round(totalCarpimko))}` },
        { label: "Total", value: `${showReel ? "" : "~"}${formatCurrency(Math.round(totalUrssaf + totalCarpimko))}` },
      ],
      footnote: isEstimated
        ? "Cotisations URSSAF et CARPIMKO estimées à partir du chiffre d'affaires issu de vos bordereaux. Connectez votre banque pour obtenir les montants réellement prélevés."
        : undefined,
    });
  }, [monthlyData, estimatedMonths, year, currentYear, showReel, totalUrssafReel, totalCarpimkoReel, estimate, isEstimated]);

  return (
    <div className="space-y-6">
      {/* Sélecteur d'année global du tab — pilote les cartes, le détail mensuel et l'historique */}
      <div className="flex items-center justify-end gap-2">
        <ExportButtons
          onCsv={handleExportCotisationsCsv}
          onPdf={handleExportCotisationsPdf}
          disabled={tableLoading || cardsLoading}
        />
        <YearSelector year={year} setYear={setYear} maxYear={currentYear} />
      </div>
      {isEstimated && (
        <div className="px-4 py-1.5 text-[11px] text-ardoise-400 flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <span>
            Cotisations estimées à partir de vos bordereaux.{" "}
            <Link href="/transactions" className="underline decoration-ardoise-300 underline-offset-2 hover:text-ardoise-600">
              Connecter ma banque
            </Link>{" "}
            pour les montants réels.
          </span>
        </div>
      )}
      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* URSSAF */}
        <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-6">
          <div className="flex items-center gap-4 mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-urssaf.svg" alt="URSSAF" className="h-8" />
            {isEstimated && <EstimationBadge tooltip="Cotisations URSSAF estimées à partir du CA issu de vos bordereaux. Connectez votre banque pour les montants réellement prélevés." />}
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs text-ardoise-400">
              {showReel ? `Cotisations versées en ${year}` : `Montant total estimé des cotisations ${year}`}
            </p>
            <InfoTooltip text={showReel
              ? `Somme des prélèvements Urssaf effectivement débités sur vos comptes en ${year}.`
              : `Montant total estimé de vos cotisations Urssaf à payer en ${year}, réduit du remboursement estimé (régularisation négative) au titre de ${year - 1}.`}
            />
          </div>
          {(showReel ? tableLoading : cardsLoading) ? (
            <div className="h-8 bg-ardoise-200 rounded w-28 animate-pulse mb-4" />
          ) : (
            <p className="text-2xl font-bold text-ardoise-900 mb-4 font-mono">
              {showReel
                ? (totalUrssafReel > 0 ? formatCurrency(totalUrssafReel) : "—")
                : (estimate ? `~${formatCurrency(estimate.urssafAnnuel)}` : "—")}
            </p>
          )}
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs text-ardoise-400">{showReel ? "Nombre de prélèvements" : "Montant par échéance"}</p>
            <InfoTooltip text={showReel
              ? `Nombre de prélèvements Urssaf passés sur vos comptes en ${year}.`
              : `Estimation du montant prélevé à chaque échéance Urssaf en ${year}.`}
            />
          </div>
          {(showReel ? tableLoading : cardsLoading) ? (
            <div className="h-8 bg-ardoise-200 rounded w-28 animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-ardoise-900">
              {showReel
                ? (monthlyData.filter((m) => m.urssaf > 0).length > 0
                    ? `${monthlyData.filter((m) => m.urssaf > 0).length} prélèvements`
                    : "—")
                : (estimate ? `~${formatCurrency(estimate.urssafParEcheance)}` : "—")}
            </p>
          )}
        </div>

        {/* CARPIMKO */}
        <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-6">
          <div className="flex items-center gap-4 mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-carpimko.png" alt="CARPIMKO" className="h-8" />
            {isEstimated && <EstimationBadge tooltip="Cotisations CARPIMKO estimées à partir du CA issu de vos bordereaux. Connectez votre banque pour les montants réellement prélevés." />}
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs text-ardoise-400">
              {showReel ? `Cotisations versées en ${year}` : `Montant total estimé des cotisations ${year}`}
            </p>
            <InfoTooltip text={showReel
              ? `Somme des prélèvements Carpimko effectivement débités sur vos comptes en ${year}.`
              : `Montant total estimé de vos cotisations Carpimko à payer en ${year}, intégrant la régularisation estimée au titre de ${year - 1}.`}
            />
          </div>
          {(showReel ? tableLoading : cardsLoading) ? (
            <div className="h-8 bg-ardoise-200 rounded w-28 animate-pulse mb-4" />
          ) : (
            <p className="text-2xl font-bold text-ardoise-900 mb-4 font-mono">
              {showReel
                ? (totalCarpimkoReel > 0 ? formatCurrency(totalCarpimkoReel) : "—")
                : (estimate ? `~${formatCurrency(estimate.carpimkoAnnuel)}` : "—")}
            </p>
          )}
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs text-ardoise-400">{showReel ? "Nombre de prélèvements" : "Montant par échéance"}</p>
            <InfoTooltip text={showReel
              ? `Nombre de prélèvements Carpimko passés sur vos comptes en ${year}.`
              : `Estimation du montant prélevé à chaque échéance Carpimko en ${year}.`}
            />
          </div>
          {(showReel ? tableLoading : cardsLoading) ? (
            <div className="h-8 bg-ardoise-200 rounded w-28 animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-ardoise-900">
              {showReel
                ? (monthlyData.filter((m) => m.carpimko > 0).length > 0
                    ? `${monthlyData.filter((m) => m.carpimko > 0).length} prélèvements`
                    : "—")
                : (estimate ? `~${formatCurrency(estimate.carpimkoParEcheance)}` : "—")}
            </p>
          )}
        </div>
      </div>

      {/* Détail mensuel : graphe (URSSAF + CARPIMKO empilés) + détail chiffré repliable */}
      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-1 flex-wrap">
          <h2 className="text-base font-bold text-ardoise-900">Détail mensuel</h2>
          <div className="flex items-center gap-3 text-[11px] text-ardoise-500">
            <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#9060B6" }} /> URSSAF</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#3DB87A" }} /> CARPIMKO</span>
            {hasEstimatedMonth && <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-ardoise-300" /> estimé</span>}
          </div>
        </div>
        {tableLoading ? (
          <div className="px-5 pb-5 pt-2">
            <div className="h-56 bg-ardoise-100 rounded animate-pulse" />
          </div>
        ) : (
          <>
            {/* Graphe mensuel */}
            <div className="px-3 pt-2 pb-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EFEAF6" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#A79EB5" }} tickLine={false} axisLine={false} interval={0} />
                  <YAxis tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)} tick={{ fontSize: 11, fill: "#A79EB5" }} tickLine={false} axisLine={false} width={32} />
                  <Tooltip
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E1DBEC", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                    labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                    formatter={(value, name) => {
                      const labels: Record<string, string> = { urssaf: "URSSAF", carpimko: "CARPIMKO" };
                      const num = typeof value === "number" ? value : Number(value ?? 0);
                      return [formatCurrency(num), labels[String(name ?? "")] ?? String(name ?? "")];
                    }}
                  />
                  <Bar dataKey="urssaf" stackId="cotis" fill="#9060B6">
                    {monthChart.map((d, i) => <Cell key={i} fillOpacity={d.estimated ? 0.4 : 1} />)}
                  </Bar>
                  <Bar dataKey="carpimko" stackId="cotis" fill="#3DB87A" radius={[3, 3, 0, 0]}>
                    {monthChart.map((d, i) => <Cell key={i} fillOpacity={d.estimated ? 0.4 : 1} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Bouton de repli du détail chiffré */}
            <button
              type="button"
              onClick={() => setDetailOpen((v) => !v)}
              className="w-full flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-medium text-ardoise-500 hover:text-ardoise-800 hover:bg-ardoise-50/60 border-t border-ardoise-100 transition-colors"
            >
              {detailOpen ? "Masquer le détail chiffré" : "Voir le détail mois par mois"}
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${detailOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
            </button>

            {/* Détail chiffré : liste verticale (lisible sur mobile, sans scroll horizontal) */}
            {detailOpen && (
              <div className="border-t border-ardoise-100">
                <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-ardoise-400 border-b border-ardoise-50">
                  <span>Mois</span>
                  <span className="text-right">URSSAF</span>
                  <span className="text-right">CARPIMKO</span>
                  <span className="text-right">Total</span>
                </div>
                {monthChart.map((m, i) => {
                  const isCurrent = year === currentYear && i === nowMonthIdx;
                  const fmt = (v: number) => (v > 0 ? `${m.estimated ? "~" : ""}${formatCurrency(v)}` : "—");
                  const est = m.estimated;
                  return (
                    <div key={i} className={`grid grid-cols-[1.2fr_1fr_1fr_1fr] px-5 py-2 text-xs border-b border-ardoise-50 last:border-0 ${isCurrent ? "bg-brand-50/40" : ""}`}>
                      <span className="font-medium text-ardoise-700 capitalize">{MONTHS_LONG[i]}</span>
                      <span className={`text-right font-mono ${est ? "text-ardoise-400 italic" : "text-ardoise-700"}`}>{fmt(m.urssaf)}</span>
                      <span className={`text-right font-mono ${est ? "text-ardoise-400 italic" : "text-ardoise-700"}`}>{fmt(m.carpimko)}</span>
                      <span className={`text-right font-mono font-semibold ${est ? "text-ardoise-400 italic" : "text-ardoise-900"}`}>{fmt(m.total)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Historique des prélèvements URSSAF + CARPIMKO sur l'année sélectionnée */}
      <TransactionsList
        title="Historique des cotisations"
        description={`Prélèvements URSSAF et CARPIMKO réellement débités en ${year}.`}
        year={year}
        categories={CONTRIBUTIONS_CATEGORIES}
        exportFilename="historique_cotisations"
      />
    </div>
  );
}

// ── Transactions History (réutilisée par Mes impôts et Mes cotisations) ──

const CONTRIBUTIONS_CATEGORIES: string[] = ["urssaf", "carpimko"];
const TAXES_CATEGORIES: string[] = ["taxes", "cfe"];

const CATEGORY_LABELS: Record<string, string> = {
  urssaf: "URSSAF",
  carpimko: "CARPIMKO",
  taxes: "Impôts (PAS / régul.)",
  cfe: "CFE",
};

function formatTransactionDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function TransactionsList({
  title,
  description,
  year,
  categories,
  exportFilename,
}: {
  title: string;
  description: string;
  year: number;
  categories: string[];
  /** Préfixe du fichier CSV (ex: "impots", "cotisations"). */
  exportFilename: string;
}) {
  const [transactions, setTransactions] = useState<CategoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setLoading(true);
    getCategoryTransactionsAction(year, categories)
      .then((rows) => {
        setTransactions(rows);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // categories is a stable list of strings; serialize to avoid extra renders if parent re-creates the array
  }, [year, categories]);

  const total = useMemo(
    () => transactions.reduce((s, t) => s + Math.abs(t.amount), 0),
    [transactions],
  );

  const handleExportCsv = useCallback(() => {
    const headers = ["Date", "Libellé", "Catégorie", "Montant"];
    const rows = transactions.map((t) => [
      t.date,
      t.cleanDescription ?? t.description,
      CATEGORY_LABELS[t.category] ?? t.category,
      Math.abs(t.amount),
    ]);
    downloadCSV(`${exportFilename}_${year}`, headers, rows);
  }, [transactions, year, exportFilename]);

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div>
          <h3 className="text-base font-semibold text-ardoise-900">{title}</h3>
          <p className="text-xs text-ardoise-400 mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && transactions.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-ardoise-400">Total {year}</p>
              <p className="text-base font-bold text-ardoise-900 font-mono">{formatCurrency(total)}</p>
            </div>
          )}
          <ExportButtons
            onCsv={handleExportCsv}
            disabled={loading || transactions.length === 0}
          />
        </div>
      </div>
      {loading ? (
        <div className="px-6 pb-6">
          <div className="h-32 bg-ardoise-100 rounded animate-pulse" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="px-6 pb-6 text-sm text-ardoise-400">
          Aucune transaction enregistrée en {year} pour les catégories concernées.
        </div>
      ) : (
        <div className="border-t border-ardoise-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ardoise-100 text-xs font-semibold text-ardoise-500">
                <th className="text-left px-6 py-3">Date</th>
                <th className="text-left px-3 py-3">Libellé</th>
                <th className="text-left px-3 py-3">Catégorie</th>
                <th className="text-right px-6 py-3">Montant</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-ardoise-50 hover:bg-ardoise-50/50 transition-colors">
                  <td className="px-6 py-3 text-ardoise-700 whitespace-nowrap font-mono">{formatTransactionDate(t.date)}</td>
                  <td className="px-3 py-3 text-ardoise-900 truncate max-w-[420px]" title={t.cleanDescription ?? t.description}>
                    {t.cleanDescription ?? t.description}
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-ardoise-100 text-ardoise-700">
                      {CATEGORY_LABELS[t.category] ?? t.category}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-ardoise-900 whitespace-nowrap font-mono">
                    {formatCurrency(Math.abs(t.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Taxes Tab ──

function TaxesTab() {
  const hp = usePractitioner();
  const { loadYearCore, loadEstimate, bustYear } = useManagementData();
  const bankConnected = !!hp?.bridgeUserUuid;
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const [situation, setSituation] = useState<"celibataire" | "marie" | "pacse">("celibataire");
  const [enfants, setEnfants] = useState(0);
  const [isSingleParent, setIsSingleParent] = useState(false);
  const [autresRevenus, setAutresRevenus] = useState(0);
  const [declaredIr, setDeclaredIr] = useState<string>("");
  const [dbLoaded, setDbLoaded] = useState(false);
  const [saveState, saveAction, saving] = useActionState(upsertFiscalSituationAction, null);

  // Après une sauvegarde fiscale réussie, invalider le cache partagé de l'année
  // pour que la synthèse (seedée au chargement) relise la situation à jour.
  useEffect(() => {
    if (saveState && "success" in saveState) bustYear(year);
  }, [saveState, year, bustYear]);

  // Monthly activity for the selected year (CA + charges)
  const [monthly, setMonthly] = useState<MonthlyActivityMonth[] | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(true);
  // Jours travaillés saisis par mois (projection) ; null = non saisi → défaut.
  const [workedDays, setWorkedDays] = useState<(number | null)[]>(Array(12).fill(null));
  // Past-year monthly used as a fallback to derive a daily rate for future-year projection
  const [pastReference, setPastReference] = useState<MonthlyActivityMonth[] | null>(null);
  // Fallback bordereaux : revenuBNC dérivé du CA des passages + cotisations estimées.
  const [isEstimated, setIsEstimated] = useState(false);

  // Load fiscal situation from DB when year changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setDbLoaded(false);
    getFiscalSituationAction(year).then((res) => {
      if (res) {
        setSituation(res.maritalStatus as "celibataire" | "marie" | "pacse");
        setEnfants(res.dependentChildren);
        setIsSingleParent(res.isSingleParent ?? false);
        setAutresRevenus(Number(res.otherIncome));
        setDeclaredIr(res.declaredIr !== null && res.declaredIr !== undefined ? String(res.declaredIr) : "");
      } else {
        setSituation("celibataire");
        setEnfants(0);
        setIsSingleParent(false);
        setAutresRevenus(0);
        setDeclaredIr("");
      }
      setDbLoaded(true);
    }).catch(() => {
      setDbLoaded(true);
    });
  }, [year]);

  // Load monthly activity + jours travaillés for the selected year.
  // En fallback (pas de banque, bordereaux présents) : on lit les passages et on
  // injecte URSSAF/CARPIMKO estimés au prorata du CA mensuel pour que le calcul
  // BNC réel reste correct (BNC = CA − charges déductibles).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setMonthlyLoading(true);
    (async () => {
      const [core, v] = await Promise.all([
        loadYearCore(year),
        getWorkedDaysAction(year),
      ]);
      const useFallback = core.isEstimated;
      setIsEstimated(useFallback);

      let months = core.months;

      // Enrichit avec URSSAF/CARPIMKO estimés en fallback, au prorata du CA
      // mensuel (calage sur le sélecteur d'année — getCotisationsEstimate est
      // year-aware).
      if (useFallback && core.totalCA > 0) {
        const est = await loadEstimate(year);
        if (est) {
          months = months.map((mm) => {
            const ratio = mm.income / core.totalCA;
            const urssaf = Math.round(est.urssafAnnuel * ratio);
            const carpimko = Math.round(est.carpimkoAnnuel * ratio);
            return { ...mm, urssaf, carpimko };
          });
        }
      }

      setMonthly(months);
      setWorkedDays(v);
      setMonthlyLoading(false);
    })().catch(() => setMonthlyLoading(false));
  }, [year, loadYearCore, loadEstimate, bankConnected]);

  // For future years with no data yet, fall back on the current year as reference for daily rate.
  // Source alignée sur effectiveCA pour rester cohérent avec le flux principal.
  useEffect(() => {
    if (year <= currentYear) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when no projection is needed
      setPastReference(null);
      return;
    }
    (async () => {
      const core = await loadYearCore(currentYear);
      setPastReference(core.months);
    })().catch(() => {});
  }, [year, currentYear, loadYearCore]);

  const { parts, partsDeReference } = useMemo(
    () => computeParts({ maritalStatus: situation, dependentChildren: enfants, isSingleParent }),
    [situation, enfants, isSingleParent],
  );

  const pasRate = hp ? parseFloat(hp.pasRate) / 100 : 0;
  const daysPerWeek = hp?.daysPerWeekWorked ?? 5;

  // Revenu BNC annuel + PAS effectif sur le BNC.
  // BNC :
  //   - Année passée : total réel des mois 1-12.
  //   - Année courante : réel YTD + projection sur le reste (taux journalier).
  //   - Année future : projection 12 mois sur la base de l'année courante.
  // PAS BNC :
  //   - Mois passés/écoulés : somme des transactions catégorisées 'taxes' (acomptes réellement prélevés).
  //   - Mois futurs : projection = bénéfice projeté × taux PAS personnalisé.
  const { revenuBNC, pasBnc, isProjected, pasYtdReel } = useMemo(() => {
    if (!hp) return { revenuBNC: 0, pasBnc: 0, isProjected: false, pasYtdReel: 0 };

    const computeBNC = (m: MonthlyActivityMonth) => {
      if (hp.taxRegime === "micro_bnc") return m.income * 0.66;
      const chargesDeductibles = m.urssaf + m.carpimko + m.chargesPro + m.retrocession + m.madelin;
      return Math.max(0, m.income - chargesDeductibles);
    };

    const now = new Date();

    const dailyRateFrom = (months: MonthlyActivityMonth[], y: number) => {
      let totalBNC = 0;
      let totalDays = 0;
      const isPastYear = y < now.getFullYear();
      const currentMonthIdx = now.getMonth();
      months.forEach((m, i) => {
        const isPast = isPastYear || (y === now.getFullYear() && i < currentMonthIdx);
        if (!isPast || m.income <= 0) return;
        const wd = countWorkingDays(y, i + 1, daysPerWeek);
        const worked = workedDays[i] ?? wd;
        if (worked > 0) {
          totalBNC += computeBNC(m);
          totalDays += worked;
        }
      });
      return totalDays > 0 ? totalBNC / totalDays : 0;
    };

    // Année passée — tout est réel
    if (year < currentYear) {
      if (!monthly) return { revenuBNC: 0, pasBnc: 0, isProjected: false, pasYtdReel: 0 };
      const totalBnc = monthly.reduce((s, m) => s + computeBNC(m), 0);
      const totalPas = monthly.reduce((s, m) => s + m.impots, 0);
      return { revenuBNC: Math.round(totalBnc), pasBnc: Math.round(totalPas), isProjected: false, pasYtdReel: Math.round(totalPas) };
    }

    // Année courante — réel YTD + projection
    if (year === currentYear) {
      if (!monthly) return { revenuBNC: 0, pasBnc: 0, isProjected: false, pasYtdReel: 0 };
      const currentMonthIdx = now.getMonth();
      const realBncYtd = monthly.slice(0, currentMonthIdx + 1).reduce((s, m) => s + computeBNC(m), 0);
      const realPasYtd = monthly.slice(0, currentMonthIdx + 1).reduce((s, m) => s + m.impots, 0);
      const daily = dailyRateFrom(monthly, year);
      let bncProjection = 0;
      if (daily > 0) {
        const totalWd = countWorkingDays(year, currentMonthIdx + 1, daysPerWeek);
        const remainingWd = countRemainingWorkingDays(year, currentMonthIdx + 1, now.getDate() + 1, daysPerWeek);
        const ratio = totalWd > 0 ? remainingWd / totalWd : 0;
        const monthWorked = workedDays[currentMonthIdx] ?? totalWd;
        const worked = Math.max(0, monthWorked * ratio);
        bncProjection += daily * worked;
        for (let i = currentMonthIdx + 1; i < 12; i++) {
          const wd = countWorkingDays(year, i + 1, daysPerWeek);
          const worked2 = workedDays[i] ?? wd;
          bncProjection += daily * worked2;
        }
      }
      const pasProjection = bncProjection * pasRate;
      const anyProjection = daily > 0 && currentMonthIdx < 11;
      return {
        revenuBNC: Math.round(realBncYtd + bncProjection),
        pasBnc: Math.round(realPasYtd + pasProjection),
        isProjected: anyProjection,
        pasYtdReel: Math.round(realPasYtd),
      };
    }

    // Année future — tout projeté
    const reference = pastReference;
    if (!reference) return { revenuBNC: 0, pasBnc: 0, isProjected: true, pasYtdReel: 0 };
    const daily = dailyRateFrom(reference, currentYear);
    if (daily <= 0) return { revenuBNC: 0, pasBnc: 0, isProjected: true, pasYtdReel: 0 };
    let totalBnc = 0;
    for (let i = 0; i < 12; i++) {
      const wd = countWorkingDays(year, i + 1, daysPerWeek);
      const worked = workedDays[i] ?? wd;
      totalBnc += daily * worked;
    }
    return {
      revenuBNC: Math.round(totalBnc),
      pasBnc: Math.round(totalBnc * pasRate),
      isProjected: true,
      pasYtdReel: 0,
    };
  }, [hp, monthly, workedDays, year, currentYear, pastReference, pasRate, daysPerWeek]);

  const revenuImposable = revenuBNC + autresRevenus;

  const ir = useMemo(
    () => computeIR({ revenuImposable, parts, partsDeReference, incomeYear: year }),
    [revenuImposable, parts, partsDeReference, year],
  );

  // PAS total estimé sur le foyer = PAS BNC effectif (transactions 'taxes' + projection)
  // + approximation PAS conjoint salarié (autresRevenus × pasRate, faute de mieux).
  const pasAutresRevenus = Math.round(autresRevenus * pasRate);
  const pasAnnuel = pasBnc + pasAutresRevenus;
  const regularisation = ir.impot - pasAnnuel;

  const bareme = useMemo(() => getBareme(year), [year]);
  const currentTranche = bareme[ir.currentTrancheIndex]!;
  const showSingleParent = situation === "celibataire" && enfants >= 1;

  const handleExportTaxesPdf = useCallback(() => {
    const situationLabels: Record<string, string> = { celibataire: "Célibataire", marie: "Marié(e)", pacse: "Pacsé(e)" };
    const headers = ["Caractéristique", "Valeur"];
    const rows: (string | number)[][] = [
      ["Situation conjugale", situationLabels[situation] ?? situation],
      ["Enfants à charge", enfants],
      ...(isSingleParent ? [["Parent isolé (case T)", "Oui"] as (string | number)[]] : []),
      ["Autres revenus du foyer", formatCurrency(autresRevenus)],
      ["Nombre de parts fiscales", parts],
      [`${hp?.taxRegime === "micro_bnc" ? "BNC après abattement 34 %" : "Bénéfice BNC estimé"}`, `${isProjected ? "~" : ""}${formatCurrency(revenuBNC)}`],
      ["Revenu imposable du foyer", `${isProjected ? "~" : ""}${formatCurrency(revenuImposable)}`],
      ["Tranche marginale d'imposition", `${currentTranche.rate} %`],
      ["Taux moyen d'imposition", `${ir.tauxMoyen} %`],
      ...(ir.plafonneQf ? [["Quotient familial", "Plafonné"] as (string | number)[]] : []),
    ];
    const declaredParsed = declaredIr.trim() !== "" ? parseFloat(declaredIr.replace(",", ".")) : NaN;
    const summary = [
      { label: `IR estimé sur ${year}`, value: formatCurrency(ir.impot) },
      { label: `Régularisation ${year}`, value: `${regularisation >= 0 ? "+" : ""}${formatCurrency(regularisation)}` },
      { label: "PAS estimé sur l'année", value: formatCurrency(pasAnnuel) },
      ...(!isNaN(declaredParsed) ? [{ label: "IR réellement déclaré", value: formatCurrency(declaredParsed) }] : []),
    ];
    downloadPDF(`imposition_${year}`, `Mon imposition estimée ${year}`, headers, rows, {
      subtitle: `Estimation basée sur le barème ${year} (loi de finances ${year + 1})`,
      summary,
      footnote: isEstimated
        ? "BNC dérivé du CA issu de vos bordereaux ; charges déductibles (URSSAF/CARPIMKO) estimées à partir du CA. Aucun PAS prélevé n'est observable sans connexion bancaire — la régularisation correspond à l'intégralité du PAS estimé."
        : undefined,
    });
  }, [situation, enfants, isSingleParent, autresRevenus, parts, hp, isProjected, revenuBNC, revenuImposable, currentTranche, ir, pasAnnuel, regularisation, year, declaredIr, isEstimated]);

  return (
    <div className="space-y-6">
    {/* Sélecteur d'année global du tab — pilote situation, imposition, transactions */}
    <div className="flex items-center justify-end gap-2">
      <ExportButtons
        onPdf={handleExportTaxesPdf}
        disabled={monthlyLoading || !dbLoaded}
      />
      <YearSelector year={year} setYear={setYear} maxYear={currentYear} />
    </div>
    {isEstimated && (
      <div className="px-4 py-1.5 text-[11px] text-ardoise-400 flex items-center gap-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <span>
          BNC et PAS estimés à partir de vos bordereaux.{" "}
          <Link href="/transactions" className="underline decoration-ardoise-300 underline-offset-2 hover:text-ardoise-600">
            Connecter ma banque
          </Link>{" "}
          pour intégrer vos prélèvements réels.
        </span>
      </div>
    )}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Ma situation fiscale */}
      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-6">
        <div className="mb-5">
          <h3 className="text-base font-semibold text-ardoise-900">Ma situation fiscale</h3>
        </div>
        <form action={saveAction} className="space-y-4">
          <input type="hidden" name="year" value={year} />
          <div>
            <label className="block text-sm text-ardoise-500 mb-1.5">Situation conjugale</label>
            <select
              name="maritalStatus"
              value={situation}
              onChange={(e) => setSituation(e.target.value as "celibataire" | "marie" | "pacse")}
              className="w-full border border-ardoise-200 bg-transparent px-3 py-2 rounded-md text-sm transition-all hover:border-ardoise-400 focus:border-violet-500 focus:outline-none appearance-none cursor-pointer"
            >
              <option value="celibataire">Célibataire</option>
              <option value="marie">Marié(e)</option>
              <option value="pacse">Pacsé(e)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-ardoise-500 mb-1.5">Nombre d&apos;enfants à charge</label>
            <input
              type="number"
              name="dependentChildren"
              min="0"
              max="20"
              value={enfants}
              onChange={(e) => setEnfants(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full border border-ardoise-200 bg-transparent px-3 py-2 rounded-md text-sm transition-all hover:border-ardoise-400 focus:border-violet-500 focus:outline-none font-mono"
            />
          </div>
          {showSingleParent && (
            <div className="flex items-start gap-2">
              <input
                id="isSingleParent"
                type="checkbox"
                name="isSingleParent"
                checked={isSingleParent}
                onChange={(e) => setIsSingleParent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-ardoise-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="isSingleParent" className="text-sm text-ardoise-700 leading-tight">
                Parent isolé (case T)
                <span className="block text-xs text-ardoise-400 mt-0.5">
                  Vous vivez seul(e) et élevez seul(e) votre/vos enfant(s). Donne droit à une demi-part supplémentaire.
                </span>
              </label>
            </div>
          )}
          <div>
            <label className="block text-sm text-ardoise-500 mb-1.5">Autres revenus BNC ou salariés du foyer en {year}</label>
            <div className="relative">
              <input
                type="number"
                name="otherIncome"
                min="0"
                step="100"
                value={autresRevenus || ""}
                onChange={(e) => setAutresRevenus(Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="0"
                className="w-full border border-ardoise-200 bg-transparent px-3 py-2 pr-8 rounded-md text-sm transition-all hover:border-ardoise-400 focus:border-violet-500 focus:outline-none font-mono"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ardoise-400">€</span>
            </div>
            <p className="mt-1 text-xs text-ardoise-400">Revenus nets imposables du conjoint ou autres activités.</p>
          </div>
          {year < currentYear && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <label className="block text-sm text-ardoise-500">IR réel de mon avis d&apos;imposition {year}</label>
                <InfoTooltip text={`Montant exact de l'impôt sur le revenu figurant sur votre avis d'imposition ${year + 1} (revenus ${year}). Optionnel : permet de comparer à l'estimation de l'app et de détecter d'éventuels crédits/réductions non pris en compte.`} />
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  name="declaredIr"
                  value={declaredIr}
                  onChange={(e) => setDeclaredIr(e.target.value)}
                  placeholder="Optionnel"
                  className="w-full border border-ardoise-200 bg-transparent px-3 py-2 pr-8 rounded-md text-sm transition-all hover:border-ardoise-400 focus:border-violet-500 focus:outline-none font-mono"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ardoise-400">€</span>
              </div>
              <p className="mt-1 text-xs text-ardoise-400">À renseigner après réception de votre avis (août {year + 1}).</p>
            </div>
          )}
          <div className="pt-2 border-t border-ardoise-100 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ardoise-500">Nombre de parts fiscales</span>
              <span className="font-semibold text-ardoise-900 font-mono">{parts}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-ardoise-500">{hp?.taxRegime === "micro_bnc" ? "BNC après abattement 34 %" : "Bénéfice BNC estimé"}</span>
                <InfoTooltip text={hp?.taxRegime === "micro_bnc"
                  ? "Régime micro-BNC : les recettes annuelles sont diminuées d'un abattement forfaitaire de 34 %."
                  : "Régime déclaration contrôlée : bénéfice = recettes encaissées - charges déductibles (URSSAF, CARPIMKO, charges pro, rétrocession, Madelin)."} />
                {isEstimated && <EstimationBadge tooltip="Bénéfice BNC dérivé du CA de vos bordereaux. En régime déclaration contrôlée, les charges déductibles (URSSAF/CARPIMKO) sont estimées à partir du CA." />}
              </div>
              <span className={`font-semibold font-mono ${isProjected || isEstimated ? "text-ardoise-500 italic" : "text-ardoise-900"}`}>
                {monthlyLoading ? "…" : `${(isProjected || isEstimated) ? "~" : ""}${formatCurrency(revenuBNC)}`}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ardoise-500">Revenu imposable du foyer</span>
              <span className={`font-semibold font-mono ${isProjected ? "text-ardoise-500 italic" : "text-ardoise-900"}`}>
                {monthlyLoading ? "…" : `${isProjected ? "~" : ""}${formatCurrency(revenuImposable)}`}
              </span>
            </div>
          </div>

          {saveState?.error && (
            <p className="bg-red-50 p-3 rounded-md text-sm text-red-600">{saveState.error}</p>
          )}
          {saveState?.success && (
            <p className="bg-menthe-50 p-3 rounded-md text-sm text-menthe-600">Situation fiscale enregistrée.</p>
          )}

          <Button
            type="submit"
            variant="cta"
            disabled={saving || !dbLoaded}
            className="flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </form>
      </div>

      {/* Mon imposition estimée */}
      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-6">
        <h3 className="text-base font-semibold text-ardoise-900 mb-5">Mon imposition estimée</h3>
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-xs text-ardoise-400">Impôt estimé sur les revenus {year}</p>
              <InfoTooltip text={`Estimation de l'impôt sur le revenu calculée avec le barème progressif applicable aux revenus ${year} (loi de finances ${year + 1}), votre situation familiale et le quotient familial${ir.plafonneQf ? " (plafonné)" : ""}.`} />
              {isEstimated && <EstimationBadge tooltip="IR calculé à partir du BNC dérivé de vos bordereaux. Connectez votre banque pour des charges déductibles réelles." />}
            </div>
            <p className="text-2xl font-bold text-ardoise-900 font-mono">{monthlyLoading ? "…" : formatCurrency(ir.impot)}</p>
            {ir.plafonneQf && (
              <p className="text-xs text-orange-600 mt-1">Quotient familial plafonné — gain limité par demi-part supplémentaire.</p>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-xs text-ardoise-400">Régularisation {year} payée en {year + 1}</p>
              <InfoTooltip text={isEstimated
                ? `Sans connexion bancaire, aucun PAS prélevé n'est observable : la régularisation correspond à l'intégralité du PAS estimé. Connectez votre banque pour retrancher les acomptes déjà débités.`
                : `Différence entre l'impôt estimé et le PAS prélevé. PAS BNC : acomptes réellement prélevés (transactions catégorisées « Impôts » : ${formatCurrency(pasYtdReel)} à date)${year >= currentYear ? ` + projection au taux ${(pasRate * 100).toFixed(1)} % pour les mois restants` : ""}. PAS conjoint : approximation au même taux. Positif = complément à payer (sept-déc ${year + 1}), négatif = remboursement (été ${year + 1}).`} />
              {isEstimated && <EstimationBadge />}
            </div>
            <p className={`text-2xl font-bold font-mono ${regularisation >= 0 ? "text-red-500" : "text-menthe-600"}`}>
              {monthlyLoading ? "…" : `${regularisation >= 0 ? "+" : ""}${formatCurrency(regularisation)}`}
            </p>
            <p className="text-xs text-ardoise-400 mt-1">
              IR estimé {formatCurrency(ir.impot)} − PAS {formatCurrency(pasAnnuel)}
              {pasYtdReel > 0 && ` (dont ${formatCurrency(pasYtdReel)} déjà prélevés)`}
              {isEstimated && " · aucun prélèvement observé"}
            </p>
          </div>

          <div className="pt-4 border-t border-ardoise-100">
            <p className="text-sm font-medium text-ardoise-900 mb-1">Tranche marginale d&apos;imposition</p>
            <p className="text-xs text-ardoise-400 mb-3">
              Vous remplissez {ir.fillPercent} % de cette tranche.
              {ir.distanceToNext > 0 && ` Dans ${formatCurrency(ir.distanceToNext)} de revenus imposables supplémentaires, vous passerez à la tranche supérieure.`}
            </p>

            {/* Tranche bar */}
            <div className="flex rounded-full overflow-hidden h-3 mb-2">
              {bareme.map((t, i) => {
                const isActive = i === ir.currentTrancheIndex;
                const isPast = i < ir.currentTrancheIndex;
                return (
                  <div
                    key={t.rate}
                    className={`relative flex-1 transition-all ${
                      isPast ? "bg-brand-600" : isActive ? "bg-brand-200" : "bg-ardoise-100"
                    }`}
                  >
                    {isActive && (
                      <div
                        className="absolute inset-y-0 left-0 bg-brand-600 rounded-r-full"
                        style={{ width: `${ir.fillPercent}%` }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex text-[10px] font-medium text-ardoise-400">
              {bareme.map((t, i) => (
                <div key={t.rate} className={`flex-1 text-center font-mono ${i === ir.currentTrancheIndex ? "text-brand-600 font-bold" : ""}`}>
                  {t.rate} %
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-ardoise-500">Taux moyen</span>
              <span className="text-sm font-bold text-ardoise-900 font-mono">{ir.tauxMoyen} %</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm text-ardoise-500">Tranche marginale</span>
              <span className="text-sm font-bold text-ardoise-900 font-mono">{currentTranche.rate} %</span>
            </div>
          </div>

          {/* Comparaison estimé vs avis d'imposition réel (uniquement si saisi pour une année passée) */}
          {year < currentYear && declaredIr.trim() !== "" && (() => {
            const declared = parseFloat(declaredIr.replace(",", "."));
            if (isNaN(declared)) return null;
            const ecart = declared - ir.impot;
            return (
              <div className="pt-4 border-t border-ardoise-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <p className="text-sm font-medium text-ardoise-900">IR réel vs estimation</p>
                  <InfoTooltip text="Un écart négatif signifie que votre avis d'imposition est inférieur à l'estimation de l'app — probablement à cause de crédits ou réductions (dons, garde d'enfant, etc.) non pris en compte." />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ardoise-500">IR déclaré</span>
                  <span className="font-semibold text-ardoise-900 font-mono">{formatCurrency(declared)}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-ardoise-500">Écart estimé / réel</span>
                  <span className={`font-semibold font-mono ${ecart >= 0 ? "text-red-500" : "text-menthe-600"}`}>
                    {ecart >= 0 ? "+" : ""}{formatCurrency(ecart)}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
    {/* Historique des prélèvements PAS + CFE sur l'année sélectionnée */}
    <TransactionsList
      title="Historique des impôts"
      description={`Prélèvements à la source, régularisations et CFE débités en ${year}.`}
      year={year}
      categories={TAXES_CATEGORIES}
      exportFilename="historique_impots"
    />
    </div>
  );
}

// ── Summary Tab ──

// Tooltip détaillé : pour la barre "Trésorerie projetée", on affiche la
// décomposition du calcul (solde + encaissements − cotisations provisionnées −
// charges) plutôt qu'un simple montant, pour que l'utilisateur comprenne d'où
// sort le chiffre.
// Défini au niveau module (pas dans le render) — reçoit les valeurs du calcul en props.
function CashTooltip({ active, payload, defaultBalance, resteAVivre, horizonLabel }: {
  active?: boolean;
  payload?: Array<{ payload: { key: string; value: number } }>;
  defaultBalance: number;
  resteAVivre: { projIncome: number; provisionCotisations: number; chargesProProjetees: number };
  horizonLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const line = (label: string, value: string, strong = false) => (
    <div className={`flex items-center justify-between gap-6 ${strong ? "font-semibold text-ardoise-900" : "text-ardoise-600"}`}>
      <span>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
  if (d.key === "reste") {
    return (
      <div className="rounded-lg border border-ardoise-200 bg-white px-3 py-2.5 text-[11px] shadow-lg space-y-1 min-w-[220px]">
        <p className="font-semibold text-ardoise-900 mb-1.5">Trésorerie projetée — fin {horizonLabel}</p>
        {line("Trésorerie actuelle", formatCurrency(defaultBalance))}
        {line("Encaissements estimés", `+ ${formatCurrency(resteAVivre.projIncome)}`)}
        {line("Cotisations provisionnées", `− ${formatCurrency(resteAVivre.provisionCotisations)}`)}
        {line("Charges pro. projetées", `− ${formatCurrency(resteAVivre.chargesProProjetees)}`)}
        <div className="h-px bg-ardoise-100 my-1.5" />
        {line("Trésorerie projetée", formatCurrency(d.value), true)}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-ardoise-200 bg-white px-3 py-2 text-[11px] shadow-lg min-w-[180px]">
      <p className="font-semibold text-ardoise-900 mb-1">Trésorerie actuelle</p>
      {line("Solde du compte par défaut", formatCurrency(d.value))}
    </div>
  );
}

// Mois agrégé pour les métriques de synthèse (sous-ensemble de MonthlyActivityMonth).
type SummaryMonth = {
  income: number;
  urssaf: number;
  carpimko: number;
  autresDepenses: number;
  chargesPro: number;
  retrocession: number;
  madelin: number;
};

type FiscalSituation = {
  maritalStatus: string;
  dependentChildren: number;
  isSingleParent?: boolean;
  otherIncome: string;
};

type SummaryMetricValues = { ca: number; ch: number; cot: number; rem: number; ir: number; rav: number };

// Calcule les 6 métriques annuelles d'une année (CA, charges pro., cotisations
// sociales, rém. avant impôt, IR, reste à vivre). Pour l'année courante, le YTD
// est annualisé (charges/rétrocessions : × 12 / mois écoulés ; CA : annualisation
// de `getCotisationsEstimate`) ; pour une année passée (monthsElapsed = 12) on
// prend les totaux réels sans extrapolation. Mêmes formules pour N et N-1 —
// c'est ce qui rend la comparaison des barres homogène.
function computeSummaryMetrics(params: {
  taxRegime: string;
  months: SummaryMonth[];
  estimate: CotisationsEstimate | null;
  fiscal: FiscalSituation | null;
  year: number;
  currentYear: number;
}): SummaryMetricValues {
  const { taxRegime, months, estimate, fiscal, year, currentYear } = params;
  const monthsElapsed = year < currentYear ? 12 : new Date().getMonth() + 1;
  const annualize = (ytd: number) => (monthsElapsed > 0 ? Math.round((ytd / monthsElapsed) * 12) : 0);

  // CA **brut** annualisé — même objet que « Estimation du C.A. » de l'onglet
  // Simulation. On n'utilise surtout pas `revenuAnnualise` : c'est le CA NET de
  // rétrocession, la bonne assiette pour les cotisations mais pas un chiffre
  // d'affaires. L'afficher ici montrait un CA amputé de la rétrocession sous le
  // libellé « Chiffre d'affaires », d'où l'écart avec l'onglet Simulation.
  const annualCA = estimate?.caBrutAnnualise ?? 0;
  const annualChargesPro = annualize(months.reduce((s, m) => s + m.chargesPro, 0));
  // Cotisations sociales : estimation annuelle ajustée OpenFisca/Carpimko.
  const annualCotisations = (estimate?.urssafAnnuel ?? 0) + (estimate?.carpimkoAnnuel ?? 0);
  // Rétrocession : UNE SEULE source. Celle du profil (`retrocessionAnnualise`,
  // déjà annualisée, et qui sert d'assiette aux cotisations) fait foi dès
  // qu'elle est renseignée ; sinon on retombe sur celle observée dans les
  // transactions. Additionner les deux déduisait deux fois la même charge.
  const annualRetrocessionObservee = annualize(months.reduce((s, m) => s + m.retrocession, 0));
  const annualRetrocessionProfil = estimate?.retrocessionAnnualise ?? 0;
  const annualRetrocession = annualRetrocessionProfil > 0
    ? annualRetrocessionProfil
    : annualRetrocessionObservee;
  const annualMadelin = annualize(months.reduce((s, m) => s + m.madelin, 0));
  // Même formule que la ligne "Rém. avant impôt" de l'onglet Mon activité :
  //   CA − (urssaf + carpimko + chargesPro + retrocession + madelin). Clamp à 0.
  const annualRemAvantImpot = Math.max(
    0,
    annualCA - annualCotisations - annualChargesPro - annualRetrocession - annualMadelin,
  );

  // IR estimé sur les revenus de l'année considérée (généré sur l'exercice, payé
  // en N+1). Sert à la ligne "Impôt sur le revenu" et au reste à vivre annuel.
  //
  // Assiette : même définition que `computeBNC` de l'onglet « Mes impôts » —
  // micro-BNC, abattement 34 % sur les recettes ; BNC réel, bénéfice = recettes
  // − charges déductibles (cotisations, charges pro., rétrocession, Madelin),
  // soit exactement `annualRemAvantImpot`. L'IR était auparavant calculé sur le
  // CA sans déduire aucune charge : surestimé, et différent du montant affiché
  // dans « Mes impôts » pour le même praticien et la même année.
  let ir = 0;
  if (annualCA > 0) {
    const revenuNet = taxRegime === "micro_bnc" ? annualCA * 0.66 : annualRemAvantImpot;
    const otherIncome = fiscal ? Number(fiscal.otherIncome) : 0;
    const revenuImposable = Math.round(revenuNet + otherIncome);
    if (revenuImposable > 0) {
      const { parts, partsDeReference } = computeParts({
        maritalStatus: (fiscal?.maritalStatus as "celibataire" | "marie" | "pacse") ?? "celibataire",
        dependentChildren: fiscal?.dependentChildren ?? 0,
        isSingleParent: fiscal?.isSingleParent ?? false,
      });
      ir = computeIR({ revenuImposable, parts, partsDeReference, incomeYear: year }).impot;
    }
  }
  const rav = Math.max(0, annualRemAvantImpot - ir);
  return { ca: annualCA, ch: annualChargesPro, cot: annualCotisations, rem: annualRemAvantImpot, ir, rav };
}

function SummaryTab() {
  const hp = usePractitioner();
  const { loadYearCore, loadEstimate, loadFiscal } = useManagementData();
  const bankConnected = !!hp?.bridgeUserUuid;
  const { accounts, transactionsLoading } = useData();
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  const [loading, setLoading] = useState(true);
  const [estimate, setEstimate] = useState<CotisationsEstimate | null>(null);
  const [prevEstimate, setPrevEstimate] = useState<CotisationsEstimate | null>(null);
  const [monthlyData, setMonthlyData] = useState<SummaryMonth[]>([]);
  const [prevMonthlyData, setPrevMonthlyData] = useState<SummaryMonth[]>([]);
  const [currentYearFiscal, setCurrentYearFiscal] = useState<FiscalSituation | null>(null);
  const [prevYearFiscal, setPrevYearFiscal] = useState<FiscalSituation | null>(null);
  // Fallback bordereaux : CA mensuel + CA N-1 issus des passages, cotisations
  // estimées via getCotisationsEstimate. La carte "Trésorerie prévisionnelle"
  // reste indisponible (besoin du solde bancaire).
  const [isEstimated, setIsEstimated] = useState(false);

  // Mois cible de la projection de trésorerie (carte "Trésorerie prévisionnelle").
  // Par défaut = fin du mois courant ; l'utilisateur peut projeter jusqu'à décembre.
  const currentMonthIdx = new Date().getMonth();
  const [targetMonth, setTargetMonth] = useState(currentMonthIdx);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setLoading(true);
    (async () => {
      // On charge l'année courante ET l'année N-1 pour la comparaison des
      // métriques annuelles (barres N vs N-1 de la colonne de droite).
      const [core, prevCore] = await Promise.all([
        loadYearCore(currentYear),
        loadYearCore(prevYear),
      ]);
      setIsEstimated(core.isEstimated);

      const [currFiscal, prevFiscal, est, prevEst] = await Promise.all([
        loadFiscal(currentYear),
        loadFiscal(prevYear),
        loadEstimate(currentYear),
        loadEstimate(prevYear),
      ]);

      const toMonths = (ms: MonthlyActivityMonth[]): SummaryMonth[] =>
        ms.map((m) => ({
          income: m.income,
          urssaf: m.urssaf,
          carpimko: m.carpimko,
          autresDepenses: m.autresDepenses,
          chargesPro: m.chargesPro,
          retrocession: m.retrocession,
          madelin: m.madelin,
        }));
      const toFiscal = (
        f: Awaited<ReturnType<typeof getFiscalSituationAction>>,
      ): FiscalSituation | null =>
        f
          ? {
              maritalStatus: f.maritalStatus,
              dependentChildren: f.dependentChildren,
              isSingleParent: (f as { isSingleParent?: boolean }).isSingleParent,
              otherIncome: f.otherIncome,
            }
          : null;

      setMonthlyData(toMonths(core.months));
      setPrevMonthlyData(toMonths(prevCore.months));
      setEstimate(est);
      setPrevEstimate(prevEst);
      setCurrentYearFiscal(toFiscal(currFiscal));
      setPrevYearFiscal(toFiscal(prevFiscal));
      setLoading(false);
    })().catch(() => setLoading(false));
  }, [currentYear, prevYear, loadYearCore, loadEstimate, loadFiscal, bankConnected]);

  // 1. Trésorerie actuelle = balance du compte par défaut
  const defaultBalance = useMemo(() => {
    if (!hp?.defaultBankAccountId) return 0;
    const acc = accounts.find((a) => a.id === hp.defaultBankAccountId);
    return acc ? parseFloat(acc.balance) : 0;
  }, [accounts, hp]);

  // 2. Reste à vivre projeté au mois cible (CA − charges, sans trésorerie).
  // Calcul mutualisé avec le dashboard et l'onglet « Reste à vivre ».
  const resteAVivre = useMemo(
    () => computeResteAVivre({
      months: monthlyData,
      estimate,
      targetMonthIdx: targetMonth,
    }),
    [estimate, monthlyData, targetMonth],
  );

  // Cette carte-ci est une PROJECTION DE TRÉSORERIE : on repart donc du solde
  // bancaire et on y ajoute le reste à vivre (= CA − charges). Elle n'est
  // affichée que banque connectée (cf. rendu conditionnel plus bas).
  const soldeProjete = defaultBalance + resteAVivre.total;

  // ── Métriques annuelles N vs N-1 ──
  // Calcul mutualisé (computeSummaryMetrics) : année courante annualisée sur le
  // YTD, année N-1 sur ses totaux réels. N-1 reste `null` tant qu'il n'y a pas de
  // CA sur l'exercice précédent → barre vide « — » plutôt qu'un trompeur « 0 € ».
  const metricsN = useMemo(
    () => computeSummaryMetrics({
      taxRegime: hp?.taxRegime ?? "bnc_reel",
      months: monthlyData,
      estimate,
      fiscal: currentYearFiscal,
      year: currentYear,
      currentYear,
    }),
    [hp, monthlyData, estimate, currentYearFiscal, currentYear],
  );

  const prevCA = useMemo(
    () => prevMonthlyData.reduce((s, m) => s + m.income, 0),
    [prevMonthlyData],
  );
  const metricsNm1 = useMemo(
    () => (prevCA > 0 && prevEstimate
      ? computeSummaryMetrics({
          taxRegime: hp?.taxRegime ?? "bnc_reel",
          months: prevMonthlyData,
          estimate: prevEstimate,
          fiscal: prevYearFiscal,
          year: prevYear,
          currentYear,
        })
      : null),
    [prevCA, prevEstimate, hp, prevMonthlyData, prevYearFiscal, prevYear, currentYear],
  );

  const metrics: {
    key: string;
    title: string;
    icon: ReactNode;
    year: number;
    value: number;
    prevYear: number;
    prevValue: number | null;
  }[] = [
    {
      key: "ca", title: "Chiffre d'affaires", year: currentYear, value: metricsN.ca, prevYear, prevValue: metricsNm1?.ca ?? null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
        </svg>
      ),
    },
    {
      key: "ch", title: "Charges pro.", year: currentYear, value: metricsN.ch, prevYear, prevValue: metricsNm1?.ch ?? null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>
        </svg>
      ),
    },
    {
      key: "cot", title: "Cotisations sociales", year: currentYear, value: metricsN.cot, prevYear, prevValue: metricsNm1?.cot ?? null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ),
    },
    {
      key: "rem", title: "Rémunération avant impôt", year: currentYear, value: metricsN.rem, prevYear, prevValue: metricsNm1?.rem ?? null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4z"/>
        </svg>
      ),
    },
    {
      key: "ir", title: "Impôt sur le revenu", year: currentYear, value: metricsN.ir, prevYear, prevValue: metricsNm1?.ir ?? null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
        </svg>
      ),
    },
    {
      // Reste à vivre annuel = CA − charges − impôts = rémunération avant impôt
      // − IR estimé sur les revenus de l'année.
      key: "rav", title: "Reste à vivre", year: currentYear, value: metricsN.rav, prevYear, prevValue: metricsNm1?.rav ?? null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>
        </svg>
      ),
    },
  ];

  // En fallback bordereaux : pas de solde bancaire réel → on ne rend aucune
  // donnée dans le chart pour ne pas afficher des bars trompeuses sous l'overlay.
  // Libellé de l'horizon de projection : "du mois courant" par défaut, sinon le
  // mois cible choisi ("de septembre 2026").
  const projTargetIdx = Math.max(currentMonthIdx, targetMonth);
  const horizonLabel = projTargetIdx === currentMonthIdx ? "du mois courant" : `de ${MONTHS_LONG[projTargetIdx]} ${currentYear}`;

  const chartData = isEstimated ? [] : [
    { key: "treso", name: "Trésorerie actuelle", value: Math.round(defaultBalance) },
    { key: "reste", name: "Trésorerie projetée", value: Math.round(soldeProjete) },
  ];

  const formatSigned = (v: number) => `${v > 0 ? "+" : ""}${formatCurrency(v)}`;
  const isLoading = loading || transactionsLoading;
  // La carte nécessite un solde bancaire réel (pas juste un bridgeUserUuid posé).
  // Sans banque connectée — ou en fallback bordereaux —, on garde la carte à
  // l'écran sous un overlay « Connecter ma banque » plutôt que de la masquer :
  // c'est le seul point d'entrée vers la connexion du compte pro depuis cette
  // page, et la faire disparaître retirait l'incitation en même temps que la
  // donnée. Le chart est vide dans ce cas (cf. `chartData`), donc rien de
  // trompeur ne transparaît sous l'overlay.
  const tresoDataAvailable = (bankConnected && !isEstimated) || isLoading;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="relative bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-6">
        <DataMissingOverlay bankConnected={tresoDataAvailable} />
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="text-base font-semibold text-ardoise-900">Trésorerie prévisionnelle</h3>
          <select
            aria-label="Mois de projection"
            value={targetMonth}
            onChange={(e) => setTargetMonth(Number(e.target.value))}
            disabled={isEstimated || isLoading || !bankConnected}
            className="border border-ardoise-200 bg-transparent pl-3 pr-8 py-1.5 rounded-md text-sm capitalize transition-all hover:border-ardoise-400 focus:border-violet-500 focus:outline-none appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {MONTHS_LONG.map((label, idx) =>
              idx >= currentMonthIdx ? (
                <option key={idx} value={idx}>
                  {label} {currentYear}
                </option>
              ) : null,
            )}
          </select>
        </div>

        {isLoading ? (
          <div className="h-64 bg-ardoise-100 rounded animate-pulse" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 24, right: 12, bottom: 40, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#847A95" }}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={20}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#A79EB5" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${(v / 1000).toFixed(1)}k`}
                  width={40}
                />
                <ReferenceLine y={0} stroke="#2E2440" strokeWidth={1.5} />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  content={<CashTooltip defaultBalance={defaultBalance} resteAVivre={resteAVivre} horizonLabel={horizonLabel} />}
                />
                <Bar dataKey="value" radius={[4, 4, 4, 4]} maxBarSize={64}>
                  <LabelList
                    dataKey="value"
                    position="top"
                    formatter={(value) => {
                      const num = typeof value === "number" ? value : Number(value ?? 0);
                      return formatSigned(num);
                    }}
                    style={{ fontSize: 11, fontWeight: 600, fill: "#2E2440" }}
                  />
                  {chartData.map((d) => (
                    <Cell key={d.key} fill={d.value >= 0 ? "#3DB87A" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-6 pt-4 border-t border-ardoise-100">
              <div className="flex items-center gap-1.5 mb-1">
                <p className="text-xs text-ardoise-400">Trésorerie projetée fin {horizonLabel}</p>
                <InfoTooltip text={`Trésorerie projetée à la fin ${horizonLabel} : solde actuel du compte par défaut, plus vos encaissements estimés, moins les échéances fiscales/sociales restantes et vos charges professionnelles projetées.`} />
              </div>
              <p className={`text-3xl font-bold font-mono ${isEstimated ? "text-ardoise-300" : soldeProjete >= 0 ? "text-ardoise-900" : "text-red-500"}`}>
                {isEstimated ? "—" : formatSigned(soldeProjete)}
              </p>
            </div>

            <p className="mt-4 text-xs text-ardoise-500 leading-relaxed">
              Trésorerie projetée à la fin {horizonLabel} en partant de votre solde actuel, en ajoutant vos encaissements estimés et en retranchant les échéances fiscales/sociales restantes ainsi que vos charges professionnelles projetées.
            </p>
            <p className="mt-2 text-xs text-ardoise-500 leading-relaxed">
              Un montant positif indique une trésorerie suffisante pour couvrir ces dépenses à venir.
            </p>
          </>
        )}
      </div>

      {/* Métriques annuelles N vs N-1 */}
      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-6">
        {isEstimated && (
          <div className="mb-3 text-[11px] text-ardoise-400 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <span>
              Estimations à partir de vos bordereaux.{" "}
              <Link href="/transactions" className="underline decoration-ardoise-300 underline-offset-2 hover:text-ardoise-600">
                Connecter ma banque
              </Link>
              .
            </span>
          </div>
        )}
        {isLoading ? (
          <div className="h-96 bg-ardoise-100 rounded animate-pulse" />
        ) : (
          <div className="divide-y divide-ardoise-100">
            {metrics.map((m, idx) => {
              const scale = Math.max(m.value, m.prevValue ?? 0);
              const pctN = scale > 0 ? Math.min(100, (m.value / scale) * 100) : 0;
              const pctNm1 = scale > 0 && m.prevValue != null ? Math.min(100, (m.prevValue / scale) * 100) : 0;
              return (
                <div key={m.key} className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 ${idx === 0 ? "pb-4" : idx === metrics.length - 1 ? "pt-4" : "py-4"}`}>
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    {/* Icon */}
                    <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                      {m.icon}
                    </div>
                    {/* Title */}
                    <p className="text-sm font-medium text-ardoise-900 flex-1 min-w-0">{m.title}</p>
                  </div>
                  {/* Years + bars stacked */}
                  <div className="flex flex-col gap-2 w-full sm:w-[55%] sm:shrink-0">
                    {/* Year N */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-ardoise-500 w-10 shrink-0 font-mono">{m.year}</span>
                      <div className="flex-1 h-1.5 bg-ardoise-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-600 rounded-full transition-all" style={{ width: `${pctN}%` }} />
                      </div>
                      <div className="w-20 text-right shrink-0 leading-tight">
                        <p className="text-[10px] text-ardoise-400 italic">Prévision</p>
                        <p className="text-[12px] font-semibold text-ardoise-900 font-mono">{formatCurrency(m.value)}</p>
                      </div>
                    </div>
                    {/* Year N-1 */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-ardoise-400 w-10 shrink-0 font-mono">{m.prevYear}</span>
                      <div className="flex-1 h-1.5 bg-ardoise-100 rounded-full overflow-hidden">
                        <div className="h-full bg-ardoise-300 rounded-full transition-all" style={{ width: `${pctNm1}%` }} />
                      </div>
                      <div className="w-20 text-right shrink-0 leading-tight">
                        <p className="text-[10px] italic">&nbsp;</p>
                        <p className="text-[12px] font-semibold text-ardoise-300 font-mono">{m.prevValue != null ? formatCurrency(m.prevValue) : "—"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Remainder Tab ──
//
// "Reste à vivre" : CA − charges projetés à 3 horizons (fin du mois, fin du
// trimestre, fin de l'année). Ajoute les encaissements estimés (moyenne
// mensuelle des mois écoulés × mois restants jusqu'à l'horizon), soustrait les
// cotisations sociales et l'impôt provisionnés au prorata, et soustrait les
// charges pro projetées (moyenne YTD × mois restants). La trésorerie n'entre
// PAS dans le calcul. Vue purement indicative — pas de prise en compte de régul
// ou dépenses ponctuelles.

function RemainderTab() {
  const hp = usePractitioner();
  const { loadYearCore, loadEstimate } = useManagementData();
  const bankConnected = !!hp?.bridgeUserUuid;
  const { transactionsLoading } = useData();
  const currentYear = new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [estimate, setEstimate] = useState<CotisationsEstimate | null>(null);
  const [monthlyData, setMonthlyData] = useState<{
    income: number;
    urssaf: number;
    carpimko: number;
    autresDepenses: number;
    chargesPro: number;
    retrocession: number;
    madelin: number;
  }[]>([]);
  const [isEstimated, setIsEstimated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setLoading(true);
    (async () => {
      const core = await loadYearCore(currentYear);
      setIsEstimated(core.isEstimated);
      const months = core.months.map((m) => ({
        income: m.income,
        urssaf: m.urssaf,
        carpimko: m.carpimko,
        autresDepenses: m.autresDepenses,
        chargesPro: m.chargesPro,
        retrocession: m.retrocession,
        madelin: m.madelin,
      }));
      const est = await loadEstimate(currentYear);
      setMonthlyData(months);
      setEstimate(est);
      setLoading(false);
    })().catch(() => setLoading(false));
  }, [currentYear, loadYearCore, loadEstimate, bankConnected]);

  type Breakdown = {
    key: string;
    label: string;
    horizonDate: string;
    projIncome: number;
    urssafDue: number;
    carpimkoDue: number;
    pasDue: number;
    projChargesPro: number;
    projRetroMadelin: number;
    totalCharges: number;
    remainder: number;
  };

  const breakdowns = useMemo<Breakdown[]>(() => {
    const currentMonthIdx = new Date().getMonth();
    const eomIdx = currentMonthIdx;
    const eoqIdx = Math.min(11, Math.floor(currentMonthIdx / 3) * 3 + 2);
    const eoyIdx = 11;

    const compute = (key: string, label: string, targetIdx: number): Breakdown => {
      const lastDay = new Date(currentYear, targetIdx + 1, 0).getDate();
      const horizonDate = `${lastDay} ${MONTHS_LONG[targetIdx]} ${currentYear}`;
      // Calcul mutualisé (accrual) — cf. computeResteAVivre.
      const b = computeResteAVivre({
        months: monthlyData,
        estimate,
        targetMonthIdx: targetIdx,
      });
      return {
        key, label, horizonDate,
        projIncome: b.projIncome,
        urssafDue: b.urssafDue, carpimkoDue: b.carpimkoDue, pasDue: b.pasDue,
        projChargesPro: b.projChargesPro, projRetroMadelin: b.projRetroMadelin,
        totalCharges: b.provisionCotisations + b.chargesProProjetees,
        remainder: b.total,
      };
    };

    const out: Breakdown[] = [];
    out.push(compute("eom", "Fin du mois", eomIdx));
    if (eoqIdx !== eomIdx) out.push(compute("eoq", "Fin du trimestre", eoqIdx));
    if (eoyIdx !== eoqIdx && eoyIdx !== eomIdx) out.push(compute("eoy", "Fin de l'année", eoyIdx));
    return out;
  }, [estimate, monthlyData, currentYear]);

  const isLoading = loading || transactionsLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-ardoise-900">Reste à vivre</h2>
        <InfoTooltip text="Chiffre d'affaires moins charges, projeté à différents horizons : vos encaissements estimés (moyenne mensuelle des mois écoulés) moins les cotisations sociales et l'impôt provisionnés au prorata (URSSAF, CARPIMKO, PAS) et une moyenne de vos charges pro. Ne tient pas compte de la trésorerie, ni des régularisations ou dépenses ponctuelles." />
      </div>

      {isEstimated && (
        <div className="text-[11px] text-ardoise-400 flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <span>
            Estimations à partir de vos bordereaux.{" "}
            <Link href="/transactions" className="underline decoration-ardoise-300 underline-offset-2 hover:text-ardoise-600">
              Connecter ma banque
            </Link>
            .
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {breakdowns.map((b) => {
          const rows: { label: string; value: number; isCredit?: boolean }[] = [
            { label: "Encaissements estimés", value: b.projIncome, isCredit: true },
            { label: "URSSAF", value: b.urssafDue },
            { label: "CARPIMKO", value: b.carpimkoDue },
            { label: "Impôt sur le revenu (PAS)", value: b.pasDue },
            { label: "Charges pro.", value: b.projChargesPro },
            { label: "Rétrocession + Madelin", value: b.projRetroMadelin },
          ].filter((r) => Math.abs(r.value) > 0.5);
          return (
            <div key={b.key} className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-5">
              <div className="mb-4">
                <p className="text-sm font-semibold text-ardoise-900">{b.label}</p>
                <p className="text-[11px] text-ardoise-400">au {b.horizonDate}</p>
              </div>
              {isLoading ? (
                <div className="h-48 bg-ardoise-100 rounded animate-pulse" />
              ) : (
                <>
                  {rows.length === 0 ? (
                    <p className="py-4 text-xs text-ardoise-400 italic">Aucune charge ni encaissement projeté sur la période.</p>
                  ) : (
                    <div className="py-3 space-y-1.5">
                      {rows.map((r) => (
                        <div key={r.label} className="flex items-baseline justify-between text-xs">
                          <span className="text-ardoise-600">{r.label}</span>
                          <span className={`tabular-nums font-mono ${r.isCredit ? "text-menthe-600" : "text-ardoise-700"}`}>
                            {r.isCredit ? "+" : "−"}{formatCurrency(r.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pt-3 border-t border-ardoise-100">
                    <p className="text-[11px] text-ardoise-400 mb-0.5">Reste à vivre estimé</p>
                    <p className={`text-2xl font-bold tabular-nums font-mono ${b.remainder >= 0 ? "text-ardoise-900" : "text-alerte-600"}`}>
                      {formatCurrency(b.remainder)}
                    </p>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-ardoise-400 leading-relaxed">
        Estimation indicative. Encaissements et charges pro. extrapolés à partir de la moyenne mensuelle des mois écoulés ; cotisations sociales et impôts provisionnés au prorata des encaissements projetés (taux effectif issu de votre estimation annualisée). Ne tient pas compte d&apos;éventuelles régularisations URSSAF/CARPIMKO ni de dépenses ponctuelles.
      </p>
    </div>
  );
}

// ── Simulation Tab ──

function SimulationTab() {
  const hp = usePractitioner();
  const { loadYearCore, loadEstimate } = useManagementData();
  const bankConnected = !!hp?.bridgeUserUuid;
  const currentYear = new Date().getFullYear();
  const chartRef = useRef<HTMLDivElement>(null);

  const [baselineCA, setBaselineCA] = useState(0);
  const [baseline, setBaseline] = useState<SimulationResult | null>(null);
  const [simulatedCA, setSimulatedCA] = useState(0);
  const [simulated, setSimulated] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [simLoading, setSimLoading] = useState(false);
  // Fallback bordereaux : la baseline est issue des passages, pas des transactions
  // bancaires. Sert à signaler la provenance de la simulation.
  const [isEstimated, setIsEstimated] = useState(false);
  // Charges pro réelles YTD (pour extrapoler le reste à vivre) + situation
  // fiscale de l'année (pour l'IR au barème).
  const [monthlyCharges, setMonthlyCharges] = useState<{ chargesPro: number; retrocession: number; madelin: number }[]>([]);
  const [currentYearFiscal, setCurrentYearFiscal] = useState<{
    maritalStatus: string; dependentChildren: number; isSingleParent?: boolean; otherIncome: string;
  } | null>(null);

  // Baseline = CA annualisé courant simulé via la même fonction que la valeur
  // "Simulé". Évite la confusion N-2/forfaitaire — comparaison apples-to-apples.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with loading flag
    setLoading(true);
    (async () => {
      const core = await loadYearCore(currentYear);
      setIsEstimated(core.isEstimated);
      setMonthlyCharges(core.months.map((m) => ({ chargesPro: m.chargesPro, retrocession: m.retrocession, madelin: m.madelin })));
      const [est, currFiscal] = await Promise.all([
        loadEstimate(currentYear),
        getFiscalSituationAction(currentYear),
      ]);
      if (currFiscal) {
        setCurrentYearFiscal({
          maritalStatus: currFiscal.maritalStatus,
          dependentChildren: currFiscal.dependentChildren,
          isSingleParent: (currFiscal as { isSingleParent?: boolean }).isSingleParent,
          otherIncome: currFiscal.otherIncome,
        });
      }
      const annualCA = est?.revenuAnnualise ?? 0;
      const baseSim = annualCA > 0 ? await simulateCotisations(annualCA) : null;
      setBaselineCA(annualCA);
      setBaseline(baseSim);
      setSimulatedCA(annualCA);
      setSimulated(baseSim);
      setLoading(false);
    })().catch(() => setLoading(false));
  }, [currentYear, loadYearCore, loadEstimate, bankConnected]);

  // Recalcul simulé (debounced sur 300 ms)
  useEffect(() => {
    if (simulatedCA <= 0) return;
    if (simulatedCA === baselineCA && baseline) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- évite un appel OpenFisca quand le slider revient sur le CA actuel
      setSimulated(baseline);
      return;
    }
    setSimLoading(true);
    const handle = setTimeout(() => {
      simulateCotisations(simulatedCA)
        .then((res) => { if (res) setSimulated(res); })
        .catch(() => {})
        .finally(() => setSimLoading(false));
    }, 300);
    return () => { clearTimeout(handle); setSimLoading(false); };
  }, [simulatedCA, baselineCA, baseline]);

  const sliderMax = useMemo(() => Math.max(150_000, Math.round(baselineCA * 1.5 / 10_000) * 10_000), [baselineCA]);

  const chartData = useMemo(() => {
    if (!baseline || !simulated) return [];
    return [
      { name: "URSSAF", actuel: baseline.urssafAnnuel, simule: simulated.urssafAnnuel },
      { name: "CARPIMKO", actuel: baseline.carpimkoAnnuel, simule: simulated.carpimkoAnnuel },
      { name: "PAS", actuel: baseline.pasAnnuel, simule: simulated.pasAnnuel },
      { name: "Solde", actuel: baseline.remunerationNette, simule: simulated.remunerationNette },
    ];
  }, [baseline, simulated]);

  const handleExportCsv = useCallback(() => {
    if (!baseline || !simulated) return;
    const headers = ["Catégorie", "Actuel (€)", "Simulé (€)", "Différence (€)"];
    const rows: (string | number)[][] = [
      ["URSSAF", baseline.urssafAnnuel, simulated.urssafAnnuel, simulated.urssafAnnuel - baseline.urssafAnnuel],
      ["CARPIMKO", baseline.carpimkoAnnuel, simulated.carpimkoAnnuel, simulated.carpimkoAnnuel - baseline.carpimkoAnnuel],
      ["PAS (impôt sur le revenu)", baseline.pasAnnuel, simulated.pasAnnuel, simulated.pasAnnuel - baseline.pasAnnuel],
      ["Total cotisations + impôt", baseline.totalCotisations, simulated.totalCotisations, simulated.totalCotisations - baseline.totalCotisations],
      ["Solde avant charges pro", baseline.remunerationNette, simulated.remunerationNette, simulated.remunerationNette - baseline.remunerationNette],
      ["CA annuel", baseline.revenuAnnuel, simulated.revenuAnnuel, simulated.revenuAnnuel - baseline.revenuAnnuel],
    ];
    downloadCSV(`simulation_cotisations_${currentYear}`, headers, rows);
  }, [baseline, simulated, currentYear]);

  const handleExportPdf = useCallback(async () => {
    if (!baseline || !simulated) return;
    const fmt = (n: number) => formatCurrency(n);
    const fmtSigned = (n: number) => `${n > 0 ? "+" : ""}${formatCurrency(n)}`;
    const headers = ["Catégorie", "Actuel", "Simulé", "Différence"];
    const rows: (string | number)[][] = [
      ["URSSAF", fmt(baseline.urssafAnnuel), fmt(simulated.urssafAnnuel), fmtSigned(simulated.urssafAnnuel - baseline.urssafAnnuel)],
      ["CARPIMKO", fmt(baseline.carpimkoAnnuel), fmt(simulated.carpimkoAnnuel), fmtSigned(simulated.carpimkoAnnuel - baseline.carpimkoAnnuel)],
      ["PAS (impôt sur le revenu)", fmt(baseline.pasAnnuel), fmt(simulated.pasAnnuel), fmtSigned(simulated.pasAnnuel - baseline.pasAnnuel)],
      ["Total cotisations + impôt", fmt(baseline.totalCotisations), fmt(simulated.totalCotisations), fmtSigned(simulated.totalCotisations - baseline.totalCotisations)],
      ["Solde avant charges pro", fmt(baseline.remunerationNette), fmt(simulated.remunerationNette), fmtSigned(simulated.remunerationNette - baseline.remunerationNette)],
    ];
    const chartImage = (await getChartImage(chartRef.current)) ?? undefined;
    downloadPDF(`simulation_cotisations_${currentYear}`, `Simulation de cotisations ${currentYear}`, headers, rows, {
      subtitle: `CA actuel ${formatCurrency(baselineCA)} → CA simulé ${formatCurrency(simulatedCA)}`,
      chartImage,
      summary: [
        { label: "CA simulé", value: formatCurrency(simulatedCA) },
        { label: "Total à régler", value: formatCurrency(simulated.totalCotisations) },
        { label: "Solde avant charges pro", value: formatCurrency(simulated.remunerationNette) },
      ],
      footnote: isEstimated
        ? "Baseline calculée à partir du chiffre d'affaires issu de vos bordereaux. Connectez votre banque pour caler la simulation sur vos encaissements réels."
        : undefined,
    });
  }, [baseline, simulated, baselineCA, simulatedCA, currentYear, isEstimated]);

  const diffPct = baselineCA > 0 && simulatedCA !== baselineCA
    ? Math.round((simulatedCA - baselineCA) / baselineCA * 100)
    : 0;

  const cards: { label: string; before: number; after: number; isReward?: boolean }[] = [
    { label: "URSSAF", before: baseline?.urssafAnnuel ?? 0, after: simulated?.urssafAnnuel ?? 0 },
    { label: "CARPIMKO", before: baseline?.carpimkoAnnuel ?? 0, after: simulated?.carpimkoAnnuel ?? 0 },
    { label: "PAS (impôt)", before: baseline?.pasAnnuel ?? 0, after: simulated?.pasAnnuel ?? 0 },
    { label: "Total à régler", before: baseline?.totalCotisations ?? 0, after: simulated?.totalCotisations ?? 0 },
    { label: "Solde avant charges pro", before: baseline?.remunerationNette ?? 0, after: simulated?.remunerationNette ?? 0, isReward: true },
  ];

  // ── Estimation du reste à vivre ──
  // reste à vivre = CA − URSSAF − CARPIMKO − IR (barème) − charges pro.
  // Charges pro : fixes (loyer/matériel/Madelin) extrapolées de l'activité réelle
  // et tenues constantes ; rétrocession proratisée au CA (elle suit l'activité).
  // Mêmes briques que le "Reste à vivre" annuel de l'onglet Synthèse → cohérent.
  const monthsElapsed = new Date().getMonth() + 1;
  const annualize = (ytd: number) => (monthsElapsed > 0 ? Math.round((ytd / monthsElapsed) * 12) : 0);
  const chargesFixesAnnuelles = annualize(monthlyCharges.reduce((s, m) => s + m.chargesPro + m.madelin, 0));
  const retroAnnuelBaseline = annualize(monthlyCharges.reduce((s, m) => s + m.retrocession, 0));

  const irForRevenu = (revenuAnnuel: number): number => {
    if (!hp || revenuAnnuel <= 0) return 0;
    const revenuNet = hp.taxRegime === "micro_bnc" ? revenuAnnuel * 0.66 : revenuAnnuel;
    const otherIncome = currentYearFiscal ? Number(currentYearFiscal.otherIncome) : 0;
    const revenuImposable = Math.round(revenuNet + otherIncome);
    if (revenuImposable <= 0) return 0;
    const { parts, partsDeReference } = computeParts({
      maritalStatus: (currentYearFiscal?.maritalStatus as "celibataire" | "marie" | "pacse") ?? "celibataire",
      dependentChildren: currentYearFiscal?.dependentChildren ?? 0,
      isSingleParent: currentYearFiscal?.isSingleParent ?? false,
    });
    return computeIR({ revenuImposable, parts, partsDeReference, incomeYear: currentYear }).impot;
  };

  // Détail (annuel) pour un CA + sa simulation de cotisations donnés.
  const resteAVivreDetail = (ca: number, sim: SimulationResult | null) => {
    const ir = irForRevenu(ca);
    const retro = baselineCA > 0 ? Math.round(retroAnnuelBaseline * (ca / baselineCA)) : retroAnnuelBaseline;
    const chargesPro = chargesFixesAnnuelles + retro;
    const soldeAvantCharges = Math.max(0, ca - (sim?.urssafAnnuel ?? 0) - (sim?.carpimkoAnnuel ?? 0) - ir);
    const reste = Math.max(0, soldeAvantCharges - chargesPro);
    return { ca, urssaf: sim?.urssafAnnuel ?? 0, carpimko: sim?.carpimkoAnnuel ?? 0, ir, chargesPro, soldeAvantCharges, reste };
  };
  const ravBaseline = resteAVivreDetail(baselineCA, baseline);
  const ravSimulated = resteAVivreDetail(simulatedCA, simulated);
  // Sans banque : charges pro inconnues → on affiche le solde avant charges.
  const ravValue = isEstimated ? ravSimulated.soldeAvantCharges : ravSimulated.reste;
  const ravBefore = isEstimated ? ravBaseline.soldeAvantCharges : ravBaseline.reste;
  const ravDiff = ravValue - ravBefore;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* ── Section 1 : Estimation du C.A. ── */}
      <CAForecastSection
        onApply={(ca) => setSimulatedCA(Math.round(ca / 1000) * 1000)}
        appliedCA={simulatedCA}
      />

      {/* ── Section 2 : Estimation du reste à régler ── */}
      <div className="space-y-3">
      {isEstimated && (
        <div className="text-[11px] text-ardoise-400 flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <span>
            CA actuel calculé à partir de vos bordereaux.{" "}
            <Link href="/transactions" className="underline decoration-ardoise-300 underline-offset-2 hover:text-ardoise-600">
              Connecter ma banque
            </Link>{" "}
            pour caler la simulation sur vos encaissements réels.
          </span>
        </div>
      )}

      {/* Slider compact */}
      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-4 space-y-3">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-baseline gap-3 flex-wrap">
            <p className="text-2xl font-bold text-ardoise-900 font-mono">{formatCurrency(simulatedCA)}</p>
            {baselineCA > 0 && simulatedCA !== baselineCA && (
              <p className={`text-xs font-medium ${simulatedCA > baselineCA ? "text-menthe-600" : "text-alerte-600"}`}>
                {simulatedCA > baselineCA ? "+" : ""}{diffPct} % vs actuel ({formatCurrency(baselineCA)})
              </p>
            )}
            {baselineCA > 0 && simulatedCA === baselineCA && (
              <p className="text-xs text-ardoise-500">CA actuel projeté</p>
            )}
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={1000}
          value={simulatedCA}
          onChange={(e) => setSimulatedCA(Number(e.target.value))}
          disabled={baselineCA <= 0}
          className="w-full accent-brand-600 disabled:opacity-30"
        />
      </div>

      {/* Carte unique : titre + tableau/graphe côte à côte, puis reste à vivre en dessous */}
      <div className="space-y-3">
        <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-4 space-y-3">
          {/* Header dans la carte */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-ardoise-900">Estimation du reste à régler</h3>
              <InfoTooltip text="Calcul via OpenFisca (régime PAMC IDEL) + barème CARPIMKO. À titre indicatif : en pratique, l'URSSAF est calculée sur le revenu N-2 ; cette simulation suppose que le revenu indiqué est celui de l'année en cours." />
            </div>
            <ExportButtons onCsv={handleExportCsv} onPdf={handleExportPdf} disabled={!baseline || !simulated} />
          </div>
          {/* Tableau + graphe côte à côte */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
          <div className="divide-y divide-ardoise-100 flex flex-col rounded-[12px] border border-ardoise-100">
          {cards.map((c) => {
            const diff = c.after - c.before;
            const isUp = diff > 0;
            const isGood = c.isReward ? isUp : !isUp;
            return (
              <div key={c.label} className="flex-1 flex items-center justify-between gap-3 px-4 py-2.5">
                <p className="text-xs uppercase tracking-wide text-ardoise-500">{c.label}</p>
                <div className="flex items-baseline gap-2 text-right">
                  <p className="text-sm font-bold text-ardoise-900 font-mono">{formatCurrency(c.after)}</p>
                  {Math.abs(diff) >= 1 ? (
                    <p className={`text-xs font-medium tabular-nums font-mono ${isGood ? "text-menthe-600" : "text-alerte-600"}`}>
                      {diff > 0 ? "+" : ""}{formatCurrency(diff)}
                    </p>
                  ) : (
                    <p className="text-xs text-ardoise-400">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

          <div ref={chartRef} className="w-full h-60 rounded-[12px] border border-ardoise-100 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E1DBEC" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${Math.round(v / 1000)} k`} tick={{ fontSize: 11 }} width={36} />
                <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="actuel" name="Actuel" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="simule" name="Simulé" fill="#9060B6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        </div>

        {/* Estimation du reste à vivre */}
        <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <h4 className="text-sm font-bold text-ardoise-900">Estimation du reste à vivre</h4>
            <InfoTooltip text="Ce qu'il vous reste pour vivre une fois tout payé : CA − cotisations (URSSAF + CARPIMKO) − impôt sur le revenu (barème) − charges professionnelles. Charges fixes extrapolées de votre activité réelle et tenues constantes ; rétrocession proratisée au CA. L'impôt retranché est le vrai IR au barème (parts, quotient familial), pas le PAS ci-dessus qui n'est qu'un acompte prélevé à la source." />
          </div>

          <div className="flex items-end justify-between gap-4 flex-wrap mb-3">
            <div>
              <p className="text-xs text-ardoise-400 mb-0.5">{isEstimated ? "Solde avant charges pro (annuel)" : "Reste à vivre (annuel)"}</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className={`text-3xl font-bold font-mono ${ravValue >= 0 ? "text-ardoise-900" : "text-alerte-600"}`}>{formatCurrency(ravValue)}</p>
                {Math.abs(ravDiff) >= 1 && (
                  <p className={`text-xs font-medium font-mono ${ravDiff > 0 ? "text-menthe-600" : "text-alerte-600"}`}>
                    {ravDiff > 0 ? "+" : ""}{formatCurrency(ravDiff)} vs actuel
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-ardoise-400 mb-0.5">soit /mois</p>
              <p className="text-lg font-bold font-mono text-ardoise-700">{formatCurrency(Math.round(ravValue / 12))}</p>
            </div>
          </div>

          <div className="border-t border-ardoise-100 pt-3 space-y-1 text-[11px]">
            {[
              { label: "CA simulé", value: ravSimulated.ca, sign: "" },
              { label: "URSSAF", value: ravSimulated.urssaf, sign: "−" },
              { label: "CARPIMKO", value: ravSimulated.carpimko, sign: "−" },
              { label: "Impôt sur le revenu (barème)", value: ravSimulated.ir, sign: "−" },
              ...(isEstimated ? [] : [{ label: "Charges pro. estimées", value: ravSimulated.chargesPro, sign: "−" }]),
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-ardoise-500">{r.label}</span>
                <span className="font-mono tabular-nums text-ardoise-700">{r.sign}{formatCurrency(r.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-ardoise-100 font-semibold text-ardoise-900">
              <span>{isEstimated ? "Solde avant charges pro" : "Reste à vivre"}</span>
              <span className="font-mono tabular-nums">{formatCurrency(ravValue)}</span>
            </div>
          </div>

          <p className="mt-2 text-[11px] text-ardoise-400 leading-relaxed">
            Simulation en régime stable (cotisations calculées sur le CA saisi). Pour votre situation réelle de l&apos;année — base forfaitaire début d&apos;activité ou revenu N-2 —, référez-vous à l&apos;onglet{" "}
            <span className="font-medium text-ardoise-500">Ma synthèse</span>.
          </p>

          {isEstimated && (
            <p className="mt-2 text-[11px] text-ardoise-400">
              Charges pro. non estimées (banque non connectée) —{" "}
              <Link href="/transactions" className="underline decoration-ardoise-300 underline-offset-2 hover:text-ardoise-600">connectez votre banque</Link>{" "}
              pour un reste à vivre complet.
            </p>
          )}
        </div>
      </div>

      {(loading || (baseline === null && !loading)) && (
        <p className="text-xs text-ardoise-500 text-center">
          {loading ? "Chargement…" : "Pas encore de CA encaissé cette année — aucune base de comparaison."}
        </p>
      )}
      {simLoading && <p className="text-sm text-ardoise-400 text-center">Recalcul…</p>}
      {hp?.taxRegime === "micro_bnc" && (
        <p className="text-xs text-ardoise-500 text-center">
          Régime micro-BNC : abattement forfaitaire de 34 % appliqué automatiquement sur le CA pour le calcul des cotisations.
        </p>
      )}
      </div>
    </div>
  );
}

// ── Prévision de C.A. ──

// Outils chat qui modifient le scénario → on rafraîchit le graphe quand l'un
// d'eux est exécuté depuis l'encart IA.
const MUTATING_FORECAST_TOOLS = new Set([
  "set_availability",
  "set_days_per_week",
  "add_ca_adjustment",
  "clear_ca_adjustments",
  "estimate_month_from_acts",
]);

type AiMessage = { role: "user" | "assistant"; content: string };

const CONFIDENCE_LABEL: Record<"low" | "medium" | "high", { text: string; cls: string }> = {
  high: { text: "Fiabilité élevée", cls: "bg-menthe-100 text-menthe-700" },
  medium: { text: "Fiabilité moyenne", cls: "bg-ardoise-100 text-ardoise-700" },
  low: { text: "Fiabilité faible", cls: "bg-alerte-100 text-alerte-700" },
};

function CAForecastSection({
  onApply,
  appliedCA,
}: {
  onApply: (ca: number) => void;
  appliedCA: number;
}) {
  const { dataVersion } = useAssistant();
  const [data, setData] = useState<CAForecastResult | null>(null);
  const [loading, setLoading] = useState(true);

  // Encart IA — vraie conversation (avec mémoire), pas un one-shot.
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [analysisMode, setAnalysisMode] = useState<"manuel" | "ia">("manuel");
  // Temporaire : on ne montre que le mode Manuel. Repasser à true pour réafficher le switch IA.
  const showAnalysisSwitch = false;

  // Saisie manuelle d'actes prévus (mode « Manuel »).
  const [actOptions, setActOptions] = useState<{ mine: ActOption[]; catalog: ActOption[] } | null>(null);
  const [manualMonth, setManualMonth] = useState<number>(new Date().getMonth() + 1);
  const [manualLines, setManualLines] = useState<{ key: string; count: number; unitAmount: number }[]>([]);
  const [manualPersist, setManualPersist] = useState<"add" | "replace">("add");
  const [manualSaving, setManualSaving] = useState(false);
  const [manualFeedback, setManualFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const [clearingScenario, setClearingScenario] = useState(false);

  // Charge les options d'actes à la première ouverture du mode Manuel.
  useEffect(() => {
    if (analysisMode === "manuel" && actOptions === null) {
      getManualActOptionsAction().then(setActOptions).catch(() => setActOptions({ mine: [], catalog: [] }));
    }
  }, [analysisMode, actOptions]);

  // Charge les actes déjà enregistrés pour le mois sélectionné (par mois).
  useEffect(() => {
    if (analysisMode !== "manuel") return;
    let cancelled = false;
    getPlannedActsAction(manualMonth)
      .then((saved) => {
        if (cancelled) return;
        setManualLines(saved.lines);
        setManualPersist(saved.mode);
        setManualFeedback(null);
      })
      .catch(() => {
        if (cancelled) return;
        setManualLines([]);
      });
    return () => { cancelled = true; };
  }, [analysisMode, manualMonth]);

  const allOptions = actOptions ? [...actOptions.mine, ...actOptions.catalog] : [];
  const optionByKey = (key: string) => allOptions.find((o) => o.key === key) ?? null;
  const manualTotal = manualLines.reduce((s, l) => s + l.count * l.unitAmount, 0);

  const addManualLine = () => {
    const first = allOptions[0];
    if (!first) return;
    setManualLines((prev) => [...prev, { key: first.key, count: 1, unitAmount: first.unitPrice }]);
    setManualFeedback(null);
  };

  // Enregistre la liste passée (source de vérité explicite : on ne dépend pas de
  // l'état async) et rafraîchit la prévision. Une liste vide nettoie le mois.
  const persistManualLines = async (lines: { key: string; count: number; unitAmount: number }[]) => {
    const valid = lines.filter((l) => l.count > 0);
    setManualSaving(true);
    setManualFeedback(null);
    try {
      const res = await saveManualPlannedActsAction(valid, manualMonth, manualPersist);
      if ("error" in res) {
        setManualFeedback({ text: res.error, ok: false });
      } else {
        setManualFeedback({
          text: valid.length === 0
            ? `Actes de ${MONTHS_LONG[manualMonth - 1]} retirés de la simulation.`
            : manualPersist === "replace"
              ? `${MONTHS_LONG[manualMonth - 1]} fixé à ${formatCurrency(res.total)}. La prévision s'aligne.`
              : `${formatCurrency(res.total)} ajoutés à ${MONTHS_LONG[manualMonth - 1]}. La prévision est mise à jour.`,
          ok: true,
        });
        await refetch();
      }
    } finally {
      setManualSaving(false);
    }
  };

  const applyManualActs = () => persistManualLines(manualLines);

  // Suppression d'une ligne → on répercute tout de suite sur le graphe.
  const removeManualLine = (idx: number) => {
    const next = manualLines.filter((_, i) => i !== idx);
    setManualLines(next);
    void persistManualLines(next);
  };

  // Efface tout le scénario de l'année (leviers + congés + actes) → retour à la base.
  const clearScenario = async () => {
    setClearingScenario(true);
    try {
      await clearScenarioAction();
      setManualLines([]);
      setManualFeedback(null);
      await refetch();
    } finally {
      setClearingScenario(false);
    }
  };

  const refetch = useCallback(() => {
    setLoading(true);
    return getCAForecastAction()
      .then((res) => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  // Recharge au montage ET quand l'assistant global a modifié le scénario.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCAForecastAction()
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dataVersion]);

  const forecast = data?.forecast ?? null;
  const baseForecast = data?.baseForecast ?? null;
  const hasScenario = data?.hasScenario ?? false;
  const monthsElapsed = data?.monthsElapsed ?? 0;
  const scenarioDelta = hasScenario && forecast && baseForecast
    ? forecast.annualProbable - baseForecast.annualProbable
    : 0;

  // Graphe mensuel : réalisé (mois révolus) vs projeté (mois à venir).
  const monthlyChart = useMemo(() => {
    if (!forecast) return [];
    return forecast.monthly.map((v, i) => ({
      name: MONTH_LABELS[i],
      ca: v,
      projete: i >= monthsElapsed,
    }));
  }, [forecast, monthsElapsed]);

  // Met à jour le contenu du dernier message (l'assistant en cours de stream).
  const setLastAssistant = useCallback((updater: (prev: string) => string) => {
    setAiMessages((prev) => prev.map((m, i) =>
      i === prev.length - 1 ? { ...m, content: updater(m.content) } : m,
    ));
  }, []);

  // Conversation en streaming (réutilise /api/chat : forecast_ca + outils scénario).
  // Envoie TOUT l'historique → Nova peut enchaîner (confirmations, suites).
  const askAI = useCallback(async (content: string) => {
    if (aiLoading) return;
    setAiLoading(true);
    const history: AiMessage[] = [...aiMessages, { role: "user", content }];
    setAiMessages([...history, { role: "assistant", content: "" }]);
    let usedMutating = false;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!response.ok || !response.body) {
        setLastAssistant(() => "Impossible de récupérer la réponse pour le moment.");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload);
            if (Array.isArray(parsed.tools) && parsed.tools.some((t: string) => MUTATING_FORECAST_TOOLS.has(t))) {
              usedMutating = true;
            }
            if (parsed.content) setLastAssistant((prev) => prev + parsed.content);
          } catch {
            // ignore
          }
        }
      }
    } catch {
      setLastAssistant(() => "Une erreur est survenue. Réessayez.");
    } finally {
      setAiLoading(false);
      // Un outil a modifié le scénario → le graphe se met à jour.
      if (usedMutating) refetch();
    }
  }, [aiLoading, aiMessages, setLastAssistant, refetch]);

  if (loading) {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-4">
        <p className="text-sm text-ardoise-400 text-center">Chargement de la prévision…</p>
      </div>
    );
  }

  // Pas assez de données : message clair, pas de faux chiffre.
  if (!forecast || forecast.basis === "insufficient") {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-4 space-y-1">
        <h3 className="text-sm font-bold text-ardoise-900">Estimation du C.A.</h3>
        <p className="text-xs text-ardoise-500">
          Historique insuffisant pour une prévision fiable. Il faut au moins une douzaine de mois
          d&apos;activité (encaissements bancaires ou bordereaux payés) pour projeter votre chiffre d&apos;affaires.
        </p>
      </div>
    );
  }

  const conf = CONFIDENCE_LABEL[forecast.confidence];
  const growth = forecast.trendGrowthRate;
  const applied = Math.abs(appliedCA - forecast.annualProbable) < 600;

  return (
    <div className="space-y-3">
      {/* Header au-dessus de la section */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-ardoise-900">Estimation du C.A. {forecast.targetYear}</h3>
          <InfoTooltip position="bottom" text="Estimation calculée à partir de la tendance de vos années précédentes, de la saisonnalité de votre activité et de votre chiffre d'affaires déjà réalisé cette année. Indicatif." />
        </div>
        <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${conf.cls}`}>{conf.text}</span>
      </div>

      <div className="bg-white/70 backdrop-blur-xl border border-ardoise-200/70 rounded-[14px] shadow-1 p-4 space-y-4">
      {/* Cartes fourchette */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-[12px] bg-ardoise-50 border border-ardoise-100 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-ardoise-500">Basse</p>
          <p className="text-base font-bold text-ardoise-700 font-mono">{formatCurrency(forecast.annualLow)}</p>
        </div>
        <div className="rounded-[12px] bg-brand-50 border border-brand-200 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-brand-600">Probable</p>
          <p className="text-lg font-bold text-brand-700 font-mono">{formatCurrency(forecast.annualProbable)}</p>
        </div>
        <div className="rounded-[12px] bg-ardoise-50 border border-ardoise-100 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-ardoise-500">Haute</p>
          <p className="text-base font-bold text-ardoise-700 font-mono">{formatCurrency(forecast.annualHigh)}</p>
        </div>
      </div>

      {growth != null && (
        <p className="text-xs text-ardoise-600">
          Évolution vs dernière année complète :{" "}
          <span className={`font-medium ${growth >= 0 ? "text-menthe-600" : "text-alerte-600"}`}>
            {growth >= 0 ? "+" : ""}{(growth * 100).toFixed(1)} %
          </span>
        </p>
      )}

      {hasScenario && baseForecast && (
        <div className="rounded-[12px] bg-brand-50/70 border border-brand-200 px-3 py-2 text-xs text-ardoise-700 flex items-center gap-x-2 gap-y-1 flex-wrap">
          <span className="font-semibold text-brand-700">Prévision ajustée</span>
          <span className="text-ardoise-500">
            tient compte de vos saisies (actes prévus, congés, leviers) — sans elles : {formatCurrency(baseForecast.annualProbable)}
          </span>
          <span className={`font-medium ${scenarioDelta >= 0 ? "text-menthe-600" : "text-alerte-600"}`}>
            (soit {scenarioDelta >= 0 ? "+" : ""}{formatCurrency(scenarioDelta)})
          </span>
          <button
            type="button"
            onClick={clearScenario}
            disabled={clearingScenario}
            title="Effacer vos saisies et revenir à la prévision de base"
            aria-label="Effacer le scénario"
            className="ml-auto text-brand-400 hover:text-alerte-500 transition-colors shrink-0 disabled:opacity-40"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      )}

      {/* Graphe mensuel réalisé vs projeté */}
      <div className="w-full h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E1DBEC" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
            <YAxis tickFormatter={(v) => `${Math.round(v / 1000)} k`} tick={{ fontSize: 11 }} width={36} />
            <Tooltip
              formatter={(v, _n, item) => [formatCurrency(Number(v ?? 0)), item?.payload?.projete ? "Projeté" : "Réalisé"]}
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
            />
            <Bar dataKey="ca" radius={[4, 4, 0, 0]}>
              {monthlyChart.map((d, i) => (
                <Cell key={i} fill={d.projete ? "#C4A3DE" : "#9060B6"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 text-[11px] text-ardoise-500">
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#9060B6]" /> Réalisé</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#C4A3DE]" /> Projeté</span>
      </div>

      {/* Appliquer au simulateur — temporairement désactivé */}
      {/*
      <Button
        type="button"
        onClick={() => onApply(forecast.annualProbable)}
        disabled={applied}
        className="w-full"
      >
        {applied ? "Prévision appliquée au simulateur ✓" : "Appliquer cette prévision au simulateur"}
      </Button>
      */}

      {/* Switch Manuel / IA — masqué temporairement (mode Manuel uniquement) */}
      {showAnalysisSwitch && (
        <div className="flex items-center justify-end">
          <div className="inline-flex items-center gap-0.5 rounded-full bg-ardoise-100 p-0.5">
            <button
              type="button"
              onClick={() => setAnalysisMode("manuel")}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                analysisMode === "manuel" ? "bg-white text-ardoise-800 shadow-sm" : "text-ardoise-500 hover:text-ardoise-700"
              }`}
            >
              Manuel
            </button>
            <button
              type="button"
              onClick={() => setAnalysisMode("ia")}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                analysisMode === "ia" ? "bg-white text-ardoise-800 shadow-sm" : "text-ardoise-500 hover:text-ardoise-700"
              }`}
            >
              IA
            </button>
          </div>
        </div>
      )}

      {analysisMode === "manuel" ? (
      /* Encart Manuel — saisie d'actes prévus */
      <div className="rounded-[12px] border border-ardoise-100 bg-white/60 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-semibold text-ardoise-700">Saisie manuelle</p>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-ardoise-500">Mois</label>
            <select
              value={manualMonth}
              onChange={(e) => { setManualMonth(Number(e.target.value)); setManualFeedback(null); }}
              className="px-2 py-1 text-xs rounded-md border border-ardoise-200 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400 capitalize"
            >
              {MONTHS_LONG.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {actOptions === null ? (
          <p className="text-xs text-ardoise-400">Chargement des actes…</p>
        ) : allOptions.length === 0 ? (
          <p className="text-xs text-ardoise-500">
            Aucun acte disponible.
          </p>
        ) : (
          <>
            {manualLines.length === 0 && (
              <p className="text-xs text-ardoise-400">Ajoutez les actes que vous prévoyez ce mois-ci.</p>
            )}

            <div className="space-y-2">
              {manualLines.map((line, idx) => {
                const setLine = (patch: Partial<typeof line>) =>
                  setManualLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
                return (
                  <div key={idx} className="flex flex-wrap items-center gap-1.5">
                    <select
                      value={line.key}
                      onChange={(e) => {
                        const p = optionByKey(e.target.value);
                        setLine({ key: e.target.value, unitAmount: p ? p.unitPrice : line.unitAmount });
                        setManualFeedback(null);
                      }}
                      className="flex-1 min-w-[150px] px-2 py-1 text-xs rounded-md border border-ardoise-200 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                    >
                      {actOptions.mine.length > 0 && (
                        <optgroup label="Vos actes (tarif réel)">
                          {actOptions.mine.map((a) => (
                            <option key={a.key} value={a.key}>{a.short} — {a.label}</option>
                          ))}
                        </optgroup>
                      )}
                      {actOptions.catalog.length > 0 && (
                        <optgroup label="Autres actes NGAP (tarif conventionnel)">
                          {actOptions.catalog.map((a) => (
                            <option key={a.key} value={a.key}>{a.short} — {a.label}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={line.count}
                      onChange={(e) => { setLine({ count: Math.max(0, Math.floor(Number(e.target.value) || 0)) }); setManualFeedback(null); }}
                      className="w-12 px-1.5 py-1 text-xs text-center rounded-md border border-ardoise-200 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                      aria-label="Quantité"
                    />
                    <span className="text-[11px] text-ardoise-400">×</span>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        step="0.05"
                        value={line.unitAmount}
                        onChange={(e) => { setLine({ unitAmount: Math.max(0, Number(e.target.value) || 0) }); setManualFeedback(null); }}
                        className="w-16 pl-1.5 pr-4 py-1 text-xs text-right rounded-md border border-ardoise-200 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                        aria-label="Prix unitaire"
                      />
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-ardoise-400 pointer-events-none">€</span>
                    </div>
                    <span className="w-16 text-right text-xs font-medium text-ardoise-700 font-mono shrink-0">
                      {formatCurrency(line.count * line.unitAmount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeManualLine(idx)}
                      disabled={manualSaving}
                      className="text-ardoise-300 hover:text-alerte-500 transition-colors shrink-0 disabled:opacity-40"
                      aria-label="Retirer"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                onClick={addManualLine}
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                + Ajouter un acte
              </button>
              {manualLines.length > 0 && (
                <span className="text-[11px] text-ardoise-400">
                  Actes hors historique : tarif conventionnel de base (hors déplacement), modifiable.
                </span>
              )}
            </div>

            {manualLines.length > 0 && (
              <>
                <div className="flex items-center justify-between pt-1 border-t border-ardoise-100">
                  <span className="text-xs text-ardoise-500">Total du mois saisi</span>
                  <span className="text-sm font-bold text-ardoise-800 font-mono">{formatCurrency(manualTotal)}</span>
                </div>

                {/* Compléter (ajout) vs Définir tout le mois (remplacement) */}
                <div className="inline-flex items-center gap-0.5 rounded-full bg-ardoise-100 p-0.5 w-full">
                  <button
                    type="button"
                    onClick={() => { setManualPersist("add"); setManualFeedback(null); }}
                    className={`flex-1 px-2 py-1 text-[11px] font-medium rounded-full transition-colors ${
                      manualPersist === "add" ? "bg-white text-ardoise-800 shadow-sm" : "text-ardoise-500 hover:text-ardoise-700"
                    }`}
                  >
                    Compléter ma prévision
                  </button>
                  <button
                    type="button"
                    onClick={() => { setManualPersist("replace"); setManualFeedback(null); }}
                    className={`flex-1 px-2 py-1 text-[11px] font-medium rounded-full transition-colors ${
                      manualPersist === "replace" ? "bg-white text-ardoise-800 shadow-sm" : "text-ardoise-500 hover:text-ardoise-700"
                    }`}
                  >
                    Définir tout le mois
                  </button>
                </div>
                <p className="text-[11px] text-ardoise-400 leading-snug">
                  {manualPersist === "add"
                    ? "Ces actes s'ajoutent à votre projection habituelle du mois."
                    : "Ces actes remplacent toute la projection du mois."}
                </p>

                <button
                  type="button"
                  onClick={applyManualActs}
                  disabled={manualSaving || manualTotal <= 0}
                  className="w-full px-2.5 py-1.5 text-xs font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40"
                >
                  {manualSaving ? "Application…" : "Appliquer à la simulation"}
                </button>
              </>
            )}

            {manualFeedback && (
              <p className={`text-[11px] ${manualFeedback.ok ? "text-menthe-600" : "text-alerte-600"}`}>{manualFeedback.text}</p>
            )}
          </>
        )}
      </div>
      ) : (
      /* Encart IA */
      <div className="rounded-[12px] border border-ardoise-100 bg-white/60 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-semibold text-ardoise-700">Analyse IA</p>
          <button
            type="button"
            onClick={() => askAI("Explique-moi ma prévision de chiffre d'affaires pour cette année : tendance, saisonnalité, mois forts et faibles, et ce que je peux en faire.")}
            disabled={aiLoading}
            className="px-2.5 py-1 text-xs font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {aiLoading ? "Analyse…" : "Expliquer ma prévision"}
          </button>
        </div>
        {aiMessages.length > 0 && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {aiMessages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : ""}>
                <span className={`inline-block text-xs whitespace-pre-wrap leading-relaxed rounded-md px-2 py-1 ${
                  m.role === "user" ? "bg-brand-100 text-brand-800" : "text-ardoise-600"
                }`}>
                  {m.content || (aiLoading && i === aiMessages.length - 1 ? "…" : "")}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && question.trim()) { askAI(question.trim()); setQuestion(""); } }}
            placeholder="Poser une question sur ma prévision…"
            disabled={aiLoading}
            className="flex-1 min-w-0 px-3 py-1.5 text-xs rounded-md border border-ardoise-200 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:opacity-40"
          />
          <button
            type="button"
            onClick={() => { if (question.trim()) { askAI(question.trim()); setQuestion(""); } }}
            disabled={aiLoading || !question.trim()}
            className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-ardoise-100 text-ardoise-700 hover:bg-ardoise-200 disabled:opacity-40"
          >
            Envoyer
          </button>
        </div>
      </div>
      )}
      </div>
    </div>
  );
}

// ── Shared components ──

function YearSelector({
  year,
  setYear,
  maxYear,
}: {
  year: number;
  setYear: (y: number | ((prev: number) => number)) => void;
  maxYear: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setYear((y) => y - 1)}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-ardoise-500 hover:text-ardoise-900 hover:bg-ardoise-100 transition-colors"
        aria-label="Année précédente"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span className="text-sm font-semibold text-ardoise-900 w-12 text-center font-mono">{year}</span>
      <button
        type="button"
        onClick={() => setYear((y) => y + 1)}
        disabled={year >= maxYear}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-ardoise-500 hover:text-ardoise-900 hover:bg-ardoise-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Année suivante"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  );
}

function InfoTooltip({ text, position = "top" }: { text: string; position?: "top" | "bottom" }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow((v) => !v)}
        className="flex items-center justify-center w-4 h-4 rounded-full bg-ardoise-200 text-ardoise-500 hover:bg-ardoise-300 transition-colors shrink-0 cursor-help"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
      </button>
      {show && (
        position === "bottom" ? (
          <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-ardoise-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg leading-relaxed">
            {text}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-ardoise-900" />
          </div>
        ) : (
          <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-ardoise-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg leading-relaxed">
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ardoise-900" />
          </div>
        )
      )}
    </div>
  );
}
