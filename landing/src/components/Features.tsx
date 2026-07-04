import { IconClock, IconEuroFlow, IconTrend } from "./icons";

const FEATURES = [
  {
    icon: <IconTrend />,
    iconClass: "ic-violet",
    title: "Trésorerie en temps réel",
    text: "Votre solde, vos encaissements et vos dépenses synchronisés depuis votre compte pro. Un coup d'œil suffit pour savoir où vous en êtes.",
  },
  {
    icon: <IconClock />,
    iconClass: "ic-orange",
    title: "Provisions automatiques",
    text: "URSSAF, CARPIMKO, impôt, CFE : ActiDec met de côté le bon montant à chaque encaissement. Plus jamais de mauvaise surprise à l'échéance.",
  },
  {
    icon: <IconEuroFlow />,
    iconClass: "ic-menthe",
    title: "Salaire que vous pouvez vous verser",
    text: "Une fois les charges provisionnées, ActiDec vous dit exactement combien vous pouvez vous verser sans risquer le découvert.",
  },
];

export function Features() {
  return (
    <section className="block" id="fonctionnalites">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Le pilotage, sans le casse-tête</span>
          <h2>Tout ce qui vous stressait, automatisé</h2>
          <p>
            Fini le tableur du dimanche soir et la peur du prélèvement URSSAF.
            ActiDec calcule tout, en continu, à partir de vos encaissements
            réels.
          </p>
        </div>
        <div className="feat-grid">
          {FEATURES.map((feat) => (
            <div key={feat.title} className="feat">
              <div className={`ic ${feat.iconClass}`}>{feat.icon}</div>
              <h3>{feat.title}</h3>
              <p>{feat.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
