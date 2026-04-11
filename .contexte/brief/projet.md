# NOVA - Brief Projet

## Vision
App web de visualisation et prevoyance de tresorerie pour les professionnels de sante liberaux (infirmiers, kines, sages-femmes, etc.).
Concurrent/reference : libe.app

## Cible
Professionnels de sante liberaux en exercice individuel (V1), puis cabinets de groupe SCP (V3).

## Stack
- Backend : Express + Bun + TypeScript + Drizzle ORM + PostgreSQL
- Frontend : Next.js (app web responsive)
- Hebergement : Infomaniak (staging + production, a mettre en place)
- Conformite RGPD, hebergement EU

## Sources de donnees

### Bordereaux Ozzen (V1 = import manuel)
- Upload PDF ou CSV des bordereaux
- Parsing automatique
- Historique des imports
- V2 : integration API Ozzen native quand disponible

### Bridge API (connexion bancaire)
- Connexion du compte bancaire pro
- Recuperation automatique des transactions
- Sync limitee a 3x/mois (choix economique)
- Gestion du quota + alertes avant depassement

### API URSSAF / Open Fisca
- Calcul des cotisations (maladie, retraite, prevoyance, CARPIMKO)
- Estimation des prochaines cotisations selon le CA
- Suivi des echeances de paiement
- A investiguer (pas encore explore)

## Features V1

### Auth & Compte
- [x] Inscription email + mot de passe + verification email
- [x] Connexion JWT + refresh token
- [x] Mot de passe oublie (reset par email)
- [x] Suppression de compte (soft delete, RGPD)
- [ ] Profil utilisateur (nom, specialite, structure)
- [ ] Backoffice admin : creation de comptes par email + changement mot de passe a la premiere connexion

### Dashboard financier
- [ ] Vue globale CA declare vs CA paye
- [ ] Solde estime disponible (apres charges)
- [ ] Liste des transactions recentes (filtres date/montant/type)
- [ ] Taux de rejet de factures + alerte seuil + detail (qui a rejete, patient)
- [ ] Impositions passees (historique)
- [ ] Evolution mensuelle en graphique (CA/depenses/solde 12 mois)
- [ ] Comparaison N vs N-1

### Import Ozzen
- [ ] Upload manuel bordereaux (PDF/CSV)
- [ ] Parsing automatique
- [ ] Historique horodate des imports
- [ ] Gestion erreurs de parsing + alertes

### Bridge
- [ ] Connexion compte bancaire pro
- [ ] Recuperation transactions
- [ ] Quota 3x/mois + alertes
- [ ] Reconciliation transactions bancaires / bordereaux Ozzen

### URSSAF
- [ ] Connexion API Open Fisca
- [ ] Calcul cotisations automatique
- [ ] Suivi echeances
- [ ] Estimation prochaines cotisations selon CA
- [ ] Historique cotisations

### Module projection IA
- [ ] Estimation tresorerie a X semaines/mois
- [ ] Simulateur financier par scenario (conges, variation CA...)
- [ ] Estimation impots a venir (URSSAF, IR, CARPIMKO)
- [ ] Detection anomalies
- [ ] Recommandations personnalisees
- [ ] Score de sante financiere globale

### Notifications & Alertes
- [ ] Alerte solde sous seuil
- [ ] Notification sync Ozzen disponible
- [ ] Alerte taux de rejet eleve
- [ ] Rapport mensuel/trimestriel automatique par email

### Rapports & Export
- [ ] Export PDF du dashboard
- [ ] Bilan mensuel automatique

### UX
- [ ] Design responsive (mobile + desktop)
- [ ] Onboarding guide premiere connexion
- [ ] Logs d'activite / audit trail

## Features V2
- Authentification 2FA
- Integration API Ozzen native
- Indicateurs par categorie d'actes
- Rappel echeances fiscales
- Export CSV/Excel des transactions
- Partage securise avec expert-comptable (via Bridge)
- Rapprochement bancaire
- Mode sombre/clair
- Simulation optimisation imposition/epargne

## Features V3
- Multi-utilisateurs / cabinet de groupe (SCP)
