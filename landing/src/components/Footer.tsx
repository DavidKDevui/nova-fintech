import { Logo } from "./Nav";

const FOOTER_COLUMNS = [
  {
    title: "Produit",
    links: [
      { href: "#fonctionnalites", label: "Fonctionnalités" },
      { href: "#optimisations", label: "Optimisations" },
      { href: "#tarifs", label: "Tarifs" },
      { href: "#etapes", label: "Comment ça marche" },
    ],
  },
  {
    title: "Professions",
    links: [
      { href: "#", label: "Infirmiers" },
      { href: "#", label: "Kinésithérapeutes" },
      { href: "#", label: "Sages-femmes" },
      { href: "#", label: "Orthophonistes" },
    ],
  },
  {
    title: "Ressources",
    links: [
      { href: "#faq", label: "FAQ" },
      { href: "#", label: "Guide URSSAF" },
      { href: "#", label: "Sécurité & RGPD" },
      { href: "#", label: "Nous contacter" },
    ],
  },
];

export function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <Logo />
            <p className="foot-about">
              Le pilotage de trésorerie pensé pour les professionnels de santé
              libéraux. Anticipez vos charges, optimisez vos revenus, exercez
              l&apos;esprit léger.
            </p>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title} className="foot-col">
              <h5>{col.title}</h5>
              {col.links.map((link) => (
                <a key={link.label} href={link.href}>
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="foot-bottom">
          <span>© 2026 ActiDec — Tous droits réservés.</span>
          <span className="mono">app.actidec.fr</span>
        </div>
      </div>
    </footer>
  );
}
