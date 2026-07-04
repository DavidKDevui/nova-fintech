import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { practitioners, practiceLinks, carePassages, practitionerPlannedActs } from "@/lib/db/schema";
import { namesMatch } from "@/lib/name-matching";
import { decrypt } from "@/lib/encryption";
import { buildPrestationBreakdown } from "@/lib/ngap/parse-cotation";
import { ngapActCatalog, type NgapCatalogEntry } from "@/lib/ngap/acts";
import { setMonthOverride, setMonthAddition, clearPlannedActsAdjustment } from "./ca-scenario.service";

/** Label des saisies manuelles d'actes prévus (sert au dédoublonnage en base). */
export const PLANNED_ACTS_LABEL = "Actes prévus (saisie manuelle)";

type Practitioner = typeof practitioners.$inferSelect;

export type ActPrice = {
  /** Clé stable (code:coefficient). */
  key: string;
  /** Code court affiché, ex "AMI 1.5". */
  short: string;
  /** Libellé NGAP en clair, ex "Prélèvement sanguin par ponction veineuse". */
  label: string;
  /** Nombre de passages observés. */
  count: number;
  /** Tarif moyen réellement facturé par passage (déplacements/majorations inclus). */
  avgAmount: number;
};

/** Cotation potentiellement chiffrée (présence de ":") → déchiffrée. */
function decryptCotation(raw: string): string {
  return raw.includes(":") ? decrypt(raw) : raw;
}

/**
 * Tarif moyen par acte, observé dans les passages PAYÉS du praticien sur les
 * `monthsBack` derniers mois. Reflète la facturation réelle (acte + IFD/IK +
 * majorations), pas le tarif NGAP théorique.
 */
