import { APP_URL } from "@/lib/config";
import { IconCheck } from "./icons";

type Plan = {
  plan: string;
  price: string;
  desc: string;
  features: string[];
  cta: string;
  ctaClass: string;
  /** Cible du bouton. Par défaut l'app ; le plan Cabinet ouvre un mailto équipe. */
  href: string;
  popular?: boolean;
};

const CONTACT_EMAIL = "team@actidec.com";

const PLANS: Plan[] = [
  {
    plan: "Découverte",
    price: "0€",
    desc: "Pour visualiser sa trésorerie et tester ActiDec.",
    features: [
      "Synchronisation d'un compte pro",
      "Solde & encaissements en temps réel",
      "1 échéance provisionnée",
    ],
    cta: "Commencer gratuitement",
    ctaClass: "btn-ghost",
    href: APP_URL,
  },
  {
    plan: "Praticien",
    price: "12€",
    desc: "Le pilotage complet pour exercer l'esprit tranquille.",
    features: [
      "Tout le plan Découverte",
      "Provisions URSSAF, CARPIMKO, impôt, CFE",
      "Prévisionnel sur 12 mois",
      "Salaire conseillé & alertes découvert",
      "Optimisations fiscales chiffrées",
    ],
    cta: "Démarrer l'essai gratuit",
    ctaClass: "btn-cta",
    href: APP_URL,
    popular: true,
  },
  {
    plan: "Cabinet",
    price: "29€",
    desc: "Pour les cabinets de groupe et l'exercice partagé.",
    features: [
      "Tout le plan Praticien",
      "Plusieurs comptes & praticiens",
      "Répartition des charges du cabinet",
      "Export comptable & accès expert-comptable",
    ],
    cta: "Contacter l'équipe",
    ctaClass: "btn-ghost",
    href: `mailto:${CONTACT_EMAIL}`,
  },
];

export function Pricing() {
  return (
    <section className="block" id="tarifs" style={{ background: "var(--violet-50)" }}>
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Tarifs</span>
          <h2>Un prix simple, rentabilisé dès la première optimisation</h2>
          <p>
            Essai gratuit 30 jours, sans carte bancaire. Sans engagement,
            résiliable à tout moment.
          </p>
        </div>
        <div className="price-grid">
          {PLANS.map((plan) => (
            <div
              key={plan.plan}
              className={`price${plan.popular ? " pop" : ""}`}
            >
              {plan.popular && <span className="ribbon">Le plus choisi</span>}
              <div className="plan">{plan.plan}</div>
              <div className="amt">
                <span className="num">{plan.price}</span>
                <span className="per">/ mois</span>
              </div>
              <div className="desc">{plan.desc}</div>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <IconCheck />
                    {feature}
                  </li>
                ))}
              </ul>
              <a href={plan.href} className={`btn ${plan.ctaClass}`}>
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
