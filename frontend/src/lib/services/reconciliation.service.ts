/**
 * Rapprochement automatique entrants : carePayments (bordereaux Ozzen) ↔ bankTransactions (virements caisse).
 *
 * Deux passes ordonnées, toutes deux strictes (jamais d'ambiguïté → on ne match pas).
 *
 * Passe 1 — 1-pour-1 exact :
 *   - Même montant, à l'euro près
 *   - bankTx.date ∈ [paymentDate, paymentDate + 15j]
 *   - Exactement un candidat des deux côtés (pas d'autre carePayment ni de bankTx en concurrence)
 *
 * Passe 2 — Subset-sum unique sur ±1j :
 *   - Pour chaque bankTx restante, somme exacte d'un sous-ensemble de carePayments sur la fenêtre J±1
 *   - Une solution unique → match l'ensemble du subset
 *   - Plusieurs solutions ou aucune → pas de match
 *   - Plafonné à N=20 carePayments candidats (énumération bitmask 2^N)
 *
 * Tous les montants sont manipulés en centimes (entier) pour éviter toute dérive flottante.
 * Pure : aucun side-effect, idempotent à entrées égales.
 */

export interface UnmatchedBankTx {
  id: string;
  date: string; // YYYY-MM-DD
  amountCents: number; // positive int
}

export interface UnmatchedCarePayment {
  id: string;
  paymentDate: string; // YYYY-MM-DD
  amountCents: number; // positive int
}

export interface ReconciliationMatch {
  carePaymentId: string;
  bankTransactionId: string;
  pass: 1 | 2;
}

const PASS1_DATE_WINDOW_DAYS = 15;
const PASS2_DATE_WINDOW_DAYS = 1;
const PASS2_MAX_CANDIDATES = 20;

// Fenêtre serrée pour la vérification d'ambiguïté pass 1 : on cherche les sous-ensembles
// concurrents proches dans le temps (≤ 2j de bt) — au-delà, le virement caisse mixant des
// paiements éloignés est irréaliste. Plus serré qu'au-dessus pour borner N en pratique.
const AMBIGUITY_DATE_WINDOW_DAYS = 2;
const AMBIGUITY_MAX_CANDIDATES = 20;

/** Différence en jours entre deux dates au format YYYY-MM-DD (b − a). */
function daysBetween(a: string, b: string): number {
  const ta = Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)));
  const tb = Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)));
  return Math.round((tb - ta) / 86_400_000);
}

function pass1(
  bankTxs: UnmatchedBankTx[],
  carePayments: UnmatchedCarePayment[],
): ReconciliationMatch[] {
  // Index par montant : pass 1 exige égalité stricte des montants
  const cpByAmount = new Map<number, UnmatchedCarePayment[]>();
  for (const cp of carePayments) {
    let list = cpByAmount.get(cp.amountCents);
    if (!list) { list = []; cpByAmount.set(cp.amountCents, list); }
    list.push(cp);
  }

  const btByAmount = new Map<number, UnmatchedBankTx[]>();
  for (const bt of bankTxs) {
    let list = btByAmount.get(bt.amountCents);
    if (!list) { list = []; btByAmount.set(bt.amountCents, list); }
    list.push(bt);
  }

  const matches: ReconciliationMatch[] = [];

  for (const [amount, cps] of cpByAmount) {
    const bts = btByAmount.get(amount);
    if (!bts || bts.length === 0) continue;

    for (const cp of cps) {
      // Côté carePayment : bankTxs candidates dans la fenêtre
      const btCandidates = bts.filter((bt) => {
        const d = daysBetween(cp.paymentDate, bt.date);
        return d >= 0 && d <= PASS1_DATE_WINDOW_DAYS;
      });
      if (btCandidates.length !== 1) continue;

      const bt = btCandidates[0]!;

      // Côté bankTx : pas d'autre carePayment de même montant qui pourrait revendiquer ce virement
      const cpCompetitors = cps.filter((c) => {
        if (c.id === cp.id) return false;
        const d = daysBetween(c.paymentDate, bt.date);
        return d >= 0 && d <= PASS1_DATE_WINDOW_DAYS;
      });
      if (cpCompetitors.length > 0) continue;

      // Ambiguïté subset-sum : un sous-ensemble d'AUTRES carePayments PROCHES du virement
      // pourrait aussi sommer au montant (ex : bt=300 + cp1=300 + cp2+cp3=300 même jour).
      // Au-delà de ±2j autour du virement, un mix par la caisse est irréaliste.
      const ambiguityCps = carePayments.filter((c) => {
        if (c.id === cp.id) return false;
        const d = daysBetween(c.paymentDate, bt.date);
        return d >= -AMBIGUITY_DATE_WINDOW_DAYS && d <= AMBIGUITY_DATE_WINDOW_DAYS;
      });
      if (ambiguityCps.length > AMBIGUITY_MAX_CANDIDATES) continue; // trop de candidats → on abandonne par prudence
      if (hasSubsetSum(ambiguityCps.map((c) => c.amountCents), bt.amountCents)) continue;

      matches.push({ carePaymentId: cp.id, bankTransactionId: bt.id, pass: 1 });
    }
  }

  return matches;
}