export async function getActPricing(hp: Practitioner, monthsBack = 12): Promise<ActPrice[]> {
  const links = await db
    .select({ practiceId: practiceLinks.practiceId })
    .from(practiceLinks)
    .where(eq(practiceLinks.practitionerId, hp.id));
  if (links.length === 0) return [];

  const practiceIds = links.map((l) => l.practiceId);
  const fullName = `${hp.firstName} ${hp.lastName}`;
  const lastNamePattern = `%${hp.lastName}%`;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;

  const passages = await db
    .select({
      practitioner: carePassages.practitioner,
      cotation: carePassages.cotation,
      totalAmount: carePassages.totalAmount,
    })
    .from(carePassages)
    .where(
      and(
        inArray(carePassages.practiceId, practiceIds),
        sql`${carePassages.practitioner} ILIKE ${lastNamePattern}`,
        sql`${carePassages.careDate} >= ${startStr}`,
        sql`${carePassages.status} = 'paye'`,
      ),
    );

  const mine = passages
    .filter((p) => namesMatch(fullName, p.practitioner))
    .map((p) => ({ cotation: decryptCotation(p.cotation), totalAmount: p.totalAmount }));

  return buildPrestationBreakdown(mine).map((r) => ({
    key: r.key,
    short: r.short,
    label: r.label,
    count: r.passageCount,
    avgAmount: r.passageCount > 0 ? Math.round((r.amount / r.passageCount) * 100) / 100 : 0,
  }));
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/** Résout un terme vers un acte du catalogue NGAP (second niveau, actes jamais facturés). */
function resolveCatalog(catalog: NgapCatalogEntry[], term: string): NgapCatalogEntry | null {
  const t = normalize(term);
  const compact = t.replace(/\s+/g, "");
  const exact = catalog.find((c) => normalize(c.short).replace(/\s+/g, "") === compact);
  if (exact) return exact;
  return catalog.find((c) => c.key.toLowerCase() === term.toLowerCase()) ?? null;
}

/** Résout un terme (« AMI 1.5 », « prise de sang »…) vers une prestation tarifée. */
function resolveAct(prices: ActPrice[], term: string): ActPrice | null {
  const t = normalize(term);
  const tCompact = t.replace(/\s+/g, "");
  // 1. Code court exact (AMI 1.5 / AMI1.5).
  const exact = prices.find((p) => normalize(p.short).replace(/\s+/g, "") === tCompact);
  if (exact) return exact;
  // 2. Inclusion dans le libellé (ou inverse) — pour « prélèvement », « pansement »…
  const byLabel = prices.find((p) => {
    const l = normalize(p.label);
    return l.includes(t) || t.includes(l);
  });
  if (byLabel) return byLabel;
  // 3. Lettre-clé seule (AMI, AIS…).
  const byCode = prices.find((p) => normalize(p.short).startsWith(t) || t.startsWith(normalize(p.key.split(":")[0]!)));
  return byCode ?? null;
}

export type ActEstimateLine = {
  term: string;
  short: string;
  label: string;
  count: number;
  unitAmount: number;
  lineTotal: number;
};

export type ActEstimateResult = {
  month: number;
  year: number;
  lines: ActEstimateLine[];
  /** Termes non rattachés à un acte tarifé (ex: « consultation »). */
  unmatched: string[];
  total: number;
  saved: boolean;
};

/** Acte prévu ; `unitAmount` permet de forcer un tarif (prix modifié par l'user). */
export type PlannedAct = { term: string; count: number; unitAmount?: number };

/**
 * Comment persister le total :
 *   - "replace" → impose la valeur du mois (month_override) : les actes SONT tout le mois.
 *   - "add"     → ajoute le total à la projection existante (fixed_oneoff).
 *   - null      → simple estimation, rien n'est enregistré.
 */
export type PersistMode = "replace" | "add" | null;

/**
 * Estime le CA d'un mois à partir d'actes prévus. Chaque acte est résolu d'abord
 * sur l'historique réel du praticien (tarif moyen facturé), sinon sur le
 * catalogue NGAP (tarif conventionnel). Le tarif unitaire retenu est celui fourni
 * par l'appelant (prix modifié dans l'UI) ou, à défaut, le tarif ainsi résolu.
 * Selon `persist`, le total réaligne le mois (remplacement) ou s'y ajoute.
 */
export async function estimateMonthFromActs(
  hp: Practitioner,
  acts: PlannedAct[],
  month: number,
  persist: PersistMode,
): Promise<ActEstimateResult | { error: string }> {
  if (!Number.isInteger(month) || month < 1 || month > 12) return { error: "Mois invalide (1 à 12)." };

  const prices = await getActPricing(hp);
  const catalog = ngapActCatalog();

  const lines: ActEstimateLine[] = [];
  const unmatched: string[] = [];
  for (const a of acts) {
    const count = Number(a.count);
    if (!a.term || !Number.isFinite(count) || count <= 0) continue;
    // Priorité à l'acte réel (tarif observé) ; repli sur le catalogue NGAP.
    const real = resolveAct(prices, a.term);
    const cat = real ? null : resolveCatalog(catalog, a.term);
    const match = real ?? cat;
    if (!match) {
      unmatched.push(a.term);
      continue;
    }
    // Prix imposé par l'appelant s'il est valide, sinon tarif résolu.
    const fallback = real ? real.avgAmount : cat ? cat.unitPrice : 0;
    const override = Number(a.unitAmount);
    const unitAmount = Number.isFinite(override) && override >= 0 ? override : fallback;
    lines.push({
      term: a.term,
      short: match.short,
      label: match.label,
      count,
      unitAmount,
      lineTotal: Math.round(unitAmount * count * 100) / 100,
    });
  }

  const total = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0));
  const year = new Date().getFullYear();

  let saved = false;
  if (persist && total > 0) {
    const res = persist === "replace"
      ? await setMonthOverride(hp.id, year, month, total, PLANNED_ACTS_LABEL)
      : await setMonthAddition(hp.id, year, month, total, PLANNED_ACTS_LABEL);
    saved = res.ok;
  }

  return { month, year, lines, unmatched, total, saved };
}

/** Option de saisie manuelle : soit un acte réel (tarif observé), soit un acte NGAP (tarif conventionnel). */
export type ActOption = {
  key: string;
  short: string;
  label: string;
  unitPrice: number;
  source: "reel" | "conventionnel";
};

/**
 * Options du menu de saisie manuelle, en deux groupes :
 *   - `mine`    : actes réellement facturés par le praticien (tarif moyen réel).
 *   - `catalog` : reste du référentiel NGAP au tarif conventionnel (actes jamais faits),
 *                 sans doublon avec `mine`.
 */
