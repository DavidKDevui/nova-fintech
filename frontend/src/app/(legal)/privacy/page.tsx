export const metadata = {
  title: "Politique de confidentialité — Actidec",
  description: "Politique de confidentialité et traitement des données personnelles de Actidec (RGPD).",
};

function TBD({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded text-xs font-semibold align-middle">
      {children}
    </span>
  );
}

export default function PrivacyPage() {
  return (
    <article className="prose prose-sm max-w-none">
      <h1 className="text-2xl font-bold text-ardoise-900 mb-2">Politique de confidentialité</h1>
      <p className="text-xs text-ardoise-500 mb-6">Dernière mise à jour&nbsp;: 15&nbsp;mai&nbsp;2026</p>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-8 text-xs text-amber-900">
        <strong>Document en cours de finalisation.</strong> Les éléments surlignés en orange (
        <TBD>comme ceci</TBD>
        ) sont à compléter par l&apos;éditeur avant mise en production publique.
      </div>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-ardoise-900 mb-2">1. Responsable de traitement</h2>
        <p className="text-sm text-ardoise-700 leading-relaxed">
          Le responsable du traitement des données personnelles est&nbsp;<TBD>[Raison sociale]</TBD>,
          <TBD>[forme juridique]</TBD>, dont le siège social est situé <TBD>[Adresse]</TBD>. Vous pouvez nous
          joindre à l&apos;adresse&nbsp;<TBD>[email RGPD — ex : privacy@actidec.fr]</TBD>.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-ardoise-900 mb-2">2. Données collectées</h2>
        <p className="text-sm text-ardoise-700 leading-relaxed mb-3">
          Pour vous fournir le service, nous collectons et traitons les catégories de données suivantes&nbsp;:
        </p>
        <ul className="text-sm text-ardoise-700 leading-relaxed list-disc pl-5 space-y-1">
          <li><strong>Identité&nbsp;:</strong> nom, prénom, adresse email, mot de passe (haché).</li>
          <li><strong>Profession&nbsp;:</strong> numéro RPPS, date de début d&apos;activité, régime fiscal, profession, lien avec cabinets (FINESS).</li>
          <li><strong>Données bancaires&nbsp;:</strong> comptes, soldes, transactions, agrégées via Bridge by Bankin&apos; (PSIC agréé ACPR).</li>
          <li><strong>Données fiscales&nbsp;:</strong> situation conjugale, enfants à charge, autres revenus du foyer, IR déclaré (saisi par l&apos;utilisateur).</li>
          <li><strong>Données d&apos;activité&nbsp;:</strong> jours de vacances, taux de prélèvement à la source, préférences de fréquence des cotisations.</li>
          <li><strong>Données techniques&nbsp;:</strong> logs d&apos;authentification (identifiants anonymisés), adresse IP utilisée pour les contrôles de sécurité (rate-limiting).</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-ardoise-900 mb-2">3. Finalités et bases légales</h2>
        <table className="w-full text-sm text-ardoise-700 border-collapse">
          <thead>
            <tr className="border-b border-ardoise-200 text-xs uppercase text-ardoise-500">
              <th className="text-left py-2 pr-3">Finalité</th>
              <th className="text-left py-2 pr-3">Base légale (RGPD)</th>
              <th className="text-left py-2">Durée</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ardoise-100">
            <tr>
              <td className="py-2 pr-3">Exécution du contrat (gestion fiscale/comptable)</td>
              <td className="py-2 pr-3">Art. 6.1.b — Contrat</td>
              <td className="py-2">Durée du compte + 5 ans (obligations comptables)</td>
            </tr>
            <tr>
              <td className="py-2 pr-3">Sécurité et prévention de la fraude</td>
              <td className="py-2 pr-3">Art. 6.1.f — Intérêt légitime</td>
              <td className="py-2">12 mois (logs)</td>
            </tr>
            <tr>
              <td className="py-2 pr-3">Communication produit (emails de rappel)</td>
              <td className="py-2 pr-3">Art. 6.1.b — Contrat</td>
              <td className="py-2">Durée du compte</td>
            </tr>
            <tr>
              <td className="py-2 pr-3">Obligations comptables et fiscales</td>
              <td className="py-2 pr-3">Art. 6.1.c — Obligation légale</td>
              <td className="py-2">10 ans (Code de commerce)</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-ardoise-900 mb-2">4. Sous-traitants</h2>
        <p className="text-sm text-ardoise-700 leading-relaxed mb-3">
          Nous faisons appel aux sous-traitants suivants, chacun engagé contractuellement à respecter le RGPD&nbsp;:
        </p>
        <ul className="text-sm text-ardoise-700 leading-relaxed list-disc pl-5 space-y-1">
          <li><strong>Bridge by Bankin&apos;</strong> (France) — agrégation des comptes bancaires (PSIC agréé ACPR).</li>
          <li><strong>Infomaniak Network SA</strong> (Suisse, Genève) — hébergement de l&apos;application et de la base de données. La Suisse bénéficie d&apos;une décision d&apos;adéquation de la Commission européenne (équivalence RGPD).</li>
          <li><strong><TBD>[Fournisseur SMTP — ex&nbsp;: Infomaniak Mail / SendGrid]</TBD></strong> — envoi des emails transactionnels.</li>
          <li><strong>OpenAI, L.L.C.</strong> (États-Unis) — assistant IA. Les messages envoyés à l&apos;assistant sont transmis à OpenAI. Les transferts hors UE sont encadrés par les clauses contractuelles types de la Commission européenne.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-ardoise-900 mb-2">5. Vos droits</h2>
        <p className="text-sm text-ardoise-700 leading-relaxed mb-3">
          Conformément aux articles 15 à 22 du RGPD, vous disposez des droits suivants&nbsp;:
        </p>
        <ul className="text-sm text-ardoise-700 leading-relaxed list-disc pl-5 space-y-1">
          <li><strong>Accès</strong> (Art. 15) — consulter les données que nous détenons à votre sujet.</li>
          <li><strong>Rectification</strong> (Art. 16) — corriger les données inexactes depuis votre profil.</li>
          <li><strong>Effacement</strong> (Art. 17) — supprimer votre compte et l&apos;ensemble des données associées depuis l&apos;onglet Profil → Zone de danger.</li>
          <li><strong>Portabilité</strong> (Art. 20) — télécharger l&apos;intégralité de vos données au format JSON depuis l&apos;onglet&nbsp;<em>Profil → Exporter mes données</em>.</li>
          <li><strong>Opposition et limitation</strong> (Art. 21, 18) — limiter certains traitements en nous contactant.</li>
          <li><strong>Retrait du consentement</strong> à tout moment (sans effet rétroactif).</li>
        </ul>
        <p className="text-sm text-ardoise-700 leading-relaxed mt-3">
          Pour exercer ces droits, écrivez à&nbsp;<TBD>[email RGPD]</TBD>.
          Vous pouvez également introduire une réclamation auprès de la CNIL&nbsp;(<a href="https://www.cnil.fr" target="_blank" rel="noreferrer noopener" className="text-brand-600 hover:underline">www.cnil.fr</a>).
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-ardoise-900 mb-2">6. Sécurité</h2>
        <ul className="text-sm text-ardoise-700 leading-relaxed list-disc pl-5 space-y-1">
          <li>Mots de passe stockés en clair&nbsp;<strong>jamais</strong>&nbsp;: hachage <code className="bg-ardoise-100 px-1 rounded text-xs">bcrypt</code> avec coût&nbsp;12.</li>
          <li>Cookies de session <code className="bg-ardoise-100 px-1 rounded text-xs">HttpOnly</code>, <code className="bg-ardoise-100 px-1 rounded text-xs">SameSite=Lax</code>, <code className="bg-ardoise-100 px-1 rounded text-xs">Secure</code> en production.</li>
          <li>Connexion HTTPS forcée en production.</li>
          <li>Limitation des tentatives de connexion (rate-limiting).</li>
          <li>Logs d&apos;authentification anonymisés (pas d&apos;email en clair).</li>
          <li>
            Suppression de compte&nbsp;: les données personnelles (profil, situation fiscale,
            transactions bancaires, alertes, congés, liens cabinets) sont effectivement
            supprimées. L&apos;email du compte et l&apos;historique des notifications sont anonymisés.
            Les bordereaux de soins importés par votre cabinet sont conservés au titre des
            obligations comptables (CGI, 10 ans) mais votre nom y est anonymisé.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-ardoise-900 mb-2">7. Cookies</h2>
        <p className="text-sm text-ardoise-700 leading-relaxed">
          Actidec utilise uniquement des cookies <strong>strictement nécessaires</strong> au fonctionnement
          du service (session, sécurité). Aucun cookie de mesure d&apos;audience ou publicitaire n&apos;est déposé.
          Aucun consentement préalable n&apos;est donc requis (Art. 82 LIL).
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-ardoise-900 mb-2">8. Modifications</h2>
        <p className="text-sm text-ardoise-700 leading-relaxed">
          Cette politique peut être mise à jour. La date de dernière mise à jour figure en haut du document.
          En cas de modification substantielle, vous serez notifié(e) par email.
        </p>
      </section>
    </article>
  );
}