/**
 * Existe-t-il au moins un sous-ensemble non vide d'`amountsCents` qui somme exactement à `target` ?
 * Énumération bitmask — n'appeler qu'avec amountsCents.length ≤ AMBIGUITY_MAX_CANDIDATES.
 * Arrêt anticipé dès la première solution trouvée.
 */
function hasSubsetSum(amountsCents: number[], target: number): boolean {
  const N = amountsCents.length;
  if (N === 0) return false;
  for (let mask = 1; mask < (1 << N); mask++) {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      if (mask & (1 << i)) sum += amountsCents[i]!;
    }
    if (sum === target) return true;
  }
  return false;
}

/**
 * Pour un bankTx donné, trouve l'unique sous-ensemble de candidats dont la somme = target.
 * Renvoie les indices du subset si solution unique, null sinon.
 * Énumère 2^N — n'appeler qu'avec N ≤ PASS2_MAX_CANDIDATES.
 */
function findUniqueSubsetSum(amountsCents: number[], targetCents: number): number[] | null {
  const N = amountsCents.length;
  if (N === 0 || N > PASS2_MAX_CANDIDATES) return null;

  let foundMask = -1;
  let count = 0;

  for (let mask = 1; mask < (1 << N); mask++) {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      if (mask & (1 << i)) sum += amountsCents[i]!;
    }
    if (sum === targetCents) {
      count++;
      if (count > 1) return null; // ambiguïté → on abandonne
      foundMask = mask;
    }
  }

  if (count !== 1 || foundMask < 0) return null;

  const indices: number[] = [];
  for (let i = 0; i < N; i++) {
    if (foundMask & (1 << i)) indices.push(i);
  }
  return indices;
}

function pass2(
  bankTxs: UnmatchedBankTx[],
  carePayments: UnmatchedCarePayment[],
): ReconciliationMatch[] {
  const matches: ReconciliationMatch[] = [];
  const consumedCpIds = new Set<string>();

  for (const bt of bankTxs) {
    const candidates = carePayments.filter((cp) => {
      if (consumedCpIds.has(cp.id)) return false;
      const d = daysBetween(cp.paymentDate, bt.date);
      return d >= -PASS2_DATE_WINDOW_DAYS && d <= PASS2_DATE_WINDOW_DAYS;
    });

    if (candidates.length === 0 || candidates.length > PASS2_MAX_CANDIDATES) continue;

    const subsetIndices = findUniqueSubsetSum(
      candidates.map((c) => c.amountCents),
      bt.amountCents,
    );
    if (!subsetIndices) continue;

    for (const idx of subsetIndices) {
      const cp = candidates[idx]!;
      consumedCpIds.add(cp.id);
      matches.push({ carePaymentId: cp.id, bankTransactionId: bt.id, pass: 2 });
    }
  }

  return matches;
}

/**
 * Lance les deux passes en cascade. Renvoie tous les matchs (déjà uniques côté carePaymentId).
 * Entrées : carePayments ET bankTxs non encore réconciliés (le filtrage côté DB est de la responsabilité de l'appelant).
 */
export function reconcileBatch(
  bankTxs: UnmatchedBankTx[],
  carePayments: UnmatchedCarePayment[],
): ReconciliationMatch[] {
  const matches = pass1(bankTxs, carePayments);

  const matchedCpIds = new Set(matches.map((m) => m.carePaymentId));
  const matchedBtIds = new Set(matches.map((m) => m.bankTransactionId));

  const remainingCp = carePayments.filter((cp) => !matchedCpIds.has(cp.id));
  const remainingBt = bankTxs.filter((bt) => !matchedBtIds.has(bt.id));

  matches.push(...pass2(remainingBt, remainingCp));

  return matches;
}
