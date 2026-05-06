"use server";

import { eq, and, inArray, sql } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners, practiceLinks, carePassages, carePayments, practices } from "@/lib/db/schema";
import { namesMatch } from "@/lib/name-matching";
import { decryptNullable, decrypt } from "@/lib/encryption";

export interface CarePassageRow {
  id: string;
  practiceId: string;
  practiceName: string;
  invoiceNumber: string;
  careDate: string;
  careMoment: string;
  practitioner: string;
  cotation: string;
  status: string;
  baseAmount: string;
  adj1: string;
  adj2: string;
  adj3: string;
  totalAmount: string;
}

export interface RejectionDetail {
  invoiceNumber: string;
  reason: string | null;
  payerRef: string;
  amountBilled: string;
  date: string;
}

export interface RejectionStats {
  totalInvoices: number;
  rejectedCount: number;
  rejectedAmount: number;
  rate: number;
  details: RejectionDetail[];
}

export interface FacturationSummary {
  totalCA: number;
  passageCount: number;
  byStatus: {
    a_securiser: { count: number; total: number };
    a_envoyer: { count: number; total: number };
    paye: { count: number; total: number };
    rejete: { count: number; total: number };
  };
  baseAmountTotal: number;
  adj1Total: number;
  adj2Total: number;
  adj3Total: number;
  rejections: RejectionStats;
  avgPaymentDelay: number | null; // jours moyens entre soin et paiement
}

export async function getFacturationData() {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return { error: "Non autorise" };
  }

  const [practitioner] = await db
    .select({
      id: practitioners.id,
      firstName: practitioners.firstName,
      lastName: practitioners.lastName,
    })
    .from(practitioners)
    .where(eq(practitioners.userId, session.id));

  if (!practitioner) {
    return { error: "Profil requis" };
  }

  // Get linked practice IDs
  const links = await db
    .select({ practiceId: practiceLinks.practiceId })
    .from(practiceLinks)
    .where(eq(practiceLinks.practitionerId, practitioner.id));

  if (links.length === 0) {
    return { passages: [], summary: emptySummary() };
  }

  const practiceIds = links.map((l) => l.practiceId);

  // Get practice names
  const practiceList = await db
    .select({ id: practices.id, name: practices.name })
    .from(practices)
    .where(inArray(practices.id, practiceIds));

  const practiceMap = new Map(practiceList.map((p) => [p.id, p.name]));

  // Pre-filter in SQL with ILIKE, then refine with namesMatch in JS
  const fullName = `${practitioner.firstName} ${practitioner.lastName}`;
  const lastNamePattern = `%${practitioner.lastName}%`;

  const preFiltered = await db
    .select()
    .from(carePassages)
    .where(
      and(
        inArray(carePassages.practiceId, practiceIds),
        sql`${carePassages.practitioner} ILIKE ${lastNamePattern}`
      )
    );

  const myPassages = preFiltered.filter((p) => namesMatch(fullName, p.practitioner));

  // Build rows
  const rows: CarePassageRow[] = myPassages.map((p) => ({
    id: p.id,
    practiceId: p.practiceId,
    practiceName: practiceMap.get(p.practiceId) || "",
    invoiceNumber: p.invoiceNumber,
    careDate: p.careDate,
    careMoment: p.careMoment,
    practitioner: p.practitioner,
    cotation: p.cotation.includes(":") ? decrypt(p.cotation) : p.cotation,
    status: p.status,
    baseAmount: p.baseAmount,
    adj1: p.adj1,
    adj2: p.adj2,
    adj3: p.adj3,
    totalAmount: p.totalAmount,
  }));

  // Build summary
  const summary: FacturationSummary = {
    totalCA: 0,
    passageCount: rows.length,
    byStatus: {
      a_securiser: { count: 0, total: 0 },
      a_envoyer: { count: 0, total: 0 },
      paye: { count: 0, total: 0 },
      rejete: { count: 0, total: 0 },
    },
    baseAmountTotal: 0,
    adj1Total: 0,
    adj2Total: 0,
    adj3Total: 0,
    rejections: { totalInvoices: 0, rejectedCount: 0, rejectedAmount: 0, rate: 0, details: [] },
    avgPaymentDelay: null,
  };

  for (const row of rows) {
    const total = parseFloat(row.totalAmount);
    summary.baseAmountTotal += parseFloat(row.baseAmount);
    summary.adj1Total += parseFloat(row.adj1);
    summary.adj2Total += parseFloat(row.adj2);
    summary.adj3Total += parseFloat(row.adj3);

    const statusKey = row.status as keyof typeof summary.byStatus;
    if (summary.byStatus[statusKey]) {
      summary.byStatus[statusKey].count++;
      summary.byStatus[statusKey].total += total;
    }

    if (row.status === "paye") {
      summary.totalCA += total;
    }
  }

  // Rejection stats from care_payments, filtered by practitioner's invoices
  const myInvoiceNumbers = [...new Set(myPassages.map((p) => p.invoiceNumber))];

  const myPayments = myInvoiceNumbers.length > 0
    ? await db
        .select({
          invoiceNumber: carePayments.invoiceNumber,
          status: carePayments.status,
          amountBilled: carePayments.amountBilled,
          rejectionReason: carePayments.rejectionReason,
          paymentRef: carePayments.paymentRef,
          paymentDate: carePayments.paymentDate,
        })
        .from(carePayments)
        .where(
          and(
            inArray(carePayments.practiceId, practiceIds),
            inArray(carePayments.invoiceNumber, myInvoiceNumbers)
          )
        )
    : [];

  const rejectedPayments = myPayments.filter((p) => p.status === "rejected");
  summary.rejections = {
    totalInvoices: myPayments.length,
    rejectedCount: rejectedPayments.length,
    rejectedAmount: rejectedPayments.reduce((s, p) => s + parseFloat(p.amountBilled), 0),
    rate: myPayments.length > 0 ? (rejectedPayments.length / myPayments.length) * 100 : 0,
    details: rejectedPayments.map((p) => ({
      invoiceNumber: p.invoiceNumber,
      reason: p.rejectionReason,
      payerRef: p.paymentRef || "—",
      amountBilled: p.amountBilled,
      date: p.paymentDate,
    })),
  };

  // Délai moyen de paiement (jours entre date de soin et date de paiement)
  const paidPayments = myPayments.filter((p) => p.status === "paid");
  if (paidPayments.length > 0) {
    const passageDateMap = new Map(myPassages.map((p) => [p.invoiceNumber, p.careDate]));
    let totalDays = 0;
    let count = 0;
    for (const payment of paidPayments) {
      const careDate = passageDateMap.get(payment.invoiceNumber);
      if (careDate) {
        const days = Math.round(
          (new Date(payment.paymentDate).getTime() - new Date(careDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (days >= 0) {
          totalDays += days;
          count++;
        }
      }
    }
    summary.avgPaymentDelay = count > 0 ? Math.round(totalDays / count) : null;
  } else {
    summary.avgPaymentDelay = null;
  }

  return { passages: rows, summary };
}

function emptySummary(): FacturationSummary {
  return {
    totalCA: 0,
    passageCount: 0,
    byStatus: {
      a_securiser: { count: 0, total: 0 },
      a_envoyer: { count: 0, total: 0 },
      paye: { count: 0, total: 0 },
      rejete: { count: 0, total: 0 },
    },
    baseAmountTotal: 0,
    adj1Total: 0,
    adj2Total: 0,
    adj3Total: 0,
    rejections: { totalInvoices: 0, rejectedCount: 0, rejectedAmount: 0, rate: 0, details: [] },
    avgPaymentDelay: null,
  };
}
