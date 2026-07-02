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
import { countWorkingDays } from "@/lib/data/fr-holidays";
import {
  buildScenarioForecast,
  addCaAdjustment,
  clearCaAdjustments,
  setWorkedDaysMonth,
  setDaysPerWeek,
  listCaAdjustments,
} from "@/lib/services/ca-scenario.service";
import { getActPricing, estimateMonthFromActs } from "@/lib/services/ca-acts.service";
import { computeHealthScoreById } from "@/actions/health-score";
import { computeRecommendationsById } from "@/actions/recommendations";
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
      name: "forecast_ca",
      description:
        "Prévoit le chiffre d'affaires de l'année en cours à partir de l'historique (tendance des années passées + saisonnalité mensuelle + réalisé de l'année). Retourne une estimation centrale ET une fourchette basse/haute. Le chiffre est calculé statistiquement — restitue-le tel quel, ne l'invente pas. Utile pour 'combien je vais faire cette année ?', 'mon CA prévisionnel', 'est-ce que je progresse ?'.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_availability",
      description:
        "Enregistre l'indisponibilité du praticien sur un mois de l'année en cours (congés). Ex: « je ne travaille pas en juin » → full_month=true ; « 3 semaines en août » → days_off=15. Met à jour la prévision de C.A. ET les cotisations. NE JAMAIS appeler sans confirmation explicite de l'utilisateur.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "number", description: "Mois concerné, 1 (janvier) à 12 (décembre)" },
          full_month: { type: "boolean", description: "true = mois entièrement non travaillé" },
          days_off: { type: "number", description: "Nombre de jours ouvrés non travaillés (ignoré si full_month=true)" },
        },
        required: ["month"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_days_per_week",
      description:
        "Définit le rythme de travail en jours par semaine (ex: « je passe à 4 jours »). Impacte la prévision et les cotisations. NE JAMAIS appeler sans confirmation explicite.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Jours travaillés par semaine, 1 à 7" },
        },
        required: ["days"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_ca_adjustment",
      description:
        "Ajoute un levier de C.A. au scénario de prévision de l'année en cours. kind: 'rate_pct' (variation de tarif), 'volume_pct' (variation de patientèle), 'fixed_monthly' (montant mensuel, ex nouveau contrat), 'fixed_oneoff' (montant ponctuel). value: pour les pct, un pourcentage (ex 10 pour +10, -20 pour -20%) ; pour les fixed, un montant en euros. NE JAMAIS appeler sans confirmation explicite.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["rate_pct", "volume_pct", "fixed_monthly", "fixed_oneoff"], description: "Type de levier" },
          value: { type: "number", description: "Pourcentage (pour rate_pct/volume_pct) ou euros (pour fixed_*)" },
          start_month: { type: "number", description: "Mois de début 1-12 (défaut: 1)" },
          end_month: { type: "number", description: "Mois de fin 1-12 (défaut: 12, ou = start_month pour fixed_oneoff)" },
          label: { type: "string", description: "Libellé court (ex: « nouveau contrat EHPAD »)" },
        },
        required: ["kind", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_ca_adjustments",
      description: "Supprime tous les leviers de C.A. du scénario de l'année en cours (remet la prévision sans leviers). NE JAMAIS appeler sans confirmation explicite.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_act_pricing",
      description:
        "Retourne le tarif MOYEN réellement facturé par type d'acte (depuis les passages payés du praticien) : libellé en clair, code court (ex 'AMI 1.5'), tarif moyen €, nombre de passages. Utilise-le pour faire correspondre un acte décrit en langage courant ('prise de sang' = AMI 1.5 = prélèvement sanguin) à son tarif réel, avant d'estimer un mois.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "estimate_month_from_acts",
      description:
        "Estime le C.A. d'un mois à partir d'actes prévus, au tarif moyen historique. D'abord appelle get_act_pricing pour traduire les termes du praticien en codes courts d'actes (ex 'prise de sang' -> 'AMI 1.5'). Passe `save: false` pour juste calculer et montrer le résultat ; passe `save: true` UNIQUEMENT après confirmation explicite du praticien pour fixer la prévision de ce mois (le graphe s'aligne).",
      parameters: {
        type: "object",
        properties: {
          acts: {
            type: "array",
            description: "Actes prévus",
            items: {
              type: "object",
              properties: {
                term: { type: "string", description: "Code court d'acte issu de get_act_pricing (ex 'AMI 1.5') ou terme courant" },
                count: { type: "number", description: "Nombre d'actes prévus" },
              },
              required: ["term", "count"],
            },
          },
          month: { type: "number", description: "Mois cible 1-12 (doit être à venir)" },
          save: { type: "boolean", description: "true = fixer la prévision de ce mois (après confirmation). Défaut false." },
        },
        required: ["acts", "month"],
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
      description: "Projette l'évolution de la trésorerie sur les N prochains mois en se basant sur la moyenne et la volatilité des 6 derniers mois. Retourne une projection centrale **et un intervalle de confiance à 80 %** (borne basse / borne haute), de plus en plus large à mesure qu'on s'éloigne dans le temps.",
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
  {
    type: "function",
    function: {
      name: "get_health_score",
      description: "Retourne le score de santé financière du praticien sur 100, avec le détail des 4 sous-scores (trésorerie, poids des charges, complétude des données, recouvrement) et jusqu'à 3 recommandations actionnables. Utile pour 'comment ça va ?', 'quel est mon score ?', 'qu'est-ce que je dois améliorer ?'.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recommendations",
      description: "Retourne les recommandations personnalisées d'optimisation pour le praticien : PER ou Madelin sous-utilisés, régularisation URSSAF à provisionner, échéances supérieures au solde, régime fiscal sous-optimal, délai de paiement long, trésorerie dormante, cotisations en retard. Chaque reco a un impact € chiffré. Utile pour 'qu'est-ce que je peux optimiser ?', 'opportunités d'économie', 'que dois-je faire pour économiser ?'.",
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

      // Marge ±15 % : reflète l'incertitude liée aux régularisations N+2,
      // aux barèmes IR (tranches/plafonds qui évoluent) et aux options
      // d'optimisation non encore activées (PER, Madelin…).
      const COTISATIONS_MARGIN = 0.15;
      const total = result.urssafAnnuel + result.carpimkoAnnuel + result.pasAnnuel;
      const totalLow = Math.round(total * (1 - COTISATIONS_MARGIN));
      const totalHigh = Math.round(total * (1 + COTISATIONS_MARGIN));

      return [
        `Simulation cotisations pour un revenu de ${formatEur(revenu)} :`,
        `URSSAF annuel : ${formatEur(result.urssafAnnuel)} (${formatEur(result.urssafParEcheance)}/échéance)`,
        `CARPIMKO annuel : ${formatEur(result.carpimkoAnnuel)} (${formatEur(result.carpimkoParEcheance)}/échéance)`,
        `PAS (impôt sur le revenu) : ${formatEur(result.pasAnnuel)} (${formatEur(result.pasParEcheance)}/échéance)`,
        `Total cotisations : ${formatEur(total)} (estimé entre ${formatEur(totalLow)} et ${formatEur(totalHigh)}, ±${Math.round(COTISATIONS_MARGIN * 100)} %)`,
      ].join("\n");
    },

    async forecast_ca(): Promise<string> {
      const practitioner = hp as unknown as Parameters<typeof buildScenarioForecast>[0];
      const monthsElapsed = new Date().getMonth(); // mois révolus (mois en cours exclu)
      const { history, forecast: f, baseForecast, hasScenario, adjustments } =
        await buildScenarioForecast(practitioner, monthsElapsed);
      if (history.years.length === 0 || !f) {
        return "Aucun historique de CA disponible (ni transactions bancaires catégorisées, ni bordereaux payés). Impossible de faire une prévision.";
      }

      if (f.basis === "insufficient") {
        return [
          `Historique insuffisant pour une prévision fiable du CA ${f.targetYear}.`,
          `Réalisé à ce jour : ${formatEur(history.years.find((y) => y.year === f.targetYear)?.total ?? 0)}.`,
          "Précise au praticien qu'il faut plus d'historique (idéalement 12 mois) pour projeter.",
        ].join("\n");
      }

      const lines: string[] = [];
      // Historique année par année.
      lines.push("Historique de CA :");
      for (const y of history.years) {
        const tag = y.isComplete ? "" : " (en cours)";
        lines.push(`- ${y.year} : ${formatEur(y.total)}${tag} [source: ${y.source}]`);
      }

      // Prévision.
      lines.push("");
      lines.push(`Prévision CA ${f.targetYear} :`);
      lines.push(
        `- Estimation centrale : ${formatEur(f.annualProbable)} ` +
          `(fourchette ${formatEur(f.annualLow)} → ${formatEur(f.annualHigh)})`,
      );
      if (f.trendGrowthRate != null) {
        const pct = (f.trendGrowthRate * 100).toFixed(1);
        const sign = f.trendGrowthRate >= 0 ? "+" : "";
        lines.push(`- Évolution vs dernière année complète : ${sign}${pct} %`);
      }
      lines.push(`- Fiabilité : ${f.confidence === "high" ? "élevée" : f.confidence === "medium" ? "moyenne" : "faible"} (${f.monthsOfHistory} mois d'historique)`);

      // Mois forts / faibles d'après la saisonnalité.
      const ranked = f.seasonality.map((w, i) => ({ i, w })).sort((a, b) => b.w - a.w);
      const strong = ranked.slice(0, 2).map((r) => MONTH_SHORT[r.i]);
      const weak = ranked.slice(-2).map((r) => MONTH_SHORT[r.i]).reverse();
      lines.push(`- Saisonnalité : mois forts ${strong.join(", ")} ; mois creux ${weak.join(", ")}`);

      // Scénario actif (congés/leviers) : on précise l'écart vs la prévision de base.
      if (hasScenario && baseForecast) {
        lines.push("");
        lines.push("Scénario appliqué (congés / leviers) :");
        const delta = f.annualProbable - baseForecast.annualProbable;
        const sign = delta >= 0 ? "+" : "";
        lines.push(`- Prévision SANS scénario : ${formatEur(baseForecast.annualProbable)}`);
        lines.push(`- Impact du scénario : ${sign}${formatEur(delta)}`);
        const KIND_LABEL: Record<string, string> = {
          rate_pct: "tarif", volume_pct: "volume", fixed_monthly: "montant mensuel", fixed_oneoff: "montant ponctuel",
          month_override: "valeur imposée (estim. actes)",
        };
        for (const a of adjustments) {
          const val = a.kind === "rate_pct" || a.kind === "volume_pct"
            ? `${a.value >= 0 ? "+" : ""}${(a.value * 100).toFixed(0)} %`
            : formatEur(a.value);
          const period = a.startMonth === a.endMonth ? MONTH_SHORT[a.startMonth - 1] : `${MONTH_SHORT[a.startMonth - 1]}→${MONTH_SHORT[a.endMonth - 1]}`;
          lines.push(`  • ${KIND_LABEL[a.kind] ?? a.kind} ${val} (${period})${a.label ? ` — ${a.label}` : ""}`);
        }
      }

      return lines.join("\n");
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async set_availability(args: any): Promise<string> {
      const year = new Date().getFullYear();
      const month = Number(args.month);
      if (!Number.isInteger(month) || month < 1 || month > 12) return "Mois invalide (1 à 12).";

      const daysPerWeek = Number(hp.daysPerWeekWorked) || 5;
      const fullMonth = countWorkingDays(year, month, daysPerWeek);
      let workedDays: number;
      if (args.full_month) {
        // Mois entièrement chômé → 0 jour travaillé.
        workedDays = 0;
      } else if (args.days_off != null) {
        workedDays = Math.max(0, fullMonth - Number(args.days_off));
      } else {
        return "Précise full_month=true ou un nombre de jours (days_off).";
      }

      const res = await setWorkedDaysMonth(practitionerId, year, month, workedDays);
      if (!res.ok) return `Échec : ${res.error}`;
      const daysOff = fullMonth - workedDays;
      return `Disponibilité mise à jour : ${workedDays} jour(s) travaillé(s) (${daysOff} chômé(s)) en ${MONTH_SHORT[month - 1]} ${year}. La prévision et les cotisations vont s'ajuster.`;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async set_days_per_week(args: any): Promise<string> {
      const days = Number(args.days);
      const res = await setDaysPerWeek(practitionerId, days);
      if (!res.ok) return `Échec : ${res.error}`;
      return `Rythme de travail mis à jour : ${days} jour(s) par semaine. La prévision et les cotisations vont s'ajuster.`;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async add_ca_adjustment(args: any): Promise<string> {
      const year = new Date().getFullYear();
      const kind = String(args.kind);
      const isPct = kind === "rate_pct" || kind === "volume_pct";
      // Les pct arrivent en pourcentage (10 = +10 %) → on stocke en ratio (0.1).
      const rawValue = Number(args.value);
      if (!Number.isFinite(rawValue)) return "Valeur invalide.";
      const value = isPct ? rawValue / 100 : rawValue;
      const startMonth = args.start_month != null ? Number(args.start_month) : 1;
      const endMonth = args.end_month != null
        ? Number(args.end_month)
        : (kind === "fixed_oneoff" ? startMonth : 12);

      const res = await addCaAdjustment(practitionerId, year, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        kind: kind as any,
        value,
        startMonth,
        endMonth,
        label: args.label,
      });
      if (!res.ok) return `Échec : ${res.error}`;
      const shown = isPct ? `${rawValue >= 0 ? "+" : ""}${rawValue} %` : formatEur(value);
      return `Levier ajouté (${kind} ${shown}) pour ${year}. La prévision va s'ajuster.`;
    },

    async clear_ca_adjustments(): Promise<string> {
      const year = new Date().getFullYear();
      const n = await clearCaAdjustments(practitionerId, year);
      const remaining = await listCaAdjustments(practitionerId, year);
      return `${n} levier(s) supprimé(s) pour ${year}. Restants : ${remaining.length}.`;
    },

    async get_act_pricing(): Promise<string> {
      const practitioner = hp as unknown as Parameters<typeof getActPricing>[0];
      const prices = await getActPricing(practitioner);
      if (prices.length === 0) {
        return "Aucun passage payé dans l'historique : impossible d'établir des tarifs moyens par acte.";
      }
      const lines = ["Tarif moyen réel par acte (12 derniers mois) :"];
      for (const p of prices) {
        lines.push(`- ${p.short} — ${p.label} : ${formatEur(p.avgAmount)} / passage (${p.count} passages)`);
      }
      return lines.join("\n");
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async estimate_month_from_acts(args: any): Promise<string> {
      const practitioner = hp as unknown as Parameters<typeof estimateMonthFromActs>[0];
      const acts = Array.isArray(args.acts)
        ? args.acts.map((a: { term: string; count: number }) => ({ term: String(a.term), count: Number(a.count) }))
        : [];
      if (acts.length === 0) return "Aucun acte fourni à estimer.";
      const month = Number(args.month);
      const save = args.save === true;

      const res = await estimateMonthFromActs(practitioner, acts, month, save);
      if ("error" in res) return `Échec : ${res.error}`;

      const lines: string[] = [];
      lines.push(`Estimation CA pour ${MONTH_SHORT[res.month - 1]} ${res.year} (tarif moyen historique) :`);
      for (const l of res.lines) {
        lines.push(`- ${l.count} × ${l.short} (${l.label}) à ${formatEur(l.unitAmount)} = ${formatEur(l.lineTotal)}`);
      }
      lines.push(`Total estimé : ${formatEur(res.total)}`);
      if (res.unmatched.length > 0) {
        lines.push(`Non chiffrés (aucun acte facturé correspondant) : ${res.unmatched.join(", ")}. Demande au praticien de préciser l'acte.`);
      }
      if (res.saved) {
        lines.push(`✓ Prévision de ${MONTH_SHORT[res.month - 1]} fixée à ${formatEur(res.total)} — le graphe s'aligne.`);
      } else if (!save) {
        lines.push("(Non enregistré. Pour fixer la prévision de ce mois, confirme puis rappelle avec save=true.)");
      }
      return lines.join("\n");
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

      // ── Solde actuel ──
      const accs = await db.select().from(bankAccounts).where(inArray(bankAccounts.id, accountIds));
      const currentBalance = accs.reduce((s, a) => s + Number(a.balance ?? 0), 0);

      // ── Historique : net mensuel sur les 6 derniers mois complets ──
      // (on exclut le mois en cours, partiel par nature, qui fausserait la moyenne)
      const now = new Date();
      const lookbackStart = new Date(now);
      lookbackStart.setMonth(lookbackStart.getMonth() - 6);
      lookbackStart.setDate(1);
      const fromDate = lookbackStart.toISOString().split("T")[0]!;

      const monthlyRows = await db
        .select({
          yearMonth: sql<string>`TO_CHAR(${bankTransactions.date}::date, 'YYYY-MM')`,
          net: sql<string>`COALESCE(SUM(${bankTransactions.amount}), 0)`,
        })
        .from(bankTransactions)
        .where(and(inArray(bankTransactions.bankAccountId, accountIds), gte(bankTransactions.date, fromDate)))
        .groupBy(sql`TO_CHAR(${bankTransactions.date}::date, 'YYYY-MM')`);

      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const monthlyNets = monthlyRows
        .filter((r) => r.yearMonth !== currentMonthKey)
        .map((r) => Number(r.net))
        .slice(-6);

      const meanNet = monthlyNets.length > 0
        ? monthlyNets.reduce((a, b) => a + b, 0) / monthlyNets.length
        : 0;

      // Écart-type de l'échantillon (n-1) — nécessite au moins 2 points.
      let stdDev = 0;
      if (monthlyNets.length >= 2) {
        const variance = monthlyNets.reduce((a, b) => a + (b - meanNet) ** 2, 0) / (monthlyNets.length - 1);
        stdDev = Math.sqrt(variance);
      }

      // ── Projection avec intervalle de confiance 80 % ──
      // Modèle : la trésorerie au mois N est la somme du solde + N tirages
      // indépendants du flux mensuel. L'écart-type de cette somme est
      // sqrt(N) × stdDev. On utilise z=1.28 (80 % → marge symétrique ±X).
      const Z80 = 1.28;
      const lines: string[] = [
        `Projection trésorerie sur ${months} mois :`,
        `Solde actuel : ${formatEur(currentBalance)}`,
        `Flux net mensuel moyen (${monthlyNets.length} mois) : ${formatEur(meanNet)}`,
      ];
      if (stdDev > 0) {
        lines.push(`Volatilité mensuelle (écart-type) : ${formatEur(stdDev)}`);
      } else if (monthlyNets.length < 2) {
        lines.push(`(Historique trop court pour calculer une marge fiable — projection sans intervalle.)`);
      }
      lines.push("");

      for (let i = 1; i <= months; i++) {
        const futureDate = new Date(now);
        futureDate.setMonth(futureDate.getMonth() + i);
        const monthLabel = MONTH_SHORT[futureDate.getMonth()];
        const central = currentBalance + i * meanNet;
        if (stdDev > 0) {
          const margin = Z80 * stdDev * Math.sqrt(i);
          lines.push(
            `${monthLabel} ${futureDate.getFullYear()} : ~${formatEur(central)} ` +
            `(entre ${formatEur(central - margin)} et ${formatEur(central + margin)}, à 80 %)`,
          );
        } else {
          lines.push(`${monthLabel} ${futureDate.getFullYear()} : ~${formatEur(central)}`);
        }
      }

      const finalCentral = currentBalance + months * meanNet;
      const finalLow = stdDev > 0 ? finalCentral - Z80 * stdDev * Math.sqrt(months) : finalCentral;
      if (finalCentral < 0) {
        lines.push(`\n⚠ Attention : projection centrale négative — risque de trésorerie tendue.`);
      } else if (finalLow < 0) {
        lines.push(`\n⚠ La borne basse de l'intervalle passe sous 0 — il existe un risque de trou de trésorerie.`);
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

    async get_recommendations(): Promise<string> {
      const recos = await computeRecommendationsById(practitionerId);
      if (recos.length === 0) return "Aucune opportunité d'optimisation détectée pour l'instant — bravo !";

      const totalImpact = recos.reduce((s, r) => s + (r.impactEur ?? 0), 0);
      const lines: string[] = [];
      lines.push(`${recos.length} recommandation${recos.length > 1 ? "s" : ""} personnalisée${recos.length > 1 ? "s" : ""}.`);
      if (totalImpact !== 0) {
        lines.push(`Impact cumulé estimé : ${totalImpact > 0 ? "+" : ""}${formatEur(totalImpact)}/an`);
      }
      lines.push("");

      for (const r of recos) {
        const sev = r.severity === "critical" ? "[critique]"
          : r.severity === "warning" ? "[à surveiller]"
          : r.severity === "opportunity" ? "[opportunité]"
          : "[info]";
        const impact = r.impactEur !== undefined
          ? ` — impact ${r.impactEur > 0 ? "+" : ""}${formatEur(r.impactEur)}/an`
          : "";
        lines.push(`${sev} ${r.title}${impact}`);
        lines.push(`  ${r.message}`);
        for (const ev of r.evidence) lines.push(`  · ${ev}`);
        if (r.cta) lines.push(`  → ${r.cta.label} (${r.cta.href})`);
        lines.push("");
      }
      return lines.join("\n");
    },

    async get_health_score(): Promise<string> {
      const result = await computeHealthScoreById(practitionerId);
      if (!result) return "Score de santé financière indisponible.";

      const label = result.score >= 80 ? "Excellent"
        : result.score >= 60 ? "Bon"
        : result.score >= 40 ? "À surveiller"
        : "Critique";

      const lines: string[] = [];
      lines.push(`Score global : ${result.score}/100 (${label})`);

      const available = result.subscores.filter((s) => s.available);
      const skipped = result.subscores.filter((s) => !s.available);
      if (skipped.length > 0) {
        lines.push(`Score partiel basé sur ${available.length}/${result.subscores.length} indicateurs.`);
      }

      lines.push("");
      lines.push("Détail des sous-scores :");
      for (const s of result.subscores) {
        if (s.available) {
          lines.push(`- ${s.label} : ${Math.round(s.score)}/100 — ${s.detail}`);
        } else {
          lines.push(`- ${s.label} : non calculé — ${s.detail}`);
        }
      }

      if (result.recommendations.length > 0) {
        lines.push("");
        lines.push("Recommandations :");
        for (const r of result.recommendations) {
          const sev = r.severity === "critical" ? "[critique]" : r.severity === "warning" ? "[à surveiller]" : "[info]";
          const cta = r.cta ? ` → ${r.cta.label} (${r.cta.href})` : "";
          lines.push(`- ${sev} ${r.message}${cta}`);
        }
      }

      return lines.join("\n");
    },
  };
}

export type ToolExecutors = ReturnType<typeof createToolExecutors>;
