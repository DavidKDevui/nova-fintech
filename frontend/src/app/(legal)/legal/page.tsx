export const metadata = {
  title: "Mentions légales — Actidec",
  description: "Mentions légales du service Actidec.",
};

// Composant visuel pour marquer les placeholders à compléter avant production.
function TBD({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded text-xs font-semibold align-middle">
      {children}
    </span>
  );
}

export default function LegalPage() {
  return (
    <article className="prose prose-sm max-w-none">
      <h1 className="text-2xl font-bold text-ardoise-900 mb-2">Mentions légales</h1>
      <p className="text-xs text-ardoise-500 mb-6">Dernière mise à jour&nbsp;: 15&nbsp;mai&nbsp;2026</p>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-8 text-xs text-amber-900">
        <strong>Document en cours de finalisation.</strong> Les éléments surlignés en orange (
        <TBD>comme ceci</TBD>
        ) sont à compléter par l&apos;éditeur avant mise en production publique.
      </div>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-ardoise-900 mb-2">Éditeur du service</h2>
        <p className="text-sm text-ardoise-700 leading-relaxed">
          Actidec est édité par&nbsp;<TBD>[Raison sociale]</TBD>, <TBD>[forme juridique]</TBD> au capital de <TBD>[montant]&nbsp;€</TBD>,
          immatriculée au RCS de <TBD>[ville]</TBD> sous le numéro <TBD>[SIREN]</TBD>, dont le siège social est situé&nbsp;:
          <br />
          <TBD>[Adresse postale complète]</TBD>
          <br />
          <strong>Numéro de TVA intracommunautaire&nbsp;:</strong> <TBD>[FR XX XXXXXXXXX]</TBD>
          <br />
          <strong>Directeur de la publication&nbsp;:</strong> <TBD>[Nom du dirigeant]</TBD>
          <br />
          <strong>Contact&nbsp;:</strong> <TBD>[email de contact]</TBD>
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-ardoise-900 mb-2">Hébergement</h2>
        <p className="text-sm text-ardoise-700 leading-relaxed">
          L&apos;application et sa base de données sont hébergées par&nbsp;
          <strong>Infomaniak Network SA</strong> (VPS Lite), Rue Eugène-Marziano 25, 1227 Les Acacias,
          Genève, Suisse&nbsp;— <a href="https://www.infomaniak.com" target="_blank" rel="noreferrer noopener" className="text-brand-600 hover:underline">www.infomaniak.com</a>.
          La Suisse bénéficie d&apos;une décision d&apos;adéquation de la Commission européenne, garantissant un
          niveau de protection des données équivalent à celui du RGPD.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-ardoise-900 mb-2">Propriété intellectuelle</h2>
        <p className="text-sm text-ardoise-700 leading-relaxed">
          L&apos;ensemble des éléments composant ce service (interface, textes, graphismes, logos, code source) est la
          propriété exclusive de Actidec ou de ses partenaires. Toute reproduction, représentation, modification
          ou exploitation, totale ou partielle, sans autorisation écrite préalable est interdite.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-ardoise-900 mb-2">Activité réglementée</h2>
        <p className="text-sm text-ardoise-700 leading-relaxed">
          L&apos;agrégation des comptes bancaires est réalisée par <strong>Bridge by Bankin&apos;</strong>, prestataire de
          services d&apos;information sur les comptes (PSIC) agréé par l&apos;ACPR (Autorité de Contrôle Prudentiel et de
          Résolution). Actidec intervient uniquement en tant que réutilisateur des données agrégées, dans le
          cadre de l&apos;exécution du contrat conclu avec l&apos;utilisateur.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-ardoise-900 mb-2">Responsabilité</h2>
        <p className="text-sm text-ardoise-700 leading-relaxed">
          Actidec met tout en œuvre pour fournir des estimations fiscales et comptables fiables, mais ne saurait
          se substituer à un expert-comptable ou à un conseil fiscal agréé. Les estimations affichées sont fondées
          sur les données saisies par l&apos;utilisateur et les transactions bancaires synchronisées, et ne constituent
          pas un conseil professionnel personnalisé.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-ardoise-900 mb-2">Droit applicable</h2>
        <p className="text-sm text-ardoise-700 leading-relaxed">
          Le présent service est régi par le droit français. Tout litige relatif à son utilisation relève de la
          compétence exclusive des tribunaux français.
        </p>
      </section>
    </article>
  );
}
