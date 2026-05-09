const OPENFISCA_API_URL = process.env.OPENFISCA_API_URL || "https://api.fr.openfisca.org/latest";
const OPENFISCA_TIMEOUT_MS = 15_000;

// ── Types ──

type TaxRegime = "bnc" | "micro_bnc";

export type OpenFiscaInput = {
  revenuAnnuel: number;
  annee: number;
  regime: TaxRegime;
};

export type OpenFiscaResult = {
  maladieMaterniteProfessionLiberale: number;
  allocationssFamiliales: number;
  csgDeductible: number;
  csgImposable: number;
  crds: number;
  retraiteBase: number;
  formationProfessionnelle: number;
  totalCotisationsOpenFisca: number;
};

// ── API fetch ──

async function openfiscaFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENFISCA_TIMEOUT_MS);

  try {
    const res = await fetch(`${OPENFISCA_API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenFisca API erreur ${res.status}: ${body}`);
    }

    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ── Simulation ──

function buildSimulationPayload(input: OpenFiscaInput) {
  const { revenuAnnuel, annee, regime } = input;
  const period = String(annee);

  // En micro-BNC, OpenFisca attend le CA brut dans mbnc_impo
  // En BNC réel (déclaration contrôlée), on utilise abnc_impo (bénéfice net)
  const incomeVariables = regime === "micro_bnc"
    ? { mbnc_impo: { [period]: revenuAnnuel } }
    : { abnc_impo: { [period]: revenuAnnuel } };

  return {
    individus: {
      idel: {
        categorie_non_salarie: { [period]: "profession_liberale" },
        ...incomeVariables,
        // Variables à calculer (null = demande le résultat)
        maladie_maternite_profession_liberale: { [period]: null },
        famille_independant: { [period]: null },
        csg_deductible_non_salarie: { [period]: null },
        csg_imposable_non_salarie: { [period]: null },
        crds_non_salarie: { [period]: null },
        vieillesse_profession_liberale: { [period]: null },
        formation_profession_liberale: { [period]: null },
        cotisations_non_salarie: { [period]: null },
      },
    },
    familles: {
      famille_1: { parents: ["idel"] },
    },
    foyers_fiscaux: {
      foyer_1: { declarants: ["idel"] },
    },
    menages: {
      menage_1: { personne_de_reference: ["idel"] },
    },
  };
}

function extractResult(response: Record<string, unknown>, annee: number): OpenFiscaResult {
  const period = String(annee);
  const individu = (response as { individus: { idel: Record<string, Record<string, number>> } }).individus.idel;

  const get = (key: string): number => Math.abs(individu[key]?.[period] ?? 0);

  return {
    maladieMaterniteProfessionLiberale: get("maladie_maternite_profession_liberale"),
    allocationssFamiliales: get("famille_independant"),
    csgDeductible: get("csg_deductible_non_salarie"),
    csgImposable: get("csg_imposable_non_salarie"),
    crds: get("crds_non_salarie"),
    retraiteBase: get("vieillesse_profession_liberale"),
    formationProfessionnelle: get("formation_profession_liberale"),
    totalCotisationsOpenFisca: get("cotisations_non_salarie"),
  };
}

// ── Paramètres ──

type OpenFiscaParameterResponse = {
  values: Record<string, number>;
};

/**
 * Récupère le Plafond Annuel de la Sécurité Sociale (PASS) pour une année donnée.
 * Endpoint : /parameter/prelevements_sociaux.pss.plafond_securite_sociale_annuel
 */
export async function getPlafondSecuriteSociale(annee: number): Promise<number> {
  const response = await openfiscaFetch<OpenFiscaParameterResponse>(
    "/parameter/prelevements_sociaux.pss.plafond_securite_sociale_annuel"
  );

  // Trouver la valeur applicable : la plus récente dont la date est <= au 1er janvier de l'année
  const targetDate = `${annee}-01-01`;
  let applicableValue = 0;

  const sortedDates = Object.keys(response.values).sort();
  for (const date of sortedDates) {
    if (date <= targetDate) {
      applicableValue = response.values[date];
    }
  }

  return applicableValue;
}

export async function simulerCotisationsURSSAF(input: OpenFiscaInput): Promise<OpenFiscaResult> {
  const payload = buildSimulationPayload(input);

  const response = await openfiscaFetch<Record<string, unknown>>("/calculate", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return extractResult(response, input.annee);
}
