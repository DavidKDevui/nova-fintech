import { IconPlus } from "./icons";

const QUESTIONS = [
  {
    q: "ActiDec remplace-t-il mon expert-comptable ?",
    a: "Non — ActiDec pilote votre trésorerie au quotidien et anticipe vos charges, mais ne produit pas votre liasse fiscale. Le plan Cabinet permet justement de partager un accès à votre expert-comptable pour fluidifier les échanges.",
  },
  {
    q: "La connexion à ma banque est-elle sécurisée ?",
    a: "Oui. La synchronisation passe par un agrégateur agréé et les données sont chiffrées de bout en bout. ActiDec n'a qu'un accès en lecture seule : aucune opération ne peut être déclenchée sur votre compte, et vos données ne sont jamais revendues.",
  },
  {
    q: "Mes taux URSSAF et CARPIMKO sont-ils bien pris en compte ?",
    a: "ActiDec applique les taux en vigueur selon votre profession et votre régime (PAMC, début d'activité, etc.) et les ajuste à chaque changement réglementaire. Vous pouvez aussi les personnaliser si votre situation est spécifique.",
  },
  {
    q: "Est-ce adapté si je débute mon activité ?",
    a: "C'est même le meilleur moment pour commencer. ActiDec gère les spécificités du début d'activité (cotisations forfaitaires, régularisations) et vous évite les mauvaises surprises de la 2ᵉ et 3ᵉ année, souvent redoutées.",
  },
  {
    q: "Puis-je résilier quand je veux ?",
    a: "Oui, sans engagement. L'essai de 30 jours est gratuit et ne demande pas de carte bancaire. Au-delà, vous pouvez résilier en un clic depuis votre espace, à tout moment.",
  },
];

export function Faq() {
  return (
    <section className="block" id="faq">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Questions fréquentes</span>
          <h2>Tout ce que vous vous demandez</h2>
        </div>
        <div className="faq">
          {QUESTIONS.map((item, i) => (
            <details
              key={item.q}
              className="qa"
              {...(i === 0 ? { open: true } : {})}
            >
              <summary>
                {item.q}
                <span className="x">
                  <IconPlus />
                </span>
              </summary>
              <div className="ans">{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
