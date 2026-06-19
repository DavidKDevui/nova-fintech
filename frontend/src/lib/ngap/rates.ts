// Référentiel NGAP — Métropole (v1).
//
// Source : grille conventionnelle des actes infirmiers (lettres-clés + tarifs).
// ⚠️ Tarifs conventionnels susceptibles d'évoluer chaque année — à mettre à jour ici.
//    DOM/Mayotte non gérés en v1 (uniquement Métropole).
//
// `kind` distingue :
//   - "acte"       : acte de soin facturable seul → peut être la lettre-clé PRINCIPALE d'un passage.
//   - "modificateur": indemnité de déplacement / majoration → vient s'ajouter à un acte.
//
// `unitPrice` est purement informatif en v1 (aucun contrôle de cohérence n'est branché dessus).
// Il peut être null quand la grille fournie ne donne pas de tarif unique (ex. IFA, ou
// majorations de nuit à deux tranches).

export type NgapKind = "acte" | "modificateur";

export interface NgapRate {
  /** Libellé lisible affiché à l'utilisateur. */
  label: string;
  /** Tarif unitaire Métropole en euros, ou null si non défini dans la grille. */
  unitPrice: number | null;
  kind: NgapKind;
}

export const NGAP_RATES: Record<string, NgapRate> = {
  // ── Actes de soin ──
  AMI: { label: "AMI — Actes médico-infirmiers", unitPrice: 3.15, kind: "acte" },
  AMX: { label: "AMX — Actes infirmiers (patient dépendant)", unitPrice: 3.15, kind: "acte" },
  AIS: { label: "AIS — Soins infirmiers", unitPrice: 2.65, kind: "acte" },
  DI: { label: "DI — Démarche de soins infirmiers", unitPrice: 10, kind: "acte" },
  BSA: { label: "BSA — Bilan de soins infirmiers (charge légère)", unitPrice: 13.0, kind: "acte" },
  BSB: { label: "BSB — Bilan de soins infirmiers (charge moyenne)", unitPrice: 18.2, kind: "acte" },
  BSC: { label: "BSC — Bilan de soins infirmiers (charge lourde)", unitPrice: 28.7, kind: "acte" },
  MIE: { label: "MIE — Mise sous insuline / éducation", unitPrice: 3.15, kind: "acte" },
  TLS: { label: "TLS — Télésurveillance (forfait simple)", unitPrice: 10, kind: "acte" },
  TLL: { label: "TLL — Télésurveillance (forfait long)", unitPrice: 12, kind: "acte" },
  TLD: { label: "TLD — Télésurveillance (forfait dense)", unitPrice: 15, kind: "acte" },
  TMI: { label: "TMI — Télésurveillance / acte technique", unitPrice: 3.15, kind: "acte" },

  // ── Indemnités de déplacement ──
  IFD: { label: "IFD — Indemnité forfaitaire de déplacement", unitPrice: 2.75, kind: "modificateur" },
  IFI: { label: "IFI — Indemnité forfaitaire (déplacement)", unitPrice: 2.75, kind: "modificateur" },
  // IFA apparaît dans les bordereaux mais pas dans la grille fournie → tarif inconnu.
  IFA: { label: "IFA — Indemnité forfaitaire de déplacement", unitPrice: null, kind: "modificateur" },
  IK: { label: "IK — Indemnité kilométrique", unitPrice: 0.35, kind: "modificateur" },

  // ── Majorations ──
  MAU: { label: "MAU — Majoration acte unique", unitPrice: 1.35, kind: "modificateur" },
  MCI: { label: "MCI — Majoration de coordination infirmier", unitPrice: 5, kind: "modificateur" },
  // Codes présents dans les bordereaux : N = nuit, F = dimanche / jour férié.
  N: { label: "N — Majoration de nuit", unitPrice: null, kind: "modificateur" },
  F: { label: "F — Majoration dimanche / jour férié", unitPrice: 8.5, kind: "modificateur" },
};

/** Libellé d'un code, avec repli explicite pour un code inconnu. */
export function ngapLabel(code: string): string {
  return NGAP_RATES[code]?.label ?? `${code} — Cotation inconnue`;
}

export function isActe(code: string): boolean {
  // Un code inconnu est traité comme un acte potentiel (il peut porter le passage).
  return NGAP_RATES[code]?.kind !== "modificateur";
}
