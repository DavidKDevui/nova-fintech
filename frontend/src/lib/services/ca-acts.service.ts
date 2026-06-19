import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { practitioners, practiceLinks, carePassages } from "@/lib/db/schema";
import { namesMatch } from "@/lib/name-matching";
import { decrypt } from "@/lib/encryption";
import { buildPrestationBreakdown } from "@/lib/ngap/parse-cotation";
import { setMonthOverride } from "./ca-scenario.service";

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

/**
 * Estime le CA d'un mois à partir d'actes prévus, au tarif moyen historique.
 * Si `save`, persiste le total comme valeur imposée du mois (month_override) →
 * la prévision du graphe s'aligne dessus.
 */
export async function estimateMonthFromActs(
  hp: Practitioner,
  acts: { term: string; count: number }[],
  month: number,
  save: boolean,
): Promise<ActEstimateResult | { error: string }> {
  if (!Number.isInteger(month) || month < 1 || month > 12) return { error: "Mois invalide (1 à 12)." };

  const prices = await getActPricing(hp);
  if (prices.length === 0) {
    return { error: "Aucun historique de passages payés pour établir des tarifs moyens." };
  }

  const lines: ActEstimateLine[] = [];
  const unmatched: string[] = [];
  for (const a of acts) {
    const count = Number(a.count);
    if (!a.term || !Number.isFinite(count) || count <= 0) continue;
    const match = resolveAct(prices, a.term);
    if (!match) {
      unmatched.push(a.term);
      continue;
    }
    lines.push({
      term: a.term,
      short: match.short,
      label: match.label,
      count,
      unitAmount: match.avgAmount,
      lineTotal: Math.round(match.avgAmount * count * 100) / 100,
    });
  }

  const total = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0));
  const year = new Date().getFullYear();

  let saved = false;
  if (save && total > 0) {
    const res = await setMonthOverride(hp.id, year, month, total, "Estimation par actes prévus");
    saved = res.ok;
  }

  return { month, year, lines, unmatched, total, saved };
}
