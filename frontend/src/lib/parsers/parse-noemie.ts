export interface ParsedNoemiePayment {
  invoiceType: string;      // "FSE" | "DRE"
  invoiceNumber: string;    // "149"
  clientName: string;       // "SAIDANI JELLALI"
  paymentDate: string;      // YYYY-MM-DD (date comptable)
  invoiceDate: string;      // YYYY-MM-DD (date facture)
  paymentRef: string;       // référence de virement
  amountBilled: string;     // "56.45"
  amountPaid: string;       // "0.00"
  status: "paid" | "rejected";
  rejectionReason: string | null;
  payerType: "c" | "m";    // caisse or mutuelle
}

export interface ParsedNoemie {
  finess: string;
  periodStart: string;
  periodEnd: string;
  payments: ParsedNoemiePayment[];
}

// Format extrait par pdf-parse : champs collés sans espaces séparateurs
// Ex: "FSE 149022ALI NATHRATI29303985130054823/04/2014  131/12/2024Vir. effectué289,36 €289,36 €"
// Ex: "FSE 397AAAMICHEL16409593505661323/09/1964  102/05/2025Vir. effectué81,70 €81,70 €"
// Invoice (3-4 chiffres) + Lot (numérique ou alpha), puis nom en majuscules
// Lot numérique : invoice+lot = bloc de 5-7 chiffres
const FACTURE_LINE_NUMERIC_LOT = /^(FSE|DRE)\s+(\d{5,7})([A-Za-zÀ-ü][A-Za-zÀ-ü\s'-]*?)(\d{13,15})(\d{2}\/\d{2}\/\d{4})\s+(\d)(\d{2}\/\d{2}\/\d{4})(Vir\. effectué|Rejeté)([\d\s,]+€)([\d\s,]+€)$/;
// Lot alphabétique : invoice (3-4 chiffres) + lot (2-3 lettres)
const FACTURE_LINE_ALPHA_LOT = /^(FSE|DRE)\s+(\d{3,4}[A-Za-z]{2,3})([A-Za-zÀ-ü][A-Za-zÀ-ü\s'-]*?)(\d{13,15})(\d{2}\/\d{2}\/\d{4})\s+(\d)(\d{2}\/\d{2}\/\d{4})(Vir\. effectué|Rejeté)([\d\s,]+€)([\d\s,]+€)$/;

const CAISSE_KEYWORDS = ["CPAM", "CGSS", "CNAM", "CRAMIF", "MSA"];

function parseDate(dateStr: string): string {
  const [d, m, y] = dateStr.split("/");
  return `${y}-${m}-${d}`;
}

function cleanAmount(amountStr: string): string {
  return amountStr.replace(/\s/g, "").replace("€", "").replace(",", ".").trim();
}

function detectPayerType(ref: string): "c" | "m" {
  const upper = ref.toUpperCase();
  for (const kw of CAISSE_KEYWORDS) {
    if (upper.includes(kw)) return "c";
  }
  return "m";
}

export function parseNoemie(text: string): ParsedNoemie {
  const lines = text.split("\n");

  // Extract header
  let finess = "";
  let periodStart = "";
  let periodEnd = "";

  const finessMatch = text.match(/Numéro Finess\s*:\s*(\d+)/);
  if (finessMatch) finess = finessMatch[1]!;

  const periodMatch = text.match(/Période du (\d{2}\/\d{2}\/\d{4}) au (\d{2}\/\d{2}\/\d{4})/);
  if (periodMatch) {
    periodStart = parseDate(periodMatch[1]!);
    periodEnd = parseDate(periodMatch[2]!);
  }

  // Parse sections
  const payments: ParsedNoemiePayment[] = [];
  let currentPaymentDate = "";
  let currentPaymentRef = "";
  let currentPayerType: "c" | "m" = "m";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();

    // Section header: "Date comptable du : DD/MM/YYYY"
    const dateMatch = line.match(/^Date comptable du\s*:\s*(\d{2}\/\d{2}\/\d{4})$/);
    if (dateMatch) {
      currentPaymentDate = parseDate(dateMatch[1]!);
      continue;
    }

    // Payment reference
    const refMatch = line.match(/^Référence de virement\s*:\s*(.+)$/);
    if (refMatch) {
      currentPaymentRef = refMatch[1]!.trim();
      currentPayerType = detectPayerType(currentPaymentRef);
      continue;
    }

    // Facture line
    const factureMatch = line.match(FACTURE_LINE_NUMERIC_LOT) || line.match(FACTURE_LINE_ALPHA_LOT);
    if (factureMatch) {
      const status = factureMatch[8] === "Vir. effectué" ? "paid" : "rejected";

      // Check for rejection reason on next line
      let rejectionReason: string | null = null;
      if (status === "rejected") {
        const nextLine = lines[i + 1]?.trim() || "";
        if (nextLine && !nextLine.startsWith("Document") && !nextLine.startsWith("FSE") && !nextLine.startsWith("DRE") && !nextLine.startsWith("Date") && !nextLine.startsWith("Facture")) {
          rejectionReason = nextLine;
        }
      }

      // Le groupe 2 contient invoice+lot combinés (ex: "149022" ou "397AAA")
      // Le lot est toujours les 3 derniers caractères, l'invoice est le reste
      const invoiceLotBlock = factureMatch[2]!;
      const invoiceNumber = invoiceLotBlock.slice(0, -3);

      payments.push({
        invoiceType: factureMatch[1]!,
        invoiceNumber,
        clientName: factureMatch[3]!.trim(),
        paymentDate: currentPaymentDate,
        invoiceDate: parseDate(factureMatch[7]!),
        paymentRef: currentPaymentRef,
        amountBilled: cleanAmount(factureMatch[9]!),
        amountPaid: cleanAmount(factureMatch[10]!),
        status,
        rejectionReason,
        payerType: currentPayerType,
      });
    }
  }

  return { finess, periodStart, periodEnd, payments };
}
