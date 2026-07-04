import { IconArrowRight, IconCheck, IconClock, IconEuroFlow } from "./icons";

const HERO_NOTES = [
  "Sans engagement",
  "Synchro bancaire sécurisée",
  "Sans carte bancaire",
];

const MOCK_KPIS = [
  { label: "Solde dispo", value: "6 240", badge: "à se verser", badgeKind: "g" },
  { label: "À provisionner", value: "2 180", badge: "URSSAF 15/07", badgeKind: "o" },
  { label: "CA · 30 j", value: "4 980", badge: "stable", badgeKind: "n" },
] as const;

function HeroMockup() {
  return (
    <div className="mock">
      {/* Badges flottants */}
      <div className="float-badge fb-1">
        <div className="ic" style={{ background: "var(--menthe-600)" }}>
          <IconEuroFlow />
        </div>
        <div className="tx">
          <div className="s">Encaissement CPAM</div>
          <div className="b" style={{ color: "var(--menthe-700)" }}>
            + 1 240,00 €
          </div>
        </div>
      </div>
      <div className="float-badge fb-2">
        <div className="ic" style={{ background: "var(--orange-600)" }}>
          <IconClock />
        </div>
        <div className="tx">
          <div className="s">URSSAF dans 6 jours</div>
          <div className="b">1 842 € provisionnés</div>
        </div>
      </div>

      {/* Carte dashboard */}
      <div className="mock-card">
        <div className="mock-top">
          <span className="d" />
          <span className="d" />
          <span className="d" />
          <span className="u">app.actidec.fr</span>
        </div>
        <div className="mock-nav">
          <span className="b">
            <span className="cap">A</span>d
          </span>
          <span className="t">Accueil</span>
          <span className="t on">Gestion</span>
          <span className="t">Optimisation</span>
        </div>
        <div className="mock-body">
          <div className="mock-h">
            <h4>Bonjour Camille 👋</h4>
            <div className="mock-toggle">
              <span className="on">Réel</span>
              <span>Prévisionnel</span>
            </div>
          </div>
          <div className="mock-kpis">
            {MOCK_KPIS.map((kpi) => (
              <div key={kpi.label} className="mk-kpi">
                <div className="l">{kpi.label}</div>
                <div className="v">
                  {kpi.value}
                  <span className="u">€</span>
                </div>
                <span className={`mk-badge ${kpi.badgeKind}`}>{kpi.badge}</span>
              </div>
            ))}
          </div>
          <div className="mk-chart">
            <div className="ch-h">
              <span className="ttl">Évolution du solde · 90 j</span>
              <span className="leg">
                <span>
                  <i style={{ background: "var(--violet-700)" }} />
                  Réel
                </span>
                <span>
                  <i style={{ background: "var(--peche-500)" }} />
                  Prévu
                </span>
              </span>
            </div>
            <svg viewBox="0 0 360 120" style={{ width: "100%", height: 110 }}>
              <g stroke="var(--line)" strokeWidth="1">
                <line x1="0" y1="30" x2="360" y2="30" />
                <line x1="0" y1="60" x2="360" y2="60" />
                <line x1="0" y1="90" x2="360" y2="90" />
              </g>
              <path
                d="M10 92 L60 80 L110 64 L160 70 L210 50 L260 56 L300 36 L300 120 L10 120 Z"
                fill="rgba(144,96,182,0.12)"
              />
              <path
                d="M10 92 L60 80 L110 64 L160 70 L210 50 L260 56 L300 36"
                stroke="var(--violet-700)"
                strokeWidth="2.4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M300 36 L330 44 L355 30"
                stroke="var(--peche-500)"
                strokeWidth="2.4"
                fill="none"
                strokeDasharray="4 4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="300"
                cy="36"
                r="3.6"
                fill="#fff"
                stroke="var(--violet-700)"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="hero">
      <div className="wrap hero-inner">
        <div>
          <span className="pill-tag">
            <span className="dot" />
            Conçu pour les soignants libéraux
          </span>
          <h1 style={{ marginTop: 20 }}>
            Votre trésorerie de soignant, <em>enfin lisible.</em>
          </h1>
          <p className="hero-lede">
            ActiDec relie votre compte pro, suit vos encaissements et
            provisionne automatiquement l&apos;URSSAF, la CARPIMKO et vos
            impôts. Vous savez à l&apos;euro près ce que vous pouvez vous verser.
          </p>
          <div className="hero-cta">
            <a href="#tarifs" className="btn btn-cta">
              Démarrer mon essai gratuit
              <IconArrowRight />
            </a>
            <a href="#etapes" className="btn btn-ghost">
              Voir comment ça marche
            </a>
          </div>
          <div className="hero-note">
            {HERO_NOTES.map((note) => (
              <span key={note} className="chk">
                <IconCheck />
                {note}
              </span>
            ))}
          </div>
        </div>

        <HeroMockup />
      </div>
    </section>
  );
}
