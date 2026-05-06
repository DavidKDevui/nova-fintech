// ── Barèmes CARPIMKO 2024 ──
// Source : carpimko.com/cotisations
// Ces barèmes sont mis à jour annuellement.
// TODO: externaliser dans un fichier de config ou en base pour mise à jour sans redéploiement.

const BAREME = {
  2024: {
    pss: 46_368, // Plafond Sécurité Sociale annuel

    // Retraite complémentaire — forfaitaire par tranche de revenus
    retraiteComplementaire: {
      tranche1: { plafond: 39_732, montant: 2_432 },
      tranche2: { plafond: 158_928, taux: 0.03 },
    },

    // ASV (Avantage Supplémentaire Vieillesse)
    asv: {
      forfaitaire: 636,
      proportionnel: { plafond: 231_840, taux: 0.004 },
    },

    // Invalidité-décès — forfaitaire
    invaliditeDeces: 776,

    // Indemnités journalières
    indemnitesJournalieres: {
      plafond: 139_104, // 3 × PSS
      taux: 0.003,
      minimum: 139,
    },
  },

  2025: {
    pss: 47_100,

    retraiteComplementaire: {
      tranche1: { plafond: 40_359, montant: 2_472 },
      tranche2: { plafond: 161_436, taux: 0.03 },
    },

    asv: {
      forfaitaire: 648,
      proportionnel: { plafond: 235_500, taux: 0.004 },
    },

    invaliditeDeces: 790,

    indemnitesJournalieres: {
      plafond: 141_300,
      taux: 0.003,
      minimum: 141,
    },
  },
} as const;

type Annee = keyof typeof BAREME;

export type CarpimkoResult = {
  retraiteComplementaire: number;
  asv: number;
  invaliditeDeces: number;
  indemnitesJournalieres: number;
  totalCarpimko: number;
};

function getBareme(annee: number) {
  const b = BAREME[annee as Annee];
  if (b) return b;

  // Fallback : utiliser le barème de l'année la plus récente disponible
  const annees = Object.keys(BAREME).map(Number).sort((a, b) => b - a);
  const fallback = BAREME[annees[0] as Annee];
  if (!fallback) {
    throw new Error(`Aucun barème CARPIMKO disponible.`);
  }
  return fallback;
}

// ── Calculs ──

function calculerRetraiteComplementaire(revenu: number, bareme: typeof BAREME[Annee]): number {
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

function calculerASV(revenu: number, bareme: typeof BAREME[Annee]): number {
  const { forfaitaire, proportionnel } = bareme.asv;
  const assiette = Math.min(revenu, proportionnel.plafond);
  return forfaitaire + assiette * proportionnel.taux;
}

function calculerIndemnitesJournalieres(revenu: number, bareme: typeof BAREME[Annee]): number {
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
