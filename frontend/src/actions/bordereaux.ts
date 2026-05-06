"use server";

import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { practices, carePassages, practitioners, statementUploads, carePayments } from "@/lib/db/schema";
import type { ParsedCarePassage } from "@/lib/parsers/parse-rattrapages";
import type { ParsedNoemiePayment } from "@/lib/parsers/parse-noemie";
import { detectAndCreateSuggestions } from "@/actions/practice-links";
import { encrypt, encryptNullable, decrypt } from "@/lib/encryption";

export async function createPracticeFromBordereau(name: string, finess: string) {
  if (!name.trim()) {
    return { error: "Le nom du cabinet est requis" };
  }
  if (!finess.trim()) {
    return { error: "Le numéro FINESS est requis" };
  }

  try {
    const [practice] = await db
      .insert(practices)
      .values({ name: name.trim(), finess: finess.trim() })
      .returning({ id: practices.id, name: practices.name, finess: practices.finess });

    return { practice };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("unique") || message.includes("duplicate")) {
      return { error: "Un cabinet avec ce numéro FINESS existe déjà." };
    }
    console.error("[CREATE PRACTICE] Error:", err);
    return { error: "Erreur lors de la création du cabinet." };
  }
}

export async function importBordereauAction(
  practiceId: string,
  passages: ParsedCarePassage[],
  fileName: string,
  fileHash: string
) {
  if (!practiceId) {
    return { error: "Veuillez sélectionner un cabinet" };
  }

  if (passages.length === 0) {
    return { error: "Aucun passage à importer" };
  }

  if (!fileHash) {
    return { error: "Hash du fichier manquant" };
  }

  // Verify practice exists
  const [practice] = await db
    .select({ id: practices.id })
    .from(practices)
    .where(eq(practices.id, practiceId));

  if (!practice) {
    return { error: "Cabinet introuvable" };
  }

  // Check if this exact file was already imported
  const [existingUpload] = await db
    .select({ id: statementUploads.id })
    .from(statementUploads)
    .where(eq(statementUploads.fileHash, fileHash));

  if (existingUpload) {
    return { error: "Ce fichier a déjà été importé." };
  }

  try {
    // Check for duplicates: fetch existing passages for this practice
    const existing = await db
      .select({
        careDate: carePassages.careDate,
        careMoment: carePassages.careMoment,
        invoiceNumber: carePassages.invoiceNumber,
        cotation: carePassages.cotation,
        practitioner: carePassages.practitioner,
        total: carePassages.totalAmount,
      })
      .from(carePassages)
      .where(eq(carePassages.practiceId, practiceId));

    const existingKeys = new Set(
      existing.map((e) => `${e.careDate}|${e.careMoment}|${e.invoiceNumber}|${decrypt(e.cotation)}|${e.practitioner}|${e.total}`)
    );

    const newPassages = passages.filter((p) => {
      const key = `${p.careDate}|${p.careMoment}|${p.invoiceNumber}|${p.cotation}|${p.practitioner}|${p.total}`;
      return !existingKeys.has(key);
    });

    const duplicateCount = passages.length - newPassages.length;

    if (newPassages.length === 0) {
      return { error: `Tous les ${passages.length} passages existent déjà en base. Import annulé.` };
    }

    // Create import record
    const totalAmount = newPassages.reduce((s, p) => s + parseFloat(p.total), 0);
    const [importRecord] = await db.insert(statementUploads).values({
      practiceId,
      fileName,
      fileHash,
      documentType: "rattrapage",
      passageCount: newPassages.length,
      totalAmount: totalAmount.toFixed(2),
    }).returning({ id: statementUploads.id });

    // Insert passages
    await db.insert(carePassages).values(
      newPassages.map((p) => ({
        practiceId,
        importId: importRecord!.id,
        clientName: encryptNullable(p.clientName),
        invoiceNumber: p.invoiceNumber,
        careDate: p.careDate,
        careMoment: p.careMoment,
        practitioner: p.practitioner,
        cotation: encrypt(p.cotation),
        status: p.status,
        baseAmount: p.honoraires,
        adj1: p.majoration,
        adj2: p.ferieDimNuit,
        adj3: p.ifd,
        totalAmount: p.total,
      }))
    );

    // Detect practice link suggestions for all registered practitioners
    const allPractitioners = await db
      .select({ id: practitioners.id, firstName: practitioners.firstName, lastName: practitioners.lastName })
      .from(practitioners);

    for (const p of allPractitioners) {
      await detectAndCreateSuggestions(p.id, `${p.firstName} ${p.lastName}`);
    }

    return {
      success: true,
      count: newPassages.length,
      duplicateCount,
    };
  } catch (err) {
    console.error("[IMPORT] Error:", err);
    return { error: "Erreur lors de l'import en base de données." };
  }
}

