const PROFESSIONS = [
  "Infirmiers",
  "Kinésithérapeutes",
  "Sages-femmes",
  "Orthophonistes",
  "Podologues",
  "Médecins",
];

export function TrustStrip() {
  return (
    <div className="trust">
      <div className="wrap trust-inner">
        <span className="lbl">
          Pensé pour les professions libérales de santé
        </span>
        <div className="pros">
          {PROFESSIONS.map((pro) => (
            <span key={pro} className="pro">
              {pro}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
