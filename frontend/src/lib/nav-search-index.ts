// Index de navigation pour la recherche rapide de la sidebar (« command palette »).
// Chaque entrée pointe vers une page ou un onglet précis. Les onglets sont
// deep-linkés via `?tab=<clé>` (lus par management/client.tsx & profile/client.tsx).
//
// La recherche est accent-insensible et tolérante : « cotisation sociale » doit
// trouver « Mes cotisations sociales » (onglet Gestion). Ajouter des synonymes
// dans `keywords` pour élargir la couverture sans polluer le libellé affiché.

export type NavDestination = {
  /** Libellé affiché (avec accents). */
  label: string;
  /** Destination (route, éventuellement avec `?tab=`). */
  href: string;
  /** Groupe affiché à droite du résultat (ex. « Gestion »). */
  group: string;
  /** Synonymes / mots-clés supplémentaires pour la recherche. */
  keywords?: string[];
};

export const PRACTITIONER_DESTINATIONS: NavDestination[] = [
  // ── Pages ──
  { label: "Tableau de bord", href: "/dashboard", group: "Page", keywords: ["dashboard", "accueil", "vue d'ensemble", "résumé", "reste à vivre"] },
  { label: "Transactions", href: "/transactions", group: "Page", keywords: ["dépenses", "opérations", "mouvements", "banque", "catégorisation", "relevé", "compte bancaire"] },
  { label: "Facturation", href: "/facturation", group: "Page", keywords: ["factures", "devis", "clients", "patients", "note d'honoraires"] },
  { label: "Gestion", href: "/management", group: "Page", keywords: ["comptabilité", "compta"] },
  { label: "Échéances", href: "/deadlines", group: "Page", keywords: ["calendrier", "paiements", "dates", "urssaf", "carpimko", "impôt", "rappels"] },
  { label: "Optimisation", href: "/optimization", group: "Page", keywords: ["optimiser", "défiscalisation", "économies", "madelin", "per", "épargne", "moyens d'optimisation"] },
  { label: "Aide", href: "/help", group: "Page", keywords: ["support", "faq", "question", "contact", "assistance"] },

  // ── Onglets Gestion ──
  { label: "Ma synthèse", href: "/management?tab=summary", group: "Gestion", keywords: ["synthèse", "vue d'ensemble", "trésorerie prévisionnelle", "reste à vivre"] },
  { label: "Mon activité", href: "/management?tab=activity", group: "Gestion", keywords: ["activité", "chiffre d'affaires", "ca", "revenus", "encaissements"] },
  { label: "Mes cotisations sociales", href: "/management?tab=contributions", group: "Gestion", keywords: ["cotisations", "cotisation sociale", "urssaf", "carpimko", "charges sociales", "social"] },
  { label: "Mes impôts", href: "/management?tab=taxes", group: "Gestion", keywords: ["impôts", "impôt", "ir", "impôt sur le revenu", "fiscalité", "prélèvement à la source", "pas"] },
  { label: "Reste à vivre", href: "/management?tab=remainder", group: "Gestion", keywords: ["reste à vivre", "disponible", "budget", "trésorerie"] },
  { label: "Simulation", href: "/management?tab=simulation", group: "Gestion", keywords: ["simulation", "simuler", "projection", "estimation"] },

  // ── Onglets Profil ──
  { label: "Profil professionnel", href: "/profile?tab=profile", group: "Profil", keywords: ["profil", "informations", "coordonnées", "profession", "paramètres", "réglages"] },
  { label: "Préférences de paiement", href: "/profile?tab=payments", group: "Profil", keywords: ["paiement", "prélèvement", "fréquence", "urssaf", "carpimko", "rétrocession", "jour de prélèvement"] },
  { label: "Notifications", href: "/profile?tab=notifications", group: "Profil", keywords: ["notifications", "alertes", "emails", "rappels"] },
  { label: "Compte", href: "/profile?tab=account", group: "Profil", keywords: ["compte", "mot de passe", "sécurité", "email", "suppression", "export de données"] },
];

export const ADMIN_DESTINATIONS: NavDestination[] = [
  { label: "Praticiens", href: "/admin/users", group: "Admin", keywords: ["utilisateurs", "praticiens", "infirmiers", "idel", "membres"] },
  { label: "Cabinets", href: "/admin/practices", group: "Admin", keywords: ["cabinets", "practices"] },
  { label: "Bordereaux", href: "/admin/statements", group: "Admin", keywords: ["bordereaux", "relevés", "ozzen", "rattrapages"] },
  { label: "Administrateurs", href: "/admin/admins", group: "Admin", keywords: ["admins", "administrateurs"] },
];

/** Minuscule + suppression des accents + trim, pour une comparaison tolérante. */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Recherche les destinations correspondant à `query`. Tous les mots de la requête
 * doivent être présents (dans le libellé, le groupe ou les mots-clés). Le tri
 * privilégie les correspondances sur le libellé (exact > préfixe > inclusion).
 */
export function searchDestinations(
  query: string,
  destinations: NavDestination[],
  limit = 8,
): NavDestination[] {
  const q = normalizeSearch(query);
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);

  const scored: { d: NavDestination; score: number }[] = [];
  for (const d of destinations) {
    const label = normalizeSearch(d.label);
    const haystack = normalizeSearch([d.label, d.group, ...(d.keywords ?? [])].join(" "));
    // Chaque mot de la requête doit apparaître quelque part.
    if (!tokens.every((t) => haystack.includes(t))) continue;

    let score = 0;
    if (label === q) score += 100;
    else if (label.startsWith(q)) score += 60;
    else if (label.includes(q)) score += 30;
    for (const t of tokens) {
      if (label.startsWith(t)) score += 8;
      else if (label.includes(t)) score += 4;
    }
    // À score égal, favorise les libellés courts (plus spécifiques).
    score += Math.max(0, 8 - label.length / 6);

    scored.push({ d, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.d);
}
