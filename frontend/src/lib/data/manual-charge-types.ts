// Liste des types de charges professionnelles saisissables à la main dans
// « Mon activité » (onglet Gestion). Module pur (aucune dépendance DB / serveur)
// pour être importable côté client (menu déroulant) ET côté serveur (validation).
//
// Pour ajouter un type : ajouter une entrée ici. Aucune migration nécessaire —
// `chargeType` est stocké en varchar (cf. table `practitioner_manual_charges`).

export const MANUAL_CHARGE_TYPES = [
  { key: "vehicule_leasing", label: "Voiture (leasing)" },
  { key: "deplacements", label: "Carburant / déplacements" },
  { key: "loyer_cabinet", label: "Loyer cabinet" },
  { key: "materiel_medical", label: "Matériel médical" },
  { key: "petit_equipement", label: "Petit équipement" },
  { key: "assurance_rcp", label: "Assurance RCP" },
  { key: "teletransmission", label: "Télétransmission" },
  { key: "formation", label: "Formation" },
  { key: "expert_comptable", label: "Expert-comptable" },
  { key: "frais_bancaires", label: "Frais bancaires" },
  { key: "autre", label: "Autre" },
] as const;

export type ManualChargeTypeKey = (typeof MANUAL_CHARGE_TYPES)[number]["key"];

export const MANUAL_CHARGE_TYPE_KEYS: readonly string[] = MANUAL_CHARGE_TYPES.map((t) => t.key);

export function isManualChargeType(key: string): key is ManualChargeTypeKey {
  return MANUAL_CHARGE_TYPE_KEYS.includes(key);
}

export function manualChargeLabel(key: string): string {
  return MANUAL_CHARGE_TYPES.find((t) => t.key === key)?.label ?? key;
}
