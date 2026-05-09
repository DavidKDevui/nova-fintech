import taxesData from "@/lib/constants/taxes.json";

// ── Barèmes CARPIMKO ──
// Source : carpimko.com/cotisations
// Barèmes externalisés dans /lib/constants/taxes.json

const BAREME = taxesData.carpimko as Record<string, Bareme>;

type Bareme = {
  retraiteComplementaire: {
    tranche1: { plafond: number; montant: number };
    tranche2: { plafond: number; taux: number };
  };
  asv: {
    forfaitaire: number;
    proportionnel: { plafond: number; taux: number };
  };
  invaliditeDeces: number;
  indemnitesJournalieres: {
    plafond: number;
    taux: number;
    minimum: number;
  };
};

export type CarpimkoResult = {
  retraiteComplementaire: number;
  asv: number;
  invaliditeDeces: number;
  indemnitesJournalieres: number;
  totalCarpimko: number;
};

function getBareme(annee: number): Bareme {
  const b = BAREME[String(annee)];
  if (b) return b;

  // Fallback : utiliser le barème de l'année la plus récente disponible
  const annees = Object.keys(BAREME).map(Number).sort((a, b) => b - a);
  const fallback = BAREME[String(annees[0])];
  if (!fallback) {
    throw new Error(`Aucun barème CARPIMKO disponible.`);
  }
  return fallback;
}

// ── Calculs ──

function calculerRetraiteComplementaire(revenu: number, bareme: Bareme): number {
  const { tranche1, tranche2 } = bareme.retraiteComplementaire;

  // Tranche 1 : montant forfaitaire
  let montant = tranche1.montant;

  // Tranche 2 : proportionnel sur revenus au-delà du plafond T1
  if (revenu > tranche1.plafond) {
    const assiette = Math.min(revenu, tranche2.plafond) - tranche1.plafond;
    montant += assiette * tranche2.taux;
  }

  return montant;
}

function calculerASV(revenu: number, bareme: Bareme): number {
  const { forfaitaire, proportionnel } = bareme.asv;
  const assiette = Math.min(revenu, proportionnel.plafond);
  return forfaitaire + assiette * proportionnel.taux;
}

function calculerIndemnitesJournalieres(revenu: number, bareme: Bareme): number {
  const { plafond, taux, minimum } = bareme.indemnitesJournalieres;
  const assiette = Math.min(revenu, plafond);
  return Math.max(assiette * taux, minimum);
}

export function calculerCotisationsCarpimko(revenu: number, annee: number): CarpimkoResult {
  const bareme = getBareme(annee);

  const retraiteComplementaire = calculerRetraiteComplementaire(revenu, bareme);
  const asv = calculerASV(revenu, bareme);
  const invaliditeDeces = bareme.invaliditeDeces;
  const indemnitesJournalieres = calculerIndemnitesJournalieres(revenu, bareme);

  return {
    retraiteComplementaire: Math.round(retraiteComplementaire * 100) / 100,
    asv: Math.round(asv * 100) / 100,
    invaliditeDeces,
    indemnitesJournalieres: Math.round(indemnitesJournalieres * 100) / 100,
    totalCarpimko: Math.round((retraiteComplementaire + asv + invaliditeDeces + indemnitesJournalieres) * 100) / 100,
  };
}
