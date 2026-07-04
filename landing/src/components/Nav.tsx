const NAV_LINKS = [
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#optimisations", label: "Optimisations" },
  { href: "#etapes", label: "Comment ça marche" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#faq", label: "FAQ" },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`logo${className ? ` ${className}` : ""}`}>
      <span className="cap">A</span>cti<span className="cap">D</span>ec
      <span className="dot" />
    </span>
  );
}

export function Nav() {
  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <a href="#" aria-label="ActiDec — accueil">
          <Logo />
        </a>
        <nav className="nav-links">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="nav-actions">
          <a href="#" className="login">
            Se connecter
          </a>
          <a href="#tarifs" className="btn btn-cta">
            Essai gratuit 30 j
          </a>
        </div>
      </div>
    </header>
  );
}
