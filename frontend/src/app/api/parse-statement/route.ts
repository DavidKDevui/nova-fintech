import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { parseRattrapages } from "@/lib/parsers/parse-rattrapages";
import { parseNoemie } from "@/lib/parsers/parse-noemie";
import { detectDocument } from "@/lib/parsers/detect-document";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse");

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.accountType !== "admin") {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Aucun fichier fourni" });
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Format non supporte. Utilisez un fichier PDF." });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const data = await pdfParse(buffer);

    const detection = detectDocument(data.text);

    if (!detection.isOzzen) {
      return NextResponse.json({ error: "Ce document ne provient pas d'Ozzen." });
    }

    if (detection.type === "releve_mensuel") {
      return NextResponse.json({ error: "Ce document est un releve mensuel. Veuillez importer un bordereau de rattrapages ou de retours Noemie." });
    }

    if (detection.type === "unknown") {
      return NextResponse.json({ error: "Type de document Ozzen non reconnu." });
    }

    if (detection.type === "noemie") {
      const result = parseNoemie(data.text);

      if (result.payments.length === 0) {
        return NextResponse.json({ error: "Aucun paiement trouve dans ce document." });
      }

      return NextResponse.json({
        fileHash,
        documentType: "noemie",
        finess: result.finess,
        periodStart: result.periodStart,
        periodEnd: result.periodEnd,
        payments: result.payments,
      });
    }

    // rattrapage
    const result = parseRattrapages(data.text);

    if (result.passages.length === 0) {
      return NextResponse.json({ error: "Aucun passage trouve dans ce document." });
    }

    return NextResponse.json({
      fileHash,
      documentType: "rattrapage",
      cabinetName: result.cabinetName,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      status: result.status,
      practitioners: result.practitioners,
      passages: result.passages,
    });
  } catch (err) {
    console.error("[PARSE] Error:", err);
    return NextResponse.json({ error: "Erreur lors de l'analyse du fichier PDF." });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
