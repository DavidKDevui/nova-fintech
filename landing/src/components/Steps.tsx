const STEPS = [
  {
    n: "01",
    title: "Créez votre compte",
    text: "Renseignez votre profession et votre régime. ActiDec configure vos taux URSSAF et CARPIMKO automatiquement.",
  },
  {
    n: "02",
    title: "Reliez votre banque",
    text: "Connexion sécurisée à votre compte pro. Vos encaissements et dépenses remontent et se classent seuls.",
  },
  {
    n: "03",
    title: "Pilotez sereinement",
    text: "Solde disponible, provisions, salaire conseillé, optimisations : tout est à jour, en continu.",
  },
];

export function Steps() {
  return (
    <section className="block" id="etapes">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Comment ça marche</span>
          <h2>Opérationnel en moins de 5 minutes</h2>
        </div>
        <div className="steps">
          {STEPS.map((step, i) => (
            <div key={step.n} className="step">
              {i < STEPS.length - 1 && <div className="connector" />}
              <div className="n">{step.n}</div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
