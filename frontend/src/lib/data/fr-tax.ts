// Barème de l'impôt sur le revenu et plafond du quotient familial
// La clé `year` est l'année des REVENUS (impôt acquitté en year+1).
// Sources : LF 2024 / LF 2025 / LF 2026 (art. 4, indexation +0,9 % pour 2026).
// À mettre à jour chaque année après publication de la loi de finances.

export type Tranche = { min: number; max: number; rate: number };

const BAREMES: Record<number, Tranche[]> = {
  // Revenus 2023 — LF 2024
  2023: [
    { min: 0,        max: 11_294,   rate: 0 },
    { min: 11_294,   max: 28_797,   rate: 11 },
    { min: 28_797,   max: 82_341,   rate: 30 },
    { min: 82_341,   max: 177_106,  rate: 41 },
    { min: 177_106,  max: Infinity, rate: 45 },
  ],
  // Revenus 2024 — LF 2025
  2024: [
    { min: 0,        max: 11_497,   rate: 0 },
    { min: 11_497,   max: 29_315,   rate: 11 },
    { min: 29_315,   max: 83_823,   rate: 30 },
    { min: 83_823,   max: 180_294,  rate: 41 },
    { min: 180_294,  max: Infinity, rate: 45 },
  ],
  // Revenus 2025 — LF 2026 (indexation +0,9 %)
  2025: [
    { min: 0,        max: 11_600,   rate: 0 },
    { min: 11_600,   max: 29_579,   rate: 11 },
    { min: 29_579,   max: 84_577,   rate: 30 },
    { min: 84_577,   max: 181_917,  rate: 41 },
    { min: 181_917,  max: Infinity, rate: 45 },
  ],
};

// Plafond du gain fiscal procuré par chaque demi-part supplémentaire de QF.
// Source : BOI-IR-LIQ-20-20-20.
const QF_CAP_PER_HALF_PART: Record<number, number> = {
  2023: 1_759,
  2024: 1_791,
  2025: 1_807,
};

// Décote (mécanisme de réduction d'IR pour faibles revenus).
// Formule : décote = max(0, plafond - 0,4525 × IR brut), si IR brut < seuilEligibilite.
// Source : article 197 CGI, valeurs LF revaloriées chaque année.
type DecoteParams = { plafondCelibataire: number; plafondCouple: number; taux: number; seuilCelibataire: number; seuilCouple: number };
const DECOTE: Record<number, DecoteParams> = {
  2023: { plafondCelibataire: 873, plafondCouple: 1_444, taux: 0.4525, seuilCelibataire: 1_929, seuilCouple: 3_191 },
  2024: { plafondCelibataire: 889, plafondCouple: 1_470, taux: 0.4525, seuilCelibataire: 1_964, seuilCouple: 3_249 },
  2025: { plafondCelibataire: 897, plafondCouple: 1_483, taux: 0.4525, seuilCelibataire: 1_982, seuilCouple: 3_277 },
};

const LATEST_BAREME_YEAR = Math.max(...Object.keys(BAREMES).map(Number));
const LATEST_QF_YEAR = Math.max(...Object.keys(QF_CAP_PER_HALF_PART).map(Number));
const LATEST_DECOTE_YEAR = Math.max(...Object.keys(DECOTE).map(Number));

export function getBareme(incomeYear: number): Tranche[] {
  return BAREMES[incomeYear] ?? BAREMES[LATEST_BAREME_YEAR]!;
}

export function getQfCap(incomeYear: number): number {
  return QF_CAP_PER_HALF_PART[incomeYear] ?? QF_CAP_PER_HALF_PART[LATEST_QF_YEAR]!;
}

function getDecote(incomeYear: number): DecoteParams {
  return DECOTE[incomeYear] ?? DECOTE[LATEST_DECOTE_YEAR]!;
}

function applyDecote(impot: number, partsDeReference: number, incomeYear: number): number {
  if (impot <= 0) return 0;
  const d = getDecote(incomeYear);
  const isCouple = partsDeReference >= 2;
  const seuil = isCouple ? d.seuilCouple : d.seuilCelibataire;
  if (impot >= seuil) return impot;
  const plafond = isCouple ? d.plafondCouple : d.plafondCelibataire;
  const decote = Math.max(0, plafond - d.taux * impot);
  return Math.max(0, Math.round(impot - decote));
}

