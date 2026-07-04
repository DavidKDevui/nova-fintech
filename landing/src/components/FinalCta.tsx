import { IconArrowRight } from "./icons";

export function FinalCta() {
  return (
    <section className="block" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="final">
          <h2>Reprenez le contrôle de votre trésorerie</h2>
          <p>
            Rejoignez les soignants qui ne stressent plus à chaque échéance. 30
            jours gratuits, sans carte bancaire.
          </p>
          <div className="hero-cta">
            <a href="#" className="btn btn-white">
              Démarrer mon essai gratuit
              <IconArrowRight />
            </a>
            <a
              href="#etapes"
              className="btn"
              style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
            >
              Réserver une démo
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
