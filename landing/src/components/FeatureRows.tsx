import { IconCheck } from "./icons";

const PROVISIONS = [
  { name: "URSSAF", note: "échéance 15/07/2026", amount: "1 842 €", width: "75%", accent: false },
  { name: "CARPIMKO", note: "échéance 30/06/2026", amount: "680 €", width: "48%", accent: false },
  { name: "Impôt — acompte", note: "15/08/2026", amount: "920 €", width: "32%", accent: true },
  { name: "CFE", note: "échéance 15/12/2026", amount: "240 €", width: "12%", accent: false },
];

const ENCAISSEMENTS = [
  { code: "CP", codeStyle: { background: "var(--violet-100)", color: "var(--violet-900)" }, name: "CPAM Île-de-France", note: "aujourd'hui · 09:14", amount: "+ 1 240,00 €", amountColor: "var(--menthe-700)" },
  { code: "MG", codeStyle: { background: "var(--peche-100)", color: "var(--orange-700)" }, name: "Mutuelle Générale", note: "aujourd'hui · 08:02", amount: "+ 380,00 €", amountColor: "var(--menthe-700)" },
  { code: "BR", codeStyle: { background: "var(--menthe-100)", color: "var(--menthe-700)" }, name: "Mme Bernadette R.", note: "hier · 17:48", amount: "+ 62,50 €", amountColor: "var(--menthe-700)" },
  { code: "JD", codeStyle: { background: "var(--line-2)", color: "var(--ink-3)" }, name: "M. Jean D.", note: "en attente", amount: "+ 45,00 €", amountColor: "var(--rouge)" },
];

const codeBadgeBase: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  display: "grid",
  placeItems: "center",
  fontSize: 11,
  fontWeight: 700,
};

function ProvisionsVisual() {
  return (
    <div className="fvisual">
      <div className="cf-head">
        <span className="t">Provisions à venir · T2 2026</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
          4 240 € au total
        </span>
      </div>
      <div className="prov">
        {PROVISIONS.map((item) => (
          <div key={item.name} className="prov-item">
            <div className="nm">
              {item.name}
              <small>{item.note}</small>
            </div>
            <div className="amt">{item.amount}</div>
            <div className={`bar${item.accent ? " o" : ""}`}>
              <span style={{ width: item.width }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EncaissementsVisual() {
  return (
    <div className="fvisual">
      <div className="cf-head">
        <span className="t">Derniers encaissements</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--menthe-700)" }}>
          + 1 727,50 € aujourd&apos;hui
        </span>
      </div>
      <div className="prov">
        {ENCAISSEMENTS.map((item) => (
          <div
            key={item.name}
            className="prov-item"
            style={{ gridTemplateColumns: "auto 1fr auto" }}
          >
            <span style={{ ...codeBadgeBase, ...item.codeStyle }}>
              {item.code}
            </span>
            <div className="nm" style={{ alignSelf: "center" }}>
              {item.name}
              <small>{item.note}</small>
            </div>
            <div className="amt" style={{ color: item.amountColor }}>
              {item.amount}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FeatureRows() {
  return (
    <section className="block" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="frow">
          <div className="ftext">
            <span className="eyebrow">Anticipation</span>
            <h3>Voyez vos charges arriver, des mois à l&apos;avance</h3>
            <p>
              ActiDec projette toutes vos échéances sociales et fiscales sur
              l&apos;année. Vous basculez entre le réel et le prévisionnel
              d&apos;un clic.
            </p>
            <ul className="flist">
              <li>
                <IconCheck />
                Échéancier URSSAF &amp; CARPIMKO complet
              </li>
              <li>
                <IconCheck />
                Alerte avant chaque prélèvement
              </li>
              <li>
                <IconCheck />
                Simulation de votre découvert évité
              </li>
            </ul>
          </div>
          <ProvisionsVisual />
        </div>

        <div className="frow rev">
          <div className="ftext">
            <span className="eyebrow">Connexion</span>
            <h3>Reliez votre compte pro en 2 minutes</h3>
            <p>
              Connexion bancaire sécurisée et chiffrée. Vos encaissements CPAM,
              mutuelles et patients se classent tout seuls, sans saisie
              manuelle.
            </p>
            <ul className="flist">
              <li>
                <IconCheck />
                Compatible avec toutes les banques françaises
              </li>
              <li>
                <IconCheck />
                Catégorisation automatique des flux
              </li>
              <li>
                <IconCheck />
                Données chiffrées, jamais revendues
              </li>
            </ul>
          </div>
          <EncaissementsVisual />
        </div>
      </div>
    </section>
  );
}