function irOnePart(taxableIncome: number, bareme: Tranche[]): { impot: number; trancheIndex: number; fillPercent: number; distanceToNext: number } {
  let impot = 0;
  let trancheIndex = 0;
  let fillPercent = 0;
  let distanceToNext = 0;

  for (let i = 0; i < bareme.length; i++) {
    const t = bareme[i]!;
    const base = Math.min(taxableIncome, t.max) - t.min;
    if (base > 0) {
      impot += base * (t.rate / 100);
      trancheIndex = i;
    }
    if (taxableIncome <= t.max) {
      const width = t.max - t.min;
      fillPercent = width === Infinity ? 0 : Math.round(((taxableIncome - t.min) / width) * 100);
      distanceToNext = t.max === Infinity ? 0 : Math.round(t.max - taxableIncome);
      break;
    }
  }

  return { impot, trancheIndex, fillPercent, distanceToNext };
}

export type FiscalInputs = {
  revenuImposable: number;
  parts: number;
  partsDeReference: number; // 1 si célib (ou parent isolé), 2 si marié/pacsé — base avant demi-parts supplémentaires
  incomeYear: number;
};

export type FiscalResult = {
  impot: number;
  tauxMoyen: number;
  currentTrancheIndex: number;
  fillPercent: number;
  distanceToNext: number;
  plafonneQf: boolean; // true si le plafonnement du QF a été appliqué
};

export function computeIR(input: FiscalInputs): FiscalResult {
  const { revenuImposable, parts, partsDeReference, incomeYear } = input;
  const bareme = getBareme(incomeYear);

  // 1. IR calculé avec le nombre de parts réel
  const quotient = revenuImposable / parts;
  const perPart = irOnePart(quotient, bareme);
  let impotReel = Math.round(perPart.impot * parts);

  // 2. Plafonnement du QF : on compare avec l'IR au QF de référence
  let plafonneQf = false;
  if (parts > partsDeReference) {
    const quotientRef = revenuImposable / partsDeReference;
    const perPartRef = irOnePart(quotientRef, bareme);
    const impotRef = Math.round(perPartRef.impot * partsDeReference);
    const avantage = impotRef - impotReel;
    const halfParts = (parts - partsDeReference) * 2;
    const avantageMax = halfParts * getQfCap(incomeYear);
    if (avantage > avantageMax) {
      impotReel = impotRef - avantageMax;
      plafonneQf = true;
    }
  }

  // 3. Décote pour faibles revenus (article 197 CGI).
  impotReel = applyDecote(impotReel, partsDeReference, incomeYear);

  const tauxMoyen = revenuImposable > 0 ? Math.round((impotReel / revenuImposable) * 100) : 0;

  return {
    impot: Math.max(0, impotReel),
    tauxMoyen,
    currentTrancheIndex: perPart.trancheIndex,
    fillPercent: perPart.fillPercent,
    distanceToNext: Math.round(perPart.distanceToNext * parts),
    plafonneQf,
  };
}

// Calcul du nombre de parts fiscales.
// Règle simplifiée applicable à la majorité des situations :
//   - Célibataire : 1
//   - Marié/Pacsé : 2
//   - Parent isolé (case T, célib avec enfant à charge) : 1 + 0,5 (1re demi-part majorée)
//   - +0,5 part pour le 1er et le 2e enfant, +1 part par enfant à partir du 3e
export function computeParts(input: {
  maritalStatus: "celibataire" | "marie" | "pacse";
  dependentChildren: number;
  isSingleParent: boolean;
}): { parts: number; partsDeReference: number } {
  const { maritalStatus, dependentChildren, isSingleParent } = input;

  const partsDeReference = maritalStatus === "celibataire" ? 1 : 2;
  let parts = partsDeReference;

  // Case T : parent isolé → demi-part supplémentaire (uniquement si célib + au moins 1 enfant)
  const isCaseT = isSingleParent && maritalStatus === "celibataire" && dependentChildren >= 1;
  if (isCaseT) parts += 0.5;

  if (dependentChildren >= 1) parts += 0.5;
  if (dependentChildren >= 2) parts += 0.5;
  if (dependentChildren >= 3) parts += dependentChildren - 2;

  return { parts, partsDeReference };
}
