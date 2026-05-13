import { eq, and, inArray, desc, sum, count, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bankAccounts, bankTransactions, carePassages, carePayments, practiceLinks } from "@/lib/db/schema";
import {
  buildCalendar,
  getUpcomingEvents,
  MONTH_NAMES,
  type PaymentPreferences,
  DEFAULT_PREFERENCES,
} from "@/lib/data/fiscal-calendar";
import { getCotisationsEstimate } from "@/actions/cotisations-estimate";
import type OpenAI from "openai";

function formatEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n));
}

// Tool definitions for OpenAI function calling
export const toolDefinitions: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_monthly_breakdown",
      description: "Obtient la ventilation mensuelle des revenus et dépenses catégorisés pour une année donnée",
      parameters: {
        type: "object",
        properties: {
          year: { type: "number", description: "L'année (ex: 2026)" },
        },
        required: ["year"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_transactions",
      description: "Recherche des transactions par libellé, période ou catégorie. Retourne les 10 premières correspondances.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Texte à chercher dans le libellé" },
          date_from: { type: "string", description: "Date de début (YYYY-MM-DD)" },
          date_to: { type: "string", description: "Date de fin (YYYY-MM-DD)" },
          category: { type: "string", description: "Catégorie (income, urssaf, carpimko, professional_expenses, etc.)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "simulate_cotisations",
      description: "Simule les cotisations annuelles (URSSAF, CARPIMKO, PAS) pour un revenu donné",
      parameters: {
        type: "object",
        properties: {
          revenu_annuel: { type: "number", description: "Le revenu annuel en euros" },
        },
        required: ["revenu_annuel"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_fiscal_calendar",
      description: "Obtient les échéances fiscales à venir (URSSAF, CARPIMKO, impôts, CFE)",
      parameters: {
        type: "object",
        properties: {
          max_events: { type: "number", description: "Nombre maximum d'événements à retourner (défaut: 10)" },
          max_days: { type: "number", description: "Nombre maximum de jours dans le futur (défaut: 90)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_care_summary",
      description: "Obtient un résumé de la facturation (passages de soins) par statut, optionnellement filtré par période",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Date de début (YYYY-MM-DD)" },
          date_to: { type: "string", description: "Date de fin (YYYY-MM-DD)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "project_treasury",
      description: "Projette l'évolution de la trésorerie sur les N prochains mois en se basant sur la moyenne des 3 derniers mois et les échéances connues",
      parameters: {
        type: "object",
        properties: {
          months: { type: "number", description: "Nombre de mois à projeter (défaut: 3)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_latest_transaction",
      description: "Retourne la dernière transaction pour une catégorie donnée, avec date exacte, montant et libellé. Utile pour répondre à 'quelle est ma dernière rémunération/cotisation/etc.'",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Catégorie exacte (income, compensation, urssaf, carpimko, professional_expenses, retrocession, madelin, taxes, royalty, professional_reimbursement, reprocessing)" },
        },
        required: ["category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_category_totals",
      description: "Retourne le total par catégorie pour une période donnée. Utile pour 'combien j'ai payé d'URSSAF cette année' ou 'répartition de mes dépenses'",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Date de début (YYYY-MM-DD)" },
          date_to: { type: "string", description: "Date de fin (YYYY-MM-DD)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recurring_transactions",
      description: "Identifie les transactions récurrentes (même libellé, même direction) pour comprendre les charges fixes et revenus réguliers",
      parameters: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["positive", "negative", "all"], description: "Filtrer par sens (positive=revenus, negative=dépenses, all=tout)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_periods",
      description: "Compare deux périodes (ex: ce mois vs le mois dernier, ce trimestre vs le précédent). Utile pour 'est-ce que je dépense plus ce mois-ci ?'",
      parameters: {
        type: "object",
        properties: {
          period1_from: { type: "string", description: "Début période 1 (YYYY-MM-DD)" },
          period1_to: { type: "string", description: "Fin période 1 (YYYY-MM-DD)" },
          period2_from: { type: "string", description: "Début période 2 (YYYY-MM-DD)" },
          period2_to: { type: "string", description: "Fin période 2 (YYYY-MM-DD)" },
        },
        required: ["period1_from", "period1_to", "period2_from", "period2_to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_rejected_invoices",
      description: "Retourne le détail des factures rejetées (passages de soins ou paiements), avec la raison du rejet, le patient, la date et le montant",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Nombre max de résultats (défaut: 10)" },
          date_from: { type: "string", description: "Date de début (YYYY-MM-DD)" },
          date_to: { type: "string", description: "Date de fin (YYYY-MM-DD)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_account_history",
      description: "Retourne l'évolution mensuelle du solde du compte sur les derniers mois. Utile pour 'comment évolue ma trésorerie ?'",
      parameters: {
        type: "object",
        properties: {
          months: { type: "number", description: "Nombre de mois d'historique (défaut: 6)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_uncategorized_summary",
      description: "Résumé des transactions non catégorisées : nombre, total, et les 10 plus grosses. Utile pour 'qu'est-ce que je dois encore catégoriser ?'",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_patient_stats",
      description: "Statistiques par patient : nombre d'actes, CA généré, taux de rejet. Utile pour 'qui sont mes patients les plus importants ?'",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Nombre max de patients (défaut: 10)" },
          date_from: { type: "string", description: "Date de début (YYYY-MM-DD)" },
          date_to: { type: "string", description: "Date de fin (YYYY-MM-DD)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_expense_anomalies",
      description: "Détecte les dépenses inhabituelles par rapport à la moyenne des 3 derniers mois. Utile pour 'est-ce que j'ai des dépenses anormales ?'",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_account_details",
      description: "Retourne les détails d'un ou tous les comptes bancaires : nom, type, solde, date de connexion, dernière synchronisation",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

// Tool execution functions
export function createToolExecutors(practitionerId: string, accountIds: string[], hp: Record<string, unknown>) {
  const MONTH_SHORT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async get_monthly_breakdown(args: any): Promise<string> {
      const year = args.year ?? new Date().getFullYear();
      if (accountIds.length === 0) return "Aucun compte bancaire connecté.";

      const accountFilter = inArray(bankTransactions.bankAccountId, accountIds);
      const rows = await db
        .select({
          month: sql<string>`to_char(${bankTransactions.date}, 'MM')`,
          revenus: sql<string>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} >= 0 THEN ${bankTransactions.amount} ELSE 0 END), 0)`,
          depenses: sql<string>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} < 0 THEN ABS(${bankTransactions.amount}) ELSE 0 END), 0)`,
        })
        .from(bankTransactions)
        .where(and(accountFilter, gte(bankTransactions.date, `${year}-01-01`), lte(bankTransactions.date, `${year}-12-31`)))
        .groupBy(sql`to_char(${bankTransactions.date}, 'MM')`)
        .orderBy(sql`to_char(${bankTransactions.date}, 'MM')`);

      if (rows.length === 0) return `Aucune transaction trouvée pour ${year}.`;

      const lines = [`Ventilation mensuelle ${year} :`];
      for (const r of rows) {
        const idx = parseInt(r.month) - 1;
        lines.push(`${MONTH_SHORT[idx]} : +${formatEur(Number(r.revenus))} / -${formatEur(Number(r.depenses))}`);
      }
      return lines.join("\n");
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async search_transactions(args: any): Promise<string> {
      if (accountIds.length === 0) return "Aucun compte bancaire connecté.";

      const conditions = [inArray(bankTransactions.bankAccountId, accountIds)];
      if (args.query) {
        const term = `%${args.query}%`;
        conditions.push(sql`(${bankTransactions.description} ILIKE ${term} OR ${bankTransactions.cleanDescription} ILIKE ${term})`);
      }
      if (args.date_from) conditions.push(gte(bankTransactions.date, args.date_from));
      if (args.date_to) conditions.push(lte(bankTransactions.date, args.date_to));
      if (args.category) conditions.push(eq(bankTransactions.category, args.category));

      const txs = await db
        .select()
        .from(bankTransactions)
        .where(and(...conditions))
        .orderBy(desc(bankTransactions.date))
        .limit(10);

      if (txs.length === 0) {
        const filters = [];
        if (args.query) filters.push(`libellé contenant "${args.query}"`);
        if (args.category) filters.push(`catégorie "${args.category}"`);
        if (args.date_from) filters.push(`depuis ${args.date_from}`);
        if (args.date_to) filters.push(`jusqu'au ${args.date_to}`);
        return `Aucune transaction trouvée${filters.length > 0 ? ` avec les filtres : ${filters.join(", ")}` : ""}. Il est possible que cette catégorie n'ait pas encore été attribuée à des transactions.`;
      }

      const lines = [`${txs.length} transaction(s) trouvée(s) :`];
      for (const tx of txs) {
        const cat = tx.category ? ` [${tx.category}]` : "";
        lines.push(`${tx.date} | ${tx.cleanDescription || tx.description} | ${formatEur(Number(tx.amount))}${cat}`);
      }
      return lines.join("\n");
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async simulate_cotisations(args: any): Promise<string> {
      const revenu = args.revenu_annuel;
      const result = await getCotisationsEstimate(revenu);
      if (!result) return "Impossible de calculer les cotisations.";

      return [
        `Simulation cotisations pour un revenu de ${formatEur(revenu)} :`,
        `URSSAF annuel : ${formatEur(result.urssafAnnuel)} (${formatEur(result.urssafParEcheance)}/échéance)`,
        `CARPIMKO annuel : ${formatEur(result.carpimkoAnnuel)} (${formatEur(result.carpimkoParEcheance)}/échéance)`,
        `PAS (impôt sur le revenu) : ${formatEur(result.pasAnnuel)} (${formatEur(result.pasParEcheance)}/échéance)`,
        `Total cotisations : ${formatEur(result.urssafAnnuel + result.carpimkoAnnuel + result.pasAnnuel)}`,
      ].join("\n");
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async get_fiscal_calendar(args: any): Promise<string> {
      const maxEvents = args.max_events ?? 10;
      const maxDays = args.max_days ?? 90;
      const now = new Date();

      const prefs: PaymentPreferences = {
        urssafFrequency: hp.urssafFrequency as "monthly" | "quarterly",
        urssafPayDay: hp.urssafPayDay as "5" | "20",
        pasFrequency: hp.pasFrequency as "monthly" | "quarterly",
        carpimkoFrequency: hp.carpimkoFrequency as "monthly" | "semi_annual",
        carpimkoPayDay: (hp.carpimkoPayDay as PaymentPreferences["carpimkoPayDay"]) ?? DEFAULT_PREFERENCES.carpimkoPayDay,
        activityStartDate: hp.activityStartDate as string | undefined,
      };
      const calendar = buildCalendar(prefs);
      const upcoming = getUpcomingEvents(now.getMonth(), now.getDate(), maxEvents, calendar, { maxDays });

      if (upcoming.length === 0) return `Aucune échéance dans les ${maxDays} prochains jours.`;

      const lines = ["Prochaines échéances :"];
      for (const evt of upcoming) {
        const dateStr = `${evt.day} ${MONTH_NAMES[evt.month]}`;
        lines.push(`- ${dateStr} : ${evt.label}${evt.estimatedAmount != null ? ` (~${formatEur(evt.estimatedAmount)})` : ""}`);
      }
      return lines.join("\n");
    },

    async get_care_summary(): Promise<string> {
      // Use the facturation action pattern directly
      const { getFacturationData } = await import("@/actions/facturation");
      const result = await getFacturationData();
      if ("error" in result) return "Impossible de récupérer les données de facturation.";

      const s = result.summary;
      const lines = [
        `Résumé facturation :`,
        `CA payé : ${formatEur(s.totalCA)} (${s.byStatus.paye.count} factures)`,
      ];
      const enAttente = s.byStatus.a_securiser.count + s.byStatus.a_envoyer.count;
      if (enAttente > 0) lines.push(`En attente : ${formatEur(s.byStatus.a_securiser.total + s.byStatus.a_envoyer.total)} (${enAttente} factures)`);
      if (s.byStatus.rejete.count > 0) lines.push(`Rejeté : ${formatEur(s.byStatus.rejete.total)} (${s.byStatus.rejete.count} factures)`);
      if (s.avgPaymentDelay != null) lines.push(`Délai moyen de paiement : ${Math.round(s.avgPaymentDelay)} jours`);
      return lines.join("\n");
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async project_treasury(args: any): Promise<string> {
      if (accountIds.length === 0) return "Aucun compte bancaire connecté.";
      const months = args.months ?? 3;

      // Current balance
      const accs = await db.select().from(bankAccounts).where(inArray(bankAccounts.id, accountIds));
      let balance = accs.reduce((s, a) => s + Number(a.balance ?? 0), 0);

      // Average monthly income/expense over last 3 months
      const now = new Date();
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const fromDate = threeMonthsAgo.toISOString().split("T")[0]!;

      const [avgRow] = await db
        .select({
          avgIncome: sql<string>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} >= 0 THEN ${bankTransactions.amount} ELSE 0 END) / 3, 0)`,
          avgExpense: sql<string>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} < 0 THEN ${bankTransactions.amount} ELSE 0 END) / 3, 0)`,
        })
        .from(bankTransactions)
        .where(and(inArray(bankTransactions.bankAccountId, accountIds), gte(bankTransactions.date, fromDate)));

      const monthlyIncome = Number(avgRow?.avgIncome ?? 0);
      const monthlyExpense = Number(avgRow?.avgExpense ?? 0);
      const monthlyNet = monthlyIncome + monthlyExpense; // expense is negative

      const lines = [
        `Projection trésorerie sur ${months} mois :`,
        `Solde actuel : ${formatEur(balance)}`,
        `Moyenne mensuelle : +${formatEur(monthlyIncome)} / ${formatEur(monthlyExpense)} = ${formatEur(monthlyNet)} net`,
        "",
      ];

      for (let i = 1; i <= months; i++) {
        const futureDate = new Date(now);
        futureDate.setMonth(futureDate.getMonth() + i);
        const monthLabel = MONTH_SHORT[futureDate.getMonth()];
        balance += monthlyNet;
        lines.push(`${monthLabel} ${futureDate.getFullYear()} : ~${formatEur(balance)}`);
      }

      if (balance < 0) {
        lines.push(`\n⚠ Attention : la trésorerie deviendrait négative.`);
      }

      return lines.join("\n");
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async get_latest_transaction(args: any): Promise<string> {
      if (accountIds.length === 0) return "Aucun compte bancaire connecté.";
      const category = args.category;

      const [tx] = await db
        .select()
        .from(bankTransactions)
        .where(and(inArray(bankTransactions.bankAccountId, accountIds), eq(bankTransactions.category, category)))
        .orderBy(desc(bankTransactions.date))
        .limit(1);

      if (!tx) return `Aucune transaction trouvée avec la catégorie "${category}". Cette catégorie n'a peut-être pas encore été attribuée à des transactions.`;

      return [
        `Dernière transaction "${category}" :`,
        `Date : ${tx.date}`,
        `Libellé : ${tx.cleanDescription || tx.description}`,
        `Montant : ${formatEur(Number(tx.amount))}`,
      ].join("\n");
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async get_category_totals(args: any): Promise<string> {
      if (accountIds.length === 0) return "Aucun compte bancaire connecté.";

      const conditions = [inArray(bankTransactions.bankAccountId, accountIds)];
      if (args.date_from) conditions.push(gte(bankTransactions.date, args.date_from));
      if (args.date_to) conditions.push(lte(bankTransactions.date, args.date_to));

      const rows = await db
        .select({
          category: bankTransactions.category,
          total: sum(bankTransactions.amount),
          count: count(),
        })
        .from(bankTransactions)
        .where(and(...conditions))
        .groupBy(bankTransactions.category)
        .orderBy(sql`ABS(SUM(${bankTransactions.amount})) DESC`);

      if (rows.length === 0) return "Aucune transaction trouvée pour cette période.";

      const lines = ["Totaux par catégorie :"];
      let uncategorized = 0;
      let uncategorizedCount = 0;
      for (const r of rows) {
        if (!r.category) {
          uncategorized = Number(r.total ?? 0);
          uncategorizedCount = Number(r.count);
          continue;
        }
        lines.push(`- ${r.category} : ${formatEur(Number(r.total ?? 0))} (${r.count} transactions)`);
      }
      if (uncategorizedCount > 0) {
        lines.push(`- Non catégorisé : ${formatEur(uncategorized)} (${uncategorizedCount} transactions)`);
      }
      return lines.join("\n");
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async get_recurring_transactions(args: any): Promise<string> {
      if (accountIds.length === 0) return "Aucun compte bancaire connecté.";

      const direction = args.direction ?? "all";
      const conditions = [inArray(bankTransactions.bankAccountId, accountIds)];
      if (direction === "positive") conditions.push(sql`${bankTransactions.amount} >= 0`);
      if (direction === "negative") conditions.push(sql`${bankTransactions.amount} < 0`);

      const rows = await db
        .select({
          description: sql<string>`COALESCE(${bankTransactions.cleanDescription}, ${bankTransactions.description})`,
          count: count(),
          avgAmount: sql<string>`ROUND(AVG(${bankTransactions.amount}), 2)`,
          totalAmount: sum(bankTransactions.amount),
        })
        .from(bankTransactions)
        .where(and(...conditions))
        .groupBy(sql`COALESCE(${bankTransactions.cleanDescription}, ${bankTransactions.description})`)
        .having(sql`COUNT(*) >= 2`)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(15);

      if (rows.length === 0) return "Aucune transaction récurrente identifiée.";

      const lines = [`${rows.length} transaction(s) récurrente(s) identifiée(s) :`];
      for (const r of rows) {
        lines.push(`- "${r.description}" : ${r.count}x, montant moyen ${formatEur(Number(r.avgAmount))}, total ${formatEur(Number(r.totalAmount ?? 0))}`);
      }
      return lines.join("\n");
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async get_rejected_invoices(args: any): Promise<string> {
      const maxResults = args.limit ?? 10;

      // Get practitioner's practice IDs
      const links = await db
        .select({ practiceId: practiceLinks.practiceId })
        .from(practiceLinks)
        .where(eq(practiceLinks.practitionerId, practitionerId));

      if (links.length === 0) return "Aucun cabinet lié à ce praticien.";

      const practiceIds = links.map((l) => l.practiceId);

      // Rejected passages
      const passageConditions = [
        inArray(carePassages.practiceId, practiceIds),
        eq(carePassages.status, "rejete"),
      ];
      if (args.date_from) passageConditions.push(gte(carePassages.careDate, args.date_from));
      if (args.date_to) passageConditions.push(lte(carePassages.careDate, args.date_to));

      const rejectedPassages = await db
        .select()
        .from(carePassages)
        .where(and(...passageConditions))
        .orderBy(desc(carePassages.careDate))
        .limit(maxResults);

      // Rejected payments (have rejection reasons)
      const paymentConditions = [
        inArray(carePayments.practiceId, practiceIds),
        eq(carePayments.status, "rejected"),
      ];
      if (args.date_from) paymentConditions.push(gte(carePayments.paymentDate, args.date_from));
      if (args.date_to) paymentConditions.push(lte(carePayments.paymentDate, args.date_to));

      const rejectedPayments = await db
        .select()
        .from(carePayments)
        .where(and(...paymentConditions))
        .orderBy(desc(carePayments.paymentDate))
        .limit(maxResults);

      if (rejectedPassages.length === 0 && rejectedPayments.length === 0) {
        return "Aucune facture rejetée trouvée pour cette période.";
      }

      const lines: string[] = [];

      if (rejectedPassages.length > 0) {
        lines.push(`${rejectedPassages.length} passage(s) rejeté(s) :`);
        for (const p of rejectedPassages) {
          lines.push(`- ${p.careDate} | Facture ${p.invoiceNumber} | Patient : ${p.clientName || "N/A"} | ${formatEur(Number(p.totalAmount))} | Cotation : ${p.cotation}`);
        }
      }

      if (rejectedPayments.length > 0) {
        if (lines.length > 0) lines.push("");
        lines.push(`${rejectedPayments.length} paiement(s) rejeté(s) :`);
        for (const p of rejectedPayments) {
          const reason = p.rejectionReason || "Raison non précisée";
          lines.push(`- ${p.paymentDate} | Facture ${p.invoiceNumber} | Patient : ${p.clientName || "N/A"} | Facturé : ${formatEur(Number(p.amountBilled))} | Payé : ${formatEur(Number(p.amountPaid))} | Raison : ${reason}`);
        }
      }

      return lines.join("\n");
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async compare_periods(args: any): Promise<string> {
      if (accountIds.length === 0) return "Aucun compte bancaire connecté.";

      const accountFilter = inArray(bankTransactions.bankAccountId, accountIds);

      const getPeriodStats = async (from: string, to: string) => {
        const [row] = await db
          .select({
            income: sql<string>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} >= 0 THEN ${bankTransactions.amount} ELSE 0 END), 0)`,
            expenses: sql<string>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} < 0 THEN ABS(${bankTransactions.amount}) ELSE 0 END), 0)`,
            count: count(),
          })
          .from(bankTransactions)
          .where(and(accountFilter, gte(bankTransactions.date, from), lte(bankTransactions.date, to)));
        return { income: Number(row?.income ?? 0), expenses: Number(row?.expenses ?? 0), count: Number(row?.count ?? 0) };
      };

      const p1 = await getPeriodStats(args.period1_from, args.period1_to);
      const p2 = await getPeriodStats(args.period2_from, args.period2_to);

      const incomeDiff = p1.income - p2.income;
      const expensesDiff = p1.expenses - p2.expenses;

      return [
        `Comparaison :`,
        ``,
        `Période 1 (${args.period1_from} → ${args.period1_to}) :`,
        `  Revenus : +${formatEur(p1.income)} | Dépenses : -${formatEur(p1.expenses)} | ${p1.count} transactions`,
        ``,
        `Période 2 (${args.period2_from} → ${args.period2_to}) :`,
        `  Revenus : +${formatEur(p2.income)} | Dépenses : -${formatEur(p2.expenses)} | ${p2.count} transactions`,
        ``,
        `Évolution :`,
        `  Revenus : ${incomeDiff >= 0 ? "+" : ""}${formatEur(incomeDiff)} (${p2.income > 0 ? `${Math.round(incomeDiff / p2.income * 100)}%` : "N/A"})`,
        `  Dépenses : ${expensesDiff >= 0 ? "+" : ""}${formatEur(expensesDiff)} (${p2.expenses > 0 ? `${Math.round(expensesDiff / p2.expenses * 100)}%` : "N/A"})`,
      ].join("\n");
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async get_account_history(args: any): Promise<string> {
      if (accountIds.length === 0) return "Aucun compte bancaire connecté.";
      const numMonths = args.months ?? 6;

      const now = new Date();
      const fromDate = new Date(now);
      fromDate.setMonth(fromDate.getMonth() - numMonths);
      const fromStr = fromDate.toISOString().split("T")[0]!;

      const rows = await db
        .select({
          month: sql<string>`to_char(${bankTransactions.date}, 'YYYY-MM')`,
          net: sql<string>`COALESCE(SUM(${bankTransactions.amount}), 0)`,
          income: sql<string>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} >= 0 THEN ${bankTransactions.amount} ELSE 0 END), 0)`,
          expenses: sql<string>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} < 0 THEN ${bankTransactions.amount} ELSE 0 END), 0)`,
        })
        .from(bankTransactions)
        .where(and(inArray(bankTransactions.bankAccountId, accountIds), gte(bankTransactions.date, fromStr)))
        .groupBy(sql`to_char(${bankTransactions.date}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${bankTransactions.date}, 'YYYY-MM')`);

      if (rows.length === 0) return "Aucune transaction sur cette période.";

      // Calculate running balance from current balance backward
      const accs = await db.select().from(bankAccounts).where(inArray(bankAccounts.id, accountIds));
      let currentBalance = accs.reduce((s, a) => s + Number(a.balance ?? 0), 0);

      // Build from most recent to oldest, then reverse
      const monthData = rows.map((r) => ({
        month: r.month,
        net: Number(r.net),
        income: Number(r.income),
        expenses: Number(r.expenses),
      })).reverse();

      const balances: { month: string; balance: number; income: number; expenses: number }[] = [];
      for (const m of monthData) {
        balances.unshift({ month: m.month, balance: Math.round(currentBalance), income: m.income, expenses: m.expenses });
        currentBalance -= m.net;
      }

      const lines = ["Évolution de la trésorerie :"];
      for (const b of balances) {
        const [y, m] = b.month.split("-");
        const monthLabel = MONTH_SHORT[parseInt(m!) - 1];
        lines.push(`${monthLabel} ${y} : solde ~${formatEur(b.balance)} (+${formatEur(b.income)} / ${formatEur(b.expenses)})`);
      }
      return lines.join("\n");
    },

    async get_uncategorized_summary(): Promise<string> {
      if (accountIds.length === 0) return "Aucun compte bancaire connecté.";

      const accountFilter = and(inArray(bankTransactions.bankAccountId, accountIds), sql`${bankTransactions.category} IS NULL`);

      const [stats] = await db
        .select({
          total: count(),
          sumPositive: sql<string>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} >= 0 THEN ${bankTransactions.amount} ELSE 0 END), 0)`,
          sumNegative: sql<string>`COALESCE(SUM(CASE WHEN ${bankTransactions.amount} < 0 THEN ${bankTransactions.amount} ELSE 0 END), 0)`,
        })
        .from(bankTransactions)
        .where(accountFilter);

      const totalCount = Number(stats?.total ?? 0);
      if (totalCount === 0) return "Toutes les transactions sont catégorisées.";

      // Top 10 biggest uncategorized by absolute value
      const biggest = await db
        .select()
        .from(bankTransactions)
        .where(accountFilter)
        .orderBy(sql`ABS(${bankTransactions.amount}) DESC`)
        .limit(10);

      const lines = [
        `${totalCount} transaction(s) non catégorisée(s) :`,
        `Entrées non catégorisées : +${formatEur(Number(stats?.sumPositive ?? 0))}`,
        `Sorties non catégorisées : ${formatEur(Number(stats?.sumNegative ?? 0))}`,
        "",
        "Les 10 plus importantes :",
      ];
      for (const tx of biggest) {
        lines.push(`- ${tx.date} | ${tx.cleanDescription || tx.description} | ${formatEur(Number(tx.amount))}`);
      }
      return lines.join("\n");
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async get_patient_stats(args: any): Promise<string> {
      const maxResults = args.limit ?? 10;

      const links = await db
        .select({ practiceId: practiceLinks.practiceId })
        .from(practiceLinks)
        .where(eq(practiceLinks.practitionerId, practitionerId));

      if (links.length === 0) return "Aucun cabinet lié à ce praticien.";
      const practiceIds = links.map((l) => l.practiceId);

      const conditions = [inArray(carePassages.practiceId, practiceIds)];
      if (args.date_from) conditions.push(gte(carePassages.careDate, args.date_from));
      if (args.date_to) conditions.push(lte(carePassages.careDate, args.date_to));

      const rows = await db
        .select({
          clientName: carePassages.clientName,
          totalActs: count(),
          totalAmount: sum(carePassages.totalAmount),
          paidCount: sql<string>`SUM(CASE WHEN ${carePassages.status} = 'paye' THEN 1 ELSE 0 END)`,
          rejectedCount: sql<string>`SUM(CASE WHEN ${carePassages.status} = 'rejete' THEN 1 ELSE 0 END)`,
        })
        .from(carePassages)
        .where(and(...conditions))
        .groupBy(carePassages.clientName)
        .orderBy(sql`SUM(${carePassages.totalAmount}) DESC`)
        .limit(maxResults);

      if (rows.length === 0) return "Aucun passage de soins trouvé.";

      const lines = [`Top ${rows.length} patients :`];
      for (const r of rows) {
        const name = r.clientName || "N/A";
        const rejected = Number(r.rejectedCount ?? 0);
        const total = Number(r.totalActs);
        const rejectRate = total > 0 ? Math.round((rejected / total) * 100) : 0;
        lines.push(`- ${name} : ${total} actes, CA ${formatEur(Number(r.totalAmount ?? 0))}${rejected > 0 ? `, ${rejected} rejet(s) (${rejectRate}%)` : ""}`);
      }
      return lines.join("\n");
    },

    async get_expense_anomalies(): Promise<string> {
      if (accountIds.length === 0) return "Aucun compte bancaire connecté.";

      const now = new Date();
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const fromStr3m = threeMonthsAgo.toISOString().split("T")[0]!;
      const fromStr1m = oneMonthAgo.toISOString().split("T")[0]!;
      const accountFilter = inArray(bankTransactions.bankAccountId, accountIds);

      // Average monthly expenses by description over last 3 months
      const avgRows = await db
        .select({
          description: sql<string>`COALESCE(${bankTransactions.cleanDescription}, ${bankTransactions.description})`,
          avgAmount: sql<string>`ROUND(AVG(${bankTransactions.amount}), 2)`,
          count: count(),
        })
        .from(bankTransactions)
        .where(and(accountFilter, sql`${bankTransactions.amount} < 0`, gte(bankTransactions.date, fromStr3m), lte(bankTransactions.date, fromStr1m)))
        .groupBy(sql`COALESCE(${bankTransactions.cleanDescription}, ${bankTransactions.description})`)
        .having(sql`COUNT(*) >= 2`);

      const avgMap = new Map(avgRows.map((r) => [r.description.toLowerCase().trim(), Math.abs(Number(r.avgAmount))]));

      // Last month expenses
      const recentExpenses = await db
        .select()
        .from(bankTransactions)
        .where(and(accountFilter, sql`${bankTransactions.amount} < 0`, gte(bankTransactions.date, fromStr1m)))
        .orderBy(sql`ABS(${bankTransactions.amount}) DESC`);

      const anomalies: { desc: string; amount: number; avg: number; pctDiff: number }[] = [];

      for (const tx of recentExpenses) {
        const desc = (tx.cleanDescription || tx.description).toLowerCase().trim();
        const avg = avgMap.get(desc);
        if (avg == null) continue;
        const amount = Math.abs(Number(tx.amount));
        const pctDiff = Math.round(((amount - avg) / avg) * 100);
        if (pctDiff > 30) {
          anomalies.push({ desc: tx.cleanDescription || tx.description, amount, avg, pctDiff });
        }
      }

      // Also flag large one-time expenses (no history)
      const oneTimeExpenses = recentExpenses
        .filter((tx) => {
          const desc = (tx.cleanDescription || tx.description).toLowerCase().trim();
          return !avgMap.has(desc) && Math.abs(Number(tx.amount)) > 200;
        })
        .slice(0, 5);

      if (anomalies.length === 0 && oneTimeExpenses.length === 0) {
        return "Aucune dépense anormale détectée ce dernier mois. Tout semble dans la moyenne.";
      }

      const lines: string[] = [];

      if (anomalies.length > 0) {
        lines.push("Dépenses inhabituelles (supérieures à la moyenne de +30%) :");
        for (const a of anomalies.slice(0, 10)) {
          lines.push(`- "${a.desc}" : ${formatEur(a.amount)} (moyenne : ${formatEur(a.avg)}, +${a.pctDiff}%)`);
        }
      }

      if (oneTimeExpenses.length > 0) {
        if (lines.length > 0) lines.push("");
        lines.push("Dépenses ponctuelles importantes (pas d'historique) :");
        for (const tx of oneTimeExpenses) {
          lines.push(`- ${tx.date} | "${tx.cleanDescription || tx.description}" : ${formatEur(Math.abs(Number(tx.amount)))}`);
        }
      }

      return lines.join("\n");
    },
    async get_account_details(): Promise<string> {
      if (accountIds.length === 0) return "Aucun compte bancaire connecté.";

      const accs = await db.select().from(bankAccounts).where(inArray(bankAccounts.id, accountIds));

      const lines = [`${accs.length} compte(s) bancaire(s) :`];
      for (const acc of accs) {
        lines.push(`- ${acc.name}`);
        lines.push(`  Type : ${acc.type}`);
        lines.push(`  Solde : ${formatEur(Number(acc.balance ?? 0))}`);
        lines.push(`  Connecté le : ${acc.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`);
        if (acc.lastSyncAt) {
          lines.push(`  Dernière synchro : ${new Date(acc.lastSyncAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`);
        }
      }
      return lines.join("\n");
    },
  };
}

export type ToolExecutors = ReturnType<typeof createToolExecutors>;
