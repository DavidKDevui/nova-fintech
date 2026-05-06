import { simulerCotisationsURSSAF, type OpenFiscaInput, type OpenFiscaResult } from "./openfisca.service";
import { calculerCotisationsCarpimko, type CarpimkoResult } from "./carpimko.service";

// ── Types ──

type TaxRegime = "bnc" | "micro_bnc";

export type SimulationInput = {
  revenuAnnuel: number;
  annee: number;
  regime: TaxRegime;
};

export type SimulationResult = {
  input: SimulationInput;
  urssaf: OpenFiscaResult;
  carpimko: CarpimkoResult;
  totalCotisations: number;
  tauxGlobal: number; // pourcentage du revenu
};

// ── Validation ──

function validerInput(input: SimulationInput) {
  if (!input.revenuAnnuel || input.revenuAnnuel < 0) {
    throw new Error("Le revenu annuel doit être un nombre positif");
  }
  if (!input.annee || input.annee < 2020 || input.annee > 2030) {
    throw new Error("L'année doit être comprise entre 2020 et 2030");
  }
  if (!["bnc", "micro_bnc"].includes(input.regime)) {
    throw new Error("Le régime fiscal doit être 'bnc' ou 'micro_bnc'");
  }
}

// ── Revenu net pour CARPIMKO ──
// En micro-BNC, le revenu soumis aux cotisations = CA × (1 - 34%)
// En BNC réel, c'est directement le bénéfice déclaré

const ABATTEMENT_MICRO_BNC = 0.34;

function revenuNetCotisations(revenu: number, regime: TaxRegime): number {
  if (regime === "micro_bnc") {
    return revenu * (1 - ABATTEMENT_MICRO_BNC);
  }
  return revenu;
}

// ── Service principal ──

export async function simulerCotisationsIDEL(input: SimulationInput): Promise<SimulationResult> {
  validerInput(input);

  const revenuNet = revenuNetCotisations(input.revenuAnnuel, input.regime);

  // OpenFisca gère l'abattement micro-BNC en interne,
  // CARPIMKO reçoit le revenu net
  const openfiscaInput: OpenFiscaInput = {
    revenuAnnuel: input.revenuAnnuel,
    annee: input.annee,
    regime: input.regime,
  };

  const [urssaf, carpimko] = await Promise.all([
    simulerCotisationsURSSAF(openfiscaInput),
    Promise.resolve(calculerCotisationsCarpimko(revenuNet, input.annee)),
  ]);

  const totalCotisations = Math.round((urssaf.totalCotisationsOpenFisca + carpimko.totalCarpimko) * 100) / 100;
  const tauxGlobal = revenuNet > 0
    ? Math.round((totalCotisations / revenuNet) * 10000) / 100
    : 0;

  return {
    input,
    urssaf,
    carpimko,
    totalCotisations,
    tauxGlobal,
  };
}
