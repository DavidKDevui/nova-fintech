import { ngapLabel, NGAP_RATES } from "./rates";

// Correspondance (lettre-clé + coefficient) → prestation, d'après la NGAP Titre XVI
// « Soins infirmiers » (arrêté NGAP consolidé, Légifrance / PDF SNIIL juil. 2022 &
// Convergence Infirmière 2024). Couples calés sur ceux réellement présents en base.
//
// ⚠️ Nomenclature conventionnelle susceptible d'évoluer — corriger les libellés ici.
//    Les coefficients élevés (perfusions) se cumulent en dérogation : ex. « AMI 14 + AMI 9 ».

// Libellés dépendant du coefficient (lettre-clé seule insuffisante).
export const ACT_LABELS: Record<string, Record<string, string>> = {
  AMI: {
    "1.5": "Prélèvement sanguin par ponction veineuse",
    "2": "Pansement courant / sondage",
    "4": "Pansement lourd et complexe",
    "9": "Perfusion courte (< 1h)",
    "10": "Perfusion courte — patient immunodéprimé / cancéreux",
    "14": "Perfusion longue (> 1h)",
    "15": "Perfusion longue — patient immunodéprimé / cancéreux",
  },
  AMX: {
    "1": "Soin / injection — patient dépendant (sous BSI)",
    "4": "Pansement lourd et complexe — patient dépendant (sous BSI)",
  },
};

// Libellé générique par lettre-clé (coefficient non discriminant ou couple non répertorié).
// Conforme à la règle validée : tout couple inconnu retombe sur un libellé générique.
const GENERIC_LABELS: Record<string, string> = {
  AMI: "Soins infirmiers (AMI)",
  AMX: "Soins — patient dépendant (AMX)",
  AIS: "Séance de soins infirmiers (AIS)",
  BSA: "Bilan de soins infirmiers (BSI) — charge légère",
  BSB: "Bilan de soins infirmiers (BSI) — charge moyenne",
  BSC: "Bilan de soins infirmiers (BSI) — charge lourde",
  DI: "Démarche de soins infirmiers",
};

/**
 * Libellé « prestation » d'un acte à partir de sa lettre-clé et de son coefficient.
 * Repli : libellé exact (code+coef) → générique par lettre-clé → libellé NGAP de la lettre-clé.
 */
export function actLabel(code: string, coefficient: number): string {
  return ACT_LABELS[code]?.[String(coefficient)] ?? GENERIC_LABELS[code] ?? ngapLabel(code);
}

export interface NgapCatalogEntry {
  /** Clé stable (code:coefficient), alignée sur celle des passages réels. */
  key: string;
  code: string;
  coefficient: number;
  /** Code court affiché (ex. "AMI 1.5", ou "DI" si coefficient 1). */
  short: string;
  label: string;
  /** Tarif conventionnel = tarif de la lettre-clé × coefficient (acte sec, hors déplacement). */
  unitPrice: number;
}

/**
 * Catalogue des actes de soin NGAP chiffrables, au tarif conventionnel.
 * - Pour les lettres-clés dont le prix dépend du coefficient (AMI, AMX), on émet
 *   les couples explicitement répertoriés dans ACT_LABELS.
 * - Pour les autres actes (forfaits à coefficient 1 : DI, BSA/B/C, AIS…), un
 *   seul couple au coefficient 1.
 * Sert de second niveau au menu de saisie manuelle (actes jamais facturés).
 */
export function ngapActCatalog(): NgapCatalogEntry[] {
  const out: NgapCatalogEntry[] = [];
  for (const [code, rate] of Object.entries(NGAP_RATES)) {
    if (rate.kind !== "acte" || rate.unitPrice == null) continue;
    const coefficients = ACT_LABELS[code] ? Object.keys(ACT_LABELS[code]).map(Number) : [1];
    for (const coefficient of coefficients) {
      out.push({
        key: `${code}:${coefficient}`,
        code,
        coefficient,
        short: coefficient === 1 ? code : `${code} ${coefficient}`,
        label: actLabel(code, coefficient),
        unitPrice: Math.round(rate.unitPrice * coefficient * 100) / 100,
      });
    }
  }
  return out;
}
