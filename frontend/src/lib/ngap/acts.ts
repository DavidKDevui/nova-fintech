import { ngapLabel } from "./rates";

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