export async function getManualActOptions(hp: Practitioner): Promise<{ mine: ActOption[]; catalog: ActOption[] }> {
  const prices = await getActPricing(hp);
  const mine: ActOption[] = prices.map((p) => ({
    key: p.key,
    short: p.short,
    label: p.label,
    unitPrice: p.avgAmount,
    source: "reel",
  }));
  const mineKeys = new Set(mine.map((m) => m.key));
  const catalog: ActOption[] = ngapActCatalog()
    .filter((c) => !mineKeys.has(c.key))
    .map((c) => ({
      key: c.key,
      short: c.short,
      label: c.label,
      unitPrice: c.unitPrice,
      source: "conventionnel",
    }));
  return { mine, catalog };
}

/** Une ligne d'acte prévu telle que saisie/rechargée dans l'UI. */
export type PlannedActLine = { key: string; count: number; unitAmount: number };

export type SavedPlannedActs = {
  month: number;
  year: number;
  mode: "add" | "replace";
  lines: PlannedActLine[];
};

/** Détail des actes prévus enregistrés pour un mois (pour réafficher/rééditer la saisie). */
export async function getPlannedActs(hp: Practitioner, year: number, month: number): Promise<SavedPlannedActs> {
  const rows = await db
    .select()
    .from(practitionerPlannedActs)
    .where(and(
      eq(practitionerPlannedActs.practitionerId, hp.id),
      eq(practitionerPlannedActs.year, year),
      eq(practitionerPlannedActs.month, month),
    ));
  const lines = rows.map((r) => ({ key: r.actKey, count: r.count, unitAmount: Number(r.unitAmount) }));
  const mode: "add" | "replace" = rows[0]?.persistMode === "replace" ? "replace" : "add";
  return { month, year, mode, lines };
}

/**
 * Enregistre le détail des actes prévus d'un mois (réécriture en bloc) ET
 * répercute leur total sur la prévision via `practitionerCaAdjustments`
 * (month_override si « replace », fixed_oneoff si « add »). L'ancien ajustement
 * de saisie manuelle du mois — quelle que soit sa forme — est retiré d'abord.
 * Si plus aucune ligne valide, le mois est simplement nettoyé (détail + ajustement).
 */
export async function saveManualPlannedActs(
  hp: Practitioner,
  lines: PlannedActLine[],
  month: number,
  mode: "add" | "replace",
): Promise<ActEstimateResult | { error: string }> {
  if (!Number.isInteger(month) || month < 1 || month > 12) return { error: "Mois invalide (1 à 12)." };
  const year = new Date().getFullYear();

  const { mine, catalog } = await getManualActOptions(hp);
  const byKey = new Map([...mine, ...catalog].map((o) => [o.key, o]));

  const estimateLines: ActEstimateLine[] = [];
  const detailRows: (typeof practitionerPlannedActs.$inferInsert)[] = [];
  for (const l of lines) {
    const opt = byKey.get(l.key);
    const count = Number(l.count);
    if (!opt || !Number.isFinite(count) || count <= 0) continue;
    const override = Number(l.unitAmount);
    const unitAmount = Number.isFinite(override) && override >= 0 ? override : opt.unitPrice;
    estimateLines.push({
      term: opt.short,
      short: opt.short,
      label: opt.label,
      count,
      unitAmount,
      lineTotal: Math.round(unitAmount * count * 100) / 100,
    });
    detailRows.push({
      practitionerId: hp.id,
      year,
      month,
      actKey: opt.key,
      short: opt.short,
      label: opt.label,
      count,
      unitAmount: String(unitAmount),
      persistMode: mode,
    });
  }

  const total = Math.round(estimateLines.reduce((s, l) => s + l.lineTotal, 0));

  // Réécriture en bloc : on repart d'un mois propre (détail + ajustement).
  await db.delete(practitionerPlannedActs).where(and(
    eq(practitionerPlannedActs.practitionerId, hp.id),
    eq(practitionerPlannedActs.year, year),
    eq(practitionerPlannedActs.month, month),
  ));
  await clearPlannedActsAdjustment(hp.id, year, month, PLANNED_ACTS_LABEL);

  let saved = false;
  if (total > 0 && detailRows.length > 0) {
    await db.insert(practitionerPlannedActs).values(detailRows);
    const res = mode === "replace"
      ? await setMonthOverride(hp.id, year, month, total, PLANNED_ACTS_LABEL)
      : await setMonthAddition(hp.id, year, month, total, PLANNED_ACTS_LABEL);
    saved = res.ok;
  }

  return { month, year, lines: estimateLines, unmatched: [], total, saved };
}
