import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { practitioners, bankAccounts } from "@/lib/db/schema";
import { getTransactionKpisAction } from "@/actions/transaction";
import { getFacturationData } from "@/actions/facturation";
import {
  buildCalendar,
  getUpcomingEvents,
  MONTH_NAMES,
  type PaymentPreferences,
  DEFAULT_PREFERENCES,
} from "@/lib/data/fiscal-calendar";

function formatEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n));
}

export async function buildFinancialContext(userId: string): Promise<string> {
  const [hp] = await db
    .select()
    .from(practitioners)
    .where(eq(practitioners.userId, userId));

  if (!hp) return "Aucun profil praticien trouvé.";

  const lines: string[] = [];

  // Profil
  lines.push(`## Profil`);
  lines.push(`Prénom : ${hp.firstName}`);
  lines.push(`Régime fiscal : ${hp.taxRegime === "micro_bnc" ? "Micro-BNC" : "BNC"}`);
  lines.push(`Début d'activité : ${hp.activityStartDate}`);
  lines.push(`Fréquence URSSAF : ${hp.urssafFrequency}, jour de paiement : ${hp.urssafPayDay}`);
  lines.push(`Fréquence CARPIMKO : ${hp.carpimkoFrequency}`);
  lines.push(`Taux PAS : ${hp.pasRate}%`);

  // Solde trésorerie
  const accs = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.practitionerId, hp.id));

  if (accs.length > 0) {
    const totalBalance = accs.reduce((s, a) => s + Number(a.balance ?? 0), 0);
    lines.push(`\n## Trésorerie`);
    lines.push(`Solde total : ${formatEur(totalBalance)}`);
    for (const acc of accs) {
      lines.push(`- ${acc.name} (${acc.type}) : ${formatEur(Number(acc.balance ?? 0))}`);
    }
  } else {
    lines.push(`\n## Trésorerie`);
    lines.push(`Aucun compte bancaire connecté.`);
  }

  // KPIs année en cours
  const year = new Date().getFullYear();
  const kpis = await getTransactionKpisAction(null, year);
  lines.push(`\n## KPIs ${year} (basés sur les transactions catégorisées)`);
  lines.push(`Encaissement : ${formatEur(kpis.encaissement)}`);
  lines.push(`Décaissement : ${formatEur(kpis.decaissement)}`);
  lines.push(`Rémunération : ${formatEur(kpis.remuneration ?? 0)}`);

  // Facturation
  const factResult = await getFacturationData();
  if ("summary" in factResult && factResult.summary) {
    const s = factResult.summary;
    lines.push(`\n## Facturation`);
    lines.push(`CA payé : ${formatEur(s.totalCA)} (${s.byStatus.paye.count} factures)`);
    const enAttente = s.byStatus.a_securiser.count + s.byStatus.a_envoyer.count;
    const enAttenteTotal = s.byStatus.a_securiser.total + s.byStatus.a_envoyer.total;
    if (enAttente > 0) lines.push(`En attente : ${formatEur(enAttenteTotal)} (${enAttente} factures)`);
    if (s.byStatus.rejete.count > 0) lines.push(`Rejeté : ${formatEur(s.byStatus.rejete.total)} (${s.byStatus.rejete.count} factures)`);
  }

  // Prochaines échéances
  const now = new Date();
  const prefs: PaymentPreferences = {
    urssafFrequency: hp.urssafFrequency as "monthly" | "quarterly",
    urssafPayDay: hp.urssafPayDay as "5" | "20",
    pasFrequency: hp.pasFrequency as "monthly" | "quarterly",
    carpimkoFrequency: hp.carpimkoFrequency as "monthly" | "semi_annual",
    carpimkoPayDay: (hp as Record<string, unknown>).carpimkoPayDay as PaymentPreferences["carpimkoPayDay"] ?? DEFAULT_PREFERENCES.carpimkoPayDay,
    activityStartDate: hp.activityStartDate,
  };
  const calendar = buildCalendar(prefs);
  const upcoming = getUpcomingEvents(now.getMonth(), now.getDate(), 5, calendar, { maxDays: 60 });

  if (upcoming.length > 0) {
    lines.push(`\n## Prochaines échéances`);
    for (const evt of upcoming) {
      const dateStr = `${evt.day} ${MONTH_NAMES[evt.month]}`;
      lines.push(`- ${dateStr} : ${evt.label}${evt.estimatedAmount != null ? ` (~${formatEur(evt.estimatedAmount)})` : ""}`);
    }
  }

  lines.push(`\n## Date du jour : ${now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`);

  return lines.join("\n");
}
