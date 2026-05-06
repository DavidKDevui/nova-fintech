export type OzzenDocumentType = "rattrapage" | "noemie" | "releve_mensuel" | "unknown";

export interface DocumentDetection {
  isOzzen: boolean;
  type: OzzenDocumentType;
}

export function detectDocument(text: string): DocumentDetection {
  const isOzzen = text.includes("OZZEN SAS") || text.includes("ozzen");

  if (!isOzzen) {
    return { isOzzen: false, type: "unknown" };
  }

  if (text.includes("Bordereau des retours Noémie") || text.includes("Bordereau des retours Noemie")) {
    return { isOzzen: true, type: "noemie" };
  }

  if (text.includes("Détail des passages pour") && text.includes("Cotation")) {
    return { isOzzen: true, type: "rattrapage" };
  }

  if (text.includes("Relevé mensuel") && !text.includes("Détail des passages pour")) {
    return { isOzzen: true, type: "releve_mensuel" };
  }

  return { isOzzen: true, type: "unknown" };
}
