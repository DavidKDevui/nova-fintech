const OPTIMISATIONS = [
  {
    variant: "fisc",
    tag: "Fiscal",
    tagClass: "",
    title: "Plan Épargne Retraite",
    text: "Déduisez jusqu'à 10 % de vos revenus pro de votre revenu imposable.",
    gain: "↳ gain estimé · 1 240 €/an",
  },
  {
    variant: "soc",
    tag: "Social",
    tagClass: "",
    title: "Prévoyance Pro",
    text: "Couverture en cas d'arrêt — entièrement déductible.",
    gain: "↳ gain estimé · 480 €/an",
  },
  {
    variant: "mnt",
    tag: "Fiscal",
    tagClass: "m",
    title: "Frais de blanchisserie",
    text: "Déclarez l'entretien de votre tenue professionnelle au réel.",
    gain: "↳ gain estimé · 320 €/an",
  },
  {
    variant: "fisc2",
    tag: "Fiscal",
    tagClass: "",
    title: "Chèques-vacances",
    text: "Plafond annuel exonéré de cotisations et défiscalisé.",
    gain: "↳ gain estimé · 540 €/an",
  },
];

export function Optimisations() {
  return (
    <section className="block optim-band" id="optimisations">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Et si vous payiez moins ?</span>
          <h2>Des optimisations concrètes, chiffrées pour vous</h2>
          <p>
            ActiDec repère les leviers fiscaux et sociaux adaptés à votre
            activité et estime le gain — vous décidez, on calcule.
          </p>
        </div>
        <div className="optim-grid">
          {OPTIMISATIONS.map((opt) => (
            <div key={opt.title} className={`opt ${opt.variant}`}>
              <span className={`tag${opt.tagClass ? ` ${opt.tagClass}` : ""}`}>
                {opt.tag}
              </span>
              <div>
                <h4>{opt.title}</h4>
                <p>{opt.text}</p>
              </div>
              <div className="gain">{opt.gain}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
