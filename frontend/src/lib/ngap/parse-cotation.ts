import { isActe } from "./rates";
import { actLabel } from "./acts";

export interface CotationToken {
  /** Code normalisé en majuscules (ex. "AMI", "BSC", "IFA"). */
  code: string;
  /** Coefficient multiplicateur (ex. AMI 4 → 4). Défaut 1 si absent. */
  coefficient: number;
}

/**
 * Parse une chaîne de cotation brute issue d'un bordereau en une liste de codes.
 *
 * Gère les particularités observées dans les bordereaux réels :
 *   - espaces incohérents : "AMI4" comme "AMI 4"
 *   - décimales à la virgule : "AMI 1,5", "DI 1,2"
 *   - combinaisons : "BSC + IFI", "AMX 4 + MCI"
 *   - parenthèses : "(AMX 1 + AMX 1) / 2 + N"
 *   - règle du second acte à 50 % notée "/ 2" ou "/2" → ignorée (on ne recalcule pas les montants en v1)
 *
 * Renvoie un token par acte mentionné (les répétitions sont conservées :
 * "AMI 14 + AMI 9" → deux tokens AMI).
 */
export function parseCotation(raw: string): CotationToken[] {
  if (!raw) return [];

  const normalized = raw
    .replace(/,/g, ".") // décimales virgule → point
    .replace(/[()]/g, " ") // parenthèses → espaces
    .replace(/\/\s*\d+(?:\.\d+)?/g, " "); // retire les diviseurs "/ 2", "/2", "/ 2.5"…

  const tokens: CotationToken[] = [];
  for (const segment of normalized.split("+")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    // Lettres (le code) puis éventuellement un nombre (le coefficient).
    const match = trimmed.match(/^([A-Za-z]+)\s*(\d+(?:\.\d+)?)?/);
    if (!match) continue;

    const code = match[1]!.toUpperCase();
    const coefficient = match[2] ? parseFloat(match[2]) : 1;
    if (!Number.isFinite(coefficient)) continue;

    tokens.push({ code, coefficient });
  }

  return tokens;
}

/**
 * Détermine la lettre-clé PRINCIPALE d'un passage : le premier acte de soin
 * de la cotation. Si la cotation ne contient que des modificateurs
 * (ex. "IFI" ou "IFI + F"), on retient le premier code rencontré.
 * Renvoie null pour une cotation vide/illisible.
 */
export function principalCode(raw: string): string | null {
  return principalToken(raw)?.code ?? null;
}

/**
 * Acte principal d'un passage : premier acte de soin de la cotation (code + coefficient).
 * Si la cotation ne contient que des modificateurs, retient le premier token.
 * Renvoie null pour une cotation vide/illisible.
 */
export function principalToken(raw: string): CotationToken | null {
  const tokens = parseCotation(raw);
  if (tokens.length === 0) return null;
  return tokens.find((t) => isActe(t.code)) ?? tokens[0]!;
}

/** Clé stable identifiant une prestation (lettre-clé + coefficient principal). */
export function prestationKey(raw: string): string | null {
  const t = principalToken(raw);
  return t ? `${t.code}:${t.coefficient}` : null;
}

export interface PrestationRow {
  /** Clé stable (code:coefficient). */
  key: string;
  code: string;
  coefficient: number;
  /** Code court affiché (ex. "AMI 4", ou "BSC" si coefficient 1). */
  short: string;
  /** Libellé de la prestation (NGAP). */
  label: string;
  /** Nombre de passages rattachés à cette prestation. */
  passageCount: number;
  /** CA cumulé (somme des montants totaux des passages rattachés). */
  amount: number;
}

interface BreakdownInput {
  cotation: string;
  totalAmount: string | number;
}

/**
 * Ventile une liste de passages par PRESTATION (acte principal = lettre-clé + coefficient).
 * Chaque passage est attribué à UNE seule prestation → la somme des `amount`
 * correspond exactement au CA total des passages fournis.
 */
export function buildPrestationBreakdown(passages: BreakdownInput[]): PrestationRow[] {
  const map = new Map<string, PrestationRow>();

  for (const p of passages) {
    const token = principalToken(p.cotation);
    if (!token) continue;

    const { code, coefficient } = token;
    const key = `${code}:${coefficient}`;
    const amount = typeof p.totalAmount === "number" ? p.totalAmount : parseFloat(p.totalAmount);

    const row = map.get(key) ?? {
      key,
      code,
      coefficient,
      short: coefficient === 1 ? code : `${code} ${coefficient}`,
      label: actLabel(code, coefficient),
      passageCount: 0,
      amount: 0,
    };
    row.passageCount += 1;
    row.amount += Number.isFinite(amount) ? amount : 0;
    map.set(key, row);
  }

  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}
