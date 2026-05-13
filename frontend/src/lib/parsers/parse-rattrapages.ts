export interface ParsedCarePassage {
  clientName: string;
  invoiceNumber: string;
  careDate: string;       // YYYY-MM-DD
  careMoment: string;     // matin, midi, soir, nuit, 07h30, etc.
  practitioner: string;
  cotation: string;
  status: "a_securiser" | "a_envoyer";
  honoraires: string;
  majoration: string;
  ferieDimNuit: string;
  ifd: string;
  total: string;
}

export interface ParsedBordereau {
  cabinetName: string;
  periodStart: string;
  periodEnd: string;
  status: "a_securiser" | "a_envoyer";
  practitioners: string[];
  passages: ParsedCarePassage[];
}

// Match a date like "12/08/2025" at the start of a line
const DATE_REGEX = /^(\d{2}\/\d{2}\/\d{4})\s+(matin|midi|soir|nuit|\d{2}h\d{2})/;

// Match euro amounts like "12,60 €" or "1  069,20 €" or "0,00 €"
const AMOUNT_REGEX = /(\d[\d\s]*,\d{2})\s*€/g;

// Match the footer
const FOOTER_REGEX = /^Document édité par OZZEN/;
const PAGE_NUM_REGEX = /^\d+\/\d+$/;

// Match patient section header
const PATIENT_HEADER_REGEX = /^Détail des passages pour (.+)$/;

// Match "Total chiffre d'affaire" lines
const TOTAL_REGEX = /^Total chiffre d'affaire/;

// Match table header line
const TABLE_HEADER_REGEX = /^DateEffectué par|^DateHonoraires/;

// Match the summary section header
const SUMMARY_HEADER_REGEX = /^Relevé mensuel$/;

function parseDate(dateStr: string): string {
  const [d, m, y] = dateStr.split("/");
  return `${y}-${m}-${d}`;
}

function cleanAmount(amount: string): string {
  // Remove spaces (including non-breaking spaces) and convert comma to dot
  return amount.replace(/\s/g, "").replace(",", ".");
}

function extractAmounts(text: string): string[] {
  const matches: string[] = [];
  let match;
  const regex = new RegExp(AMOUNT_REGEX.source, "g");
  while ((match = regex.exec(text)) !== null) {
    matches.push(cleanAmount(match[1]!));
  }
  return matches;
}

// Known practitioner names from the header to help with parsing
function parseLine(
  line: string,
  knownPractitioners: string[],
  lastContext: { date: string; moment: string; practitioner: string } | null,
  currentPatient: string
): { passage: ParsedCarePassage; context: { date: string; moment: string; practitioner: string } } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (FOOTER_REGEX.test(trimmed)) return null;
  if (PAGE_NUM_REGEX.test(trimmed)) return null;
  if (PATIENT_HEADER_REGEX.test(trimmed)) return null;
  if (TOTAL_REGEX.test(trimmed)) return null;
  if (TABLE_HEADER_REGEX.test(trimmed)) return null;
  if (SUMMARY_HEADER_REGEX.test(trimmed)) return null;

  // Extract amounts from the line
  const amounts = extractAmounts(trimmed);
  if (amounts.length < 5) return null; // Need at least honoraires, majo, ferie, ifd, total

  const lastAmounts = amounts.slice(-5);

  // Check if line starts with a date (normal line) or not (continuation line)
  const dateMatch = trimmed.match(DATE_REGEX);

  let careDate: string;
  let careMoment: string;
  let practitioner: string;
  let restOfLine: string;

  if (dateMatch) {
    // Normal line: starts with date
    careDate = parseDate(dateMatch[1]!);
    careMoment = dateMatch[2]!;

    // Everything after the date+moment is the rest
    restOfLine = trimmed.slice(dateMatch[0].length);

    // Find the practitioner name
    practitioner = "";
    for (const name of knownPractitioners) {
      if (restOfLine.startsWith(name)) {
        practitioner = name;
        restOfLine = restOfLine.slice(name.length);
        break;
      }
    }

    if (!practitioner) {
      // Try to find practitioner by looking for where the cotation/invoice number starts
      // Cotations typically start with AMI, AMX, BSC, BSB, DI, IFI, or (
      const cotationStart = restOfLine.search(/(?:AMI|AMX|BSC|BSB|DI |IFI|\()/);
      if (cotationStart > 0) {
        practitioner = restOfLine.slice(0, cotationStart).trim();
        restOfLine = restOfLine.slice(cotationStart);
      }
    }
  } else if (lastContext) {
    // Continuation line: no date, use last context
    careDate = lastContext.date;
    careMoment = lastContext.moment;
    practitioner = lastContext.practitioner;
    restOfLine = trimmed;
  } else {
    return null;
  }

  // Extract invoice number: 4-digit number immediately followed by "À sécuriser" or "À envoyer"
  const invoiceMatch = restOfLine.match(/(\d{4})(?=À sécuriser|À envoyer)/);
  const invoiceNumber = invoiceMatch ? invoiceMatch[1]! : "";

  // Extract cotation: everything before the invoice number
  let cotation = "";
  if (invoiceMatch && invoiceMatch.index !== undefined) {
    cotation = restOfLine.slice(0, invoiceMatch.index).trim();
  }

  const context = { date: careDate, moment: careMoment, practitioner };

  return {
    passage: {
      clientName: currentPatient,
      invoiceNumber,
      careDate,
      careMoment,
      practitioner,
      cotation,
      status: restOfLine.includes("À sécuriser") ? "a_securiser" : "a_envoyer",
      honoraires: lastAmounts[0]!,
      majoration: lastAmounts[1]!,
      ferieDimNuit: lastAmounts[2]!,
      ifd: lastAmounts[3]!,
      total: lastAmounts[4]!,
    },
    context,
  };
}

