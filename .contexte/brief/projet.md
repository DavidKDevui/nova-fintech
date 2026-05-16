# ACTIDEC - Brief Projet

## Vision
App web de visualisation et prevoyance de tresorerie pour les professionnels de sante liberaux (infirmiers, kines, sages-femmes, etc.).
Concurrent/reference : libe.app

## Cible
Professionnels de sante liberaux en exercice individuel (V1), puis cabinets de groupe SCP (V3).

## Stack
- Frontend/Backend : Next.js 16 (App Router, Server Actions) + TypeScript
- ORM : Drizzle ORM + PostgreSQL
- Hebergement : Infomaniak (staging + production, a mettre en place)
- Conformite RGPD, hebergement EU
- Pas de certification HDS — pas de stockage de donnees de sante en clair

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
- [x] Inscription par invitation email (admin invite, user setup son mdp)
- [x] Connexion JWT + refresh token
- [x] Mot de passe oublie (reset par email)
- [x] Suppression de compte (soft delete, RGPD)
- [x] Profil utilisateur (nom, prenom, profession, regime fiscal, date debut activite)
- [x] Onboarding guide premiere connexion (modal multi-etapes)
- [x] Backoffice admin : invitation de praticiens par email
- [x] Enum account_type : "practitioner" | "admin"
- [x] Route group (protected) pour les pages praticien

### Dashboard financier
- [x] Resume CA en attente (total + ventilation par statut)
- [x] Ventilation honoraires / majorations / ferie / IFD
- [x] Bandeau suggestion de lien cabinet
- [ ] Vue globale CA declare vs CA paye
- [ ] Solde estime disponible (apres charges)
- [x] Taux de rejet de factures + alerte seuil + detail (cf. /facturation > Taux de rejet, modal de config seuil)
- [ ] Evolution mensuelle en graphique (CA/depenses/solde 12 mois)
- [ ] Comparaison N vs N-1

### Import Ozzen
- [x] Upload manuel bordereaux PDF (admin/statements)
- [x] Detection type de document (rattrapage / noemie / releve / non-Ozzen)
- [x] Parsing automatique des rattrapages (383 passages, total exact)
- [x] Preview des donnees avant import
- [x] Detection des doublons (date+moment+invoice+cotation+practitioner+total)
- [x] Historique horodate des imports avec suppression
- [x] Creation de cabinet a la volee depuis l'import
- [x] Detection auto des liens praticien-cabinet post-import
- [ ] Parsing des retours Noemie
- [ ] Reconciliation rattrapages <-> Noemie

### Cabinets & Liaison praticien
- [x] Table practices (nom + FINESS)
- [x] Liaison many-to-many praticien-cabinet (practices_links)
- [x] Suggestions automatiques de lien (practices_links_suggestions)
- [x] Name matching normalise (accents, tirets, ordre, concatenation)
- [x] Bandeau de suggestion sur le dashboard praticien
- [x] Detection a l'onboarding + a chaque import

### Facturation (/facturation)
- [x] Tableau de tous les passages du praticien
- [x] Filtres : cabinet, statut, plage de dates
- [x] Tri par colonne (date, cabinet, n° facture, statut, total)
- [x] Resume par statut en cards

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
- [x] Alerte solde sous seuil (config dans /transactions, cooldown 7j, job check-alerts toutes les 15min)
- [ ] Notification sync Ozzen disponible
- [x] Alerte taux de rejet eleve (config dans /facturation > Taux de rejet, cooldown 14j, job quotidien à 8h30, échantillon min 10 bordereaux)
- [x] Rapport mensuel/trimestriel automatique par email (recapFrequency config dans /profile > Notifications)
- [x] Rappel hebdomadaire des échéances (deadlinesReminderEnabled config dans /profile > Notifications)

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