export async function importNoemieAction(
  practiceId: string,
  payments: ParsedNoemiePayment[],
  fileName: string,
  fileHash: string
) {
  if (!practiceId) {
    return { error: "Veuillez sélectionner un cabinet" };
  }

  if (payments.length === 0) {
    return { error: "Aucun paiement à importer" };
  }

  if (!fileHash) {
    return { error: "Hash du fichier manquant" };
  }

  // Verify practice exists
  const [practice] = await db
    .select({ id: practices.id })
    .from(practices)
    .where(eq(practices.id, practiceId));

  if (!practice) {
    return { error: "Cabinet introuvable" };
  }

  // Check if file already imported
  const [existingUpload] = await db
    .select({ id: statementUploads.id })
    .from(statementUploads)
    .where(eq(statementUploads.fileHash, fileHash));

  if (existingUpload) {
    return { error: "Ce fichier a déjà été importé." };
  }

  try {
    // Check for duplicate payments
    const existing = await db
      .select({
        invoiceNumber: carePayments.invoiceNumber,
        paymentDate: carePayments.paymentDate,
        amountPaid: carePayments.amountPaid,
        payerType: carePayments.payerType,
      })
      .from(carePayments)
      .where(eq(carePayments.practiceId, practiceId));

    const existingKeys = new Set(
      existing.map((e) => `${e.invoiceNumber}|${e.paymentDate}|${e.amountPaid}|${e.payerType}`)
    );

    const newPayments = payments.filter((p) => {
      const key = `${p.invoiceNumber}|${p.paymentDate}|${p.amountPaid}|${p.payerType}`;
      return !existingKeys.has(key);
    });

    const duplicateCount = payments.length - newPayments.length;

    if (newPayments.length === 0) {
      return { error: `Tous les ${payments.length} paiements existent déjà en base. Import annulé.` };
    }

    // Create import record
    const totalAmount = newPayments.reduce((s, p) => s + parseFloat(p.amountPaid), 0);
    const [importRecord] = await db.insert(statementUploads).values({
      practiceId,
      fileName,
      fileHash,
      documentType: "noemie",
      passageCount: newPayments.length,
      totalAmount: totalAmount.toFixed(2),
    }).returning({ id: statementUploads.id });

    // Insert payments
    await db.insert(carePayments).values(
      newPayments.map((p) => ({
        practiceId,
        uploadId: importRecord!.id,
        invoiceNumber: p.invoiceNumber,
        invoiceType: p.invoiceType,
        payerType: p.payerType,
        paymentDate: p.paymentDate,
        paymentRef: p.paymentRef,
        amountBilled: p.amountBilled,
        amountPaid: p.amountPaid,
        status: p.status,
        rejectionReason: p.rejectionReason,
        clientName: encryptNullable(p.clientName || null),
      }))
    );

    // Update care_passages statuses based on new payments
    for (const p of newPayments) {
      const newStatus = p.status === "paid" ? "paye" : "rejete";
      await db
        .update(carePassages)
        .set({ status: newStatus as "paye" | "rejete", updatedAt: new Date() })
        .where(
          and(
            eq(carePassages.practiceId, practiceId),
            eq(carePassages.invoiceNumber, p.invoiceNumber)
          )
        );
    }

    return {
      success: true,
      count: newPayments.length,
      duplicateCount,
    };
  } catch (err) {
    console.error("[IMPORT NOEMIE] Error:", err);
    return { error: "Erreur lors de l'import en base de données." };
  }
}

export async function listImports() {
  return db
    .select({
      id: statementUploads.id,
      practiceName: practices.name,
      fileName: statementUploads.fileName,
      documentType: statementUploads.documentType,
      passageCount: statementUploads.passageCount,
      totalAmount: statementUploads.totalAmount,
      createdAt: statementUploads.createdAt,
    })
    .from(statementUploads)
    .innerJoin(practices, eq(statementUploads.practiceId, practices.id))
    .orderBy(statementUploads.createdAt);
}

export async function deleteImportAction(importId: string) {
  if (!importId) {
    return { error: "ID d'import requis" };
  }

  try {
    // Delete all passages and payments linked to this import
    await db
      .delete(carePassages)
      .where(eq(carePassages.importId, importId));

    await db
      .delete(carePayments)
      .where(eq(carePayments.uploadId, importId));

    // Delete the import record
    await db
      .delete(statementUploads)
      .where(eq(statementUploads.id, importId));

    return { success: true };
  } catch (err) {
    console.error("[DELETE IMPORT] Error:", err);
    return { error: "Erreur lors de la suppression de l'import." };
  }
}