export function parseRattrapages(text: string): ParsedBordereau {
  const lines = text.split("\n");

  // Extract header info
  let cabinetName = "";
  let periodStart = "";
  let periodEnd = "";
  let status: "a_securiser" | "a_envoyer" = "a_securiser";
  const practitionersList: string[] = [];

  // Parse header
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i]!.trim();

    const periodMatch = line.match(/Période de facturation du (\d{2}\/\d{2}\/\d{2}) au (\d{2}\/\d{2}\/\d{2})/);
    if (periodMatch) {
      // Convert DD/MM/YY to YYYY-MM-DD
      const [d1, m1, y1] = periodMatch[1]!.split("/");
      const [d2, m2, y2] = periodMatch[2]!.split("/");
      periodStart = `20${y1}-${m1}-${d1}`;
      periodEnd = `20${y2}-${m2}-${d2}`;
    }

    if (line.startsWith("Cabinet ")) {
      cabinetName = line.replace("Cabinet ", "").trim();
    }

    if (line.startsWith("Effectués par ")) {
      const names = line.replace("Effectués par ", "");
      // Check next line for continuation
      const nextLine = lines[i + 1]?.trim() || "";
      const fullNames = nextLine && !nextLine.startsWith("Avec ") ? names + " " + nextLine : names;
      practitionersList.push(
        ...fullNames.split(",").map((n) => n.trim()).filter(Boolean)
      );
    }

    if (line.includes("à sécuriser")) status = "a_securiser";
    if (line.includes("à envoyer")) status = "a_envoyer";
  }

  // Sort practitioners by name length descending (longest first for matching)
  const sortedPractitioners = [...practitionersList].sort((a, b) => b.length - a.length);

  // Find where the detail sections start
  const detailStartIdx = text.indexOf("Détail des passages pour");
  if (detailStartIdx === -1) {
    return { cabinetName, periodStart, periodEnd, status, practitioners: practitionersList, passages: [] };
  }

  const detailText = text.slice(detailStartIdx);
  const detailLines = detailText.split("\n");

  const passages: ParsedCarePassage[] = [];
  let lastContext: { date: string; moment: string; practitioner: string } | null = null;
  let currentPatient = "";

  for (const line of detailLines) {
    const trimmed = line.trim();

    // Skip empty lines, headers, footers, totals
    if (!trimmed) continue;
    const patientMatch = trimmed.match(PATIENT_HEADER_REGEX);
    if (patientMatch) {
      currentPatient = patientMatch[1]!.trim();
      lastContext = null; // Reset context for new patient
      continue;
    }
    if (TOTAL_REGEX.test(trimmed)) continue;
    if (TABLE_HEADER_REGEX.test(trimmed)) continue;
    if (FOOTER_REGEX.test(trimmed)) continue;
    if (PAGE_NUM_REGEX.test(trimmed)) continue;
    if (trimmed.startsWith("Ozzen,") || trimmed.startsWith("RCS Paris")) continue;

    const result = parseLine(trimmed, sortedPractitioners, lastContext, currentPatient);
    if (result) {
      passages.push(result.passage);
      lastContext = result.context;
    }
  }

  return {
    cabinetName,
    periodStart,
    periodEnd,
    status,
    practitioners: practitionersList,
    passages,
  };
}
