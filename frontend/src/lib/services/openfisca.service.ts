const OPENFISCA_API_URL = process.env.OPENFISCA_API_URL || "https://api.fr.openfisca.org/latest";
const OPENFISCA_TIMEOUT_MS = 15_000;

// ── Cache mémoire (par process) ──
//
// OpenFisca est une API publique distante : chaque appel coûte de quelques
// centaines de ms à plusieurs secondes. Avant ce cache, CHAQUE estimation de
// cotisations refaisait deux appels (PASS + /calculate), et une page en
// déclenchait jusqu'à cinq → plusieurs secondes de latence par navigation.
//
//  - Paramètres (PASS, SMIC) : valeurs légales annuelles, quasi immuables →
//    cache long (24 h) pour absorber une éventuelle correction publiée.
//  - Simulations : déterministes pour un triplet (revenu, année, régime) →
//    cache 6 h, borné en taille (LRU simple) car les revenus varient.
//  - Les appels en cours sont dédupliqués (deux consommateurs simultanés du
//    même calcul partagent la même promesse).
//  - Les échecs ne sont JAMAIS mis en cache : l'appelant garde son fallback.

const PARAMETER_TTL_MS = 24 * 60 * 60 * 1000;
const SIMULATION_TTL_MS = 6 * 60 * 60 * 1000;
const SIMULATION_MAX_ENTRIES = 500;

type CacheEntry<T> = { value: T; expiresAt: number };

const parameterCache = new Map<string, CacheEntry<OpenFiscaParameterResponse>>();
const simulationCache = new Map<string, CacheEntry<OpenFiscaResult>>();
const inflight = new Map<string, Promise<unknown>>();

function readCache<T>(store: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

function writeCache<T>(store: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number, maxEntries?: number) {
  if (maxEntries && store.size >= maxEntries) {
    // Éviction du plus ancien (ordre d'insertion des Map = FIFO, suffisant ici).
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Déduplique les appels concurrents sur une même clé. */
function dedupe<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const p = factory().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

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

/** Historique d'un paramètre OpenFisca, mis en cache par process. */
async function getParameter(path: string): Promise<OpenFiscaParameterResponse> {
  const cached = readCache(parameterCache, path);
  if (cached) return cached;
  return dedupe(`param:${path}`, async () => {
    const response = await openfiscaFetch<OpenFiscaParameterResponse>(path);
    writeCache(parameterCache, path, response, PARAMETER_TTL_MS);
    return response;
  });
}

/** Valeur applicable au 1er janvier de l'année : la plus récente dont la date est <= à cette date. */
function applicableValueForYear(response: OpenFiscaParameterResponse, annee: number): number {
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

/**
 * Récupère le Plafond Annuel de la Sécurité Sociale (PASS) pour une année donnée.
 * Endpoint : /parameter/prelevements_sociaux.pss.plafond_securite_sociale_annuel
 */
export async function getPlafondSecuriteSociale(annee: number): Promise<number> {
  const response = await getParameter("/parameter/prelevements_sociaux.pss.plafond_securite_sociale_annuel");
  return applicableValueForYear(response, annee);
}

/**
 * Récupère le SMIC brut mensuel pour une année donnée.
 * Endpoint : /parameter/marche_travail.salaire_minimum.smic.smic_b_mensuel
 */
export async function getSmicMensuel(annee: number): Promise<number> {
  const response = await getParameter("/parameter/marche_travail.salaire_minimum.smic.smic_b_mensuel");
  return applicableValueForYear(response, annee);
}

export async function simulerCotisationsURSSAF(input: OpenFiscaInput): Promise<OpenFiscaResult> {
  // Le revenu est arrondi à l'euro pour la clé : les appelants passent des
  // montants déjà arrondis, et un centime d'écart ne change pas la cotisation.
  const key = `${Math.round(input.revenuAnnuel)}|${input.annee}|${input.regime}`;
  const cached = readCache(simulationCache, key);
  if (cached) return cached;

  return dedupe(`sim:${key}`, async () => {
    const payload = buildSimulationPayload(input);
    const response = await openfiscaFetch<Record<string, unknown>>("/calculate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const result = extractResult(response, input.annee);
    writeCache(simulationCache, key, result, SIMULATION_TTL_MS, SIMULATION_MAX_ENTRIES);
    return result;
  });
}
