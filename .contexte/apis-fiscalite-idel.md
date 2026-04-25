# APIs disponibles pour la fiscalité IDEL — Synchronisation dynamique des taux

Ce document recense, pour chaque taxe/cotisation applicable aux IDEL, les APIs publiques ou officielles permettant de récupérer les taux et montants de manière dynamique.

---

## 1. Impôt sur le revenu (barème IR)

### API OpenFisca (recommandée)

Moteur de calcul open source qui modélise le système socio-fiscal français. Maintenu par beta.gouv.fr.

- **Base URL** : `https://api.fr.openfisca.org/latest`
- **Accès** : Gratuit, sans authentification, sans clé API
- **SLA** : Aucun (instance de prototypage) — possibilité d'auto-héberger
- **Documentation** : [openfisca.org/doc](https://openfisca.org/doc/openfisca-web-api/endpoints.html)
- **GitHub** : [openfisca/openfisca-france](https://github.com/openfisca/openfisca-france)

#### Endpoints utiles

| Endpoint | Méthode | Usage |
|---|---|---|
| `/parameters` | GET | Liste tous les paramètres (barèmes IR, taux CSG, PASS, etc.) |
| `/parameters/{id}` | GET | Détail d'un paramètre avec historique des valeurs |
| `/variables` | GET | Liste toutes les variables calculables |
| `/calculate` | POST | Calcul d'une simulation complète sur une situation |
| `/spec` | GET | Spécification OpenAPI / Swagger |

#### Paramètres pertinents pour IDEL

- `impot_revenu.bareme` — tranches et taux du barème progressif IR
- `impot_revenu.decote` — seuil et taux de la décote
- `prelevements_sociaux.contributions_sociales.csg` — taux de CSG
- `prelevements_sociaux.contributions_sociales.crds` — taux de CRDS
- `cotsoc.gen.plafond_securite_sociale` — valeur du PASS

#### Exemple de requête

```bash
# Récupérer le barème IR avec historique
curl https://api.fr.openfisca.org/latest/parameter/impot_revenu.bareme

# Récupérer la valeur du PASS
curl https://api.fr.openfisca.org/latest/parameter/cotsoc.gen.plafond_securite_sociale
```

#### Limites

- Instance publique sans garantie de disponibilité
- Pour la production : auto-héberger via `pip install openfisca-france`
- Les cotisations spécifiques IDEL/CARPIMKO ne sont pas toutes modélisées

---

## 2. Cotisations sociales URSSAF (maladie, CSG/CRDS, allocations familiales)

### API Mon-Entreprise (URSSAF officielle)

Simulateur officiel de l'URSSAF exposé en API REST, basé sur le langage **publicodes**.

- **Base URL** : `https://mon-entreprise.urssaf.fr/api/v1`
- **Accès** : Gratuit, sans authentification
- **Swagger** : `https://mon-entreprise.urssaf.fr/api/v1/doc/`
- **GitHub** : [betagouv/mon-entreprise](https://github.com/betagouv/mon-entreprise)
- **Référence** : [api.gouv.fr/les-api/api-mon-entreprise](https://api.gouv.fr/les-api/api-mon-entreprise)

#### Endpoints

| Endpoint | Méthode | Usage |
|---|---|---|
| `/evaluate` | POST | Évaluer des expressions publicodes avec une situation donnée |
| `/rules` | GET | Récupérer toutes les règles disponibles (taux, barèmes, formules) |
| `/rules/{rule}` | GET | Détail d'une règle spécifique |

#### Exemple de requête — Cotisations indépendant

```bash
curl -X POST https://mon-entreprise.urssaf.fr/api/v1/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "expressions": [
      "dirigeant . indépendant . cotisations et contributions"
    ],
    "situation": {
      "dirigeant . indépendant . revenu professionnel": 50000
    }
  }'
```

#### Réponse

```json
{
  "evaluate": [
    {
      "nodeValue": 18234.56,
      "missingVariables": []
    }
  ]
}
```

#### Règles utiles pour IDEL

- `dirigeant . indépendant . cotisations et contributions` — total des cotisations
- `dirigeant . indépendant . cotisations et contributions . maladie` — maladie-maternité
- `dirigeant . indépendant . cotisations et contributions . CSG-CRDS` — CSG + CRDS
- `dirigeant . indépendant . cotisations et contributions . allocations familiales` — AF
- `dirigeant . indépendant . cotisations et contributions . retraite de base` — retraite
- `dirigeant . indépendant . cotisations et contributions . formation professionnelle` — CFP

#### Avantages

- Maintenu par l'URSSAF elle-même (beta.gouv.fr)
- Mis à jour à chaque changement de taux officiel
- Couvre la plupart des cotisations sociales des indépendants
- Basé sur publicodes : les règles sont lisibles et vérifiables

#### Limites

- Ne couvre pas les cotisations CARPIMKO spécifiquement
- Pas de SLA formel (mais très stable en pratique)

---

## 3. Cotisations retraite CARPIMKO

### Aucune API publique disponible

La CARPIMKO **ne propose pas d'API** pour récupérer ses taux de cotisation.

#### Alternatives

| Solution | Détail |
|---|---|
| **Scraping du site CARPIMKO** | Les barèmes sont publiés sur [carpimko.com](https://www.carpimko.com) mais sans API |
| **Table de référence locale** | Maintenir un fichier JSON/DB avec les taux, mis à jour manuellement 1x/an |
| **OpenFisca partiel** | Certains paramètres de retraite de base sont dans OpenFisca, mais pas la complémentaire CARPIMKO |
| **Mon-Entreprise partiel** | La retraite de base (CNAVPL) est couverte, pas la complémentaire CARPIMKO |

#### Recommandation

Créer un fichier de configuration `carpimko-rates.json` :

```json
{
  "annee": 2026,
  "pass": 48060,
  "retraite_base": {
    "taux_tranche1": 0.0823,
    "plafond_tranche1": 48060,
    "taux_tranche2": 0.0187
  },
  "retraite_complementaire": {
    "forfait": 2312,
    "taux_proportionnel": 0.03,
    "plancher": 25246,
    "plafond": 237179
  },
  "invalidite_deces": 1022,
  "asv": {
    "forfait_affilie": 224,
    "forfait_cpam": 447,
    "taux_proportionnel": 0.004
  }
}
```

Mettre à jour ce fichier **une fois par an** (janvier) lors de la publication des nouveaux barèmes.

---

## 4. CFE (Cotisation Foncière des Entreprises)

### API Data Economie (DGFiP)

Le Ministère de l'Économie expose les taux de fiscalité locale par commune via une API REST.

- **Base URL** : `https://data.economie.gouv.fr/api/explore/v2.1`
- **Accès** : Gratuit, sans authentification
- **Dataset** : `fiscalite-locale-des-entreprises`
- **Total records** : ~139 794 communes

#### Endpoint

```
GET /catalog/datasets/fiscalite-locale-des-entreprises/records
```

#### Paramètres de requête

| Paramètre | Usage |
|---|---|
| `where` | Filtre SQL (ex: `insee_com = '75056'` pour Paris) |
| `select` | Champs à retourner |
| `limit` | Nombre de résultats (défaut: 10, max: 100) |

#### Champs disponibles pour la CFE

| Champ | Description |
|---|---|
| `taux_global_cfe_hz` | Taux CFE hors zone d'activité économique |
| `taux_global_cfe_zae` | Taux CFE en zone d'activité économique |
| `taux_global_cfe_eol` | Taux CFE éoliennes |
| `insee_com` | Code INSEE de la commune |
| `libcom` | Nom de la commune |
| `dep` | Département |

#### Exemple de requête

```bash
# Taux CFE pour Paris (code INSEE 75056)
curl "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/fiscalite-locale-des-entreprises/records?where=insee_com%3D'75056'&select=libcom,taux_global_cfe_hz,taux_global_cfe_zae"
```

#### Limites

- Données mises à jour annuellement (fichier REI)
- Donne le taux mais pas la base d'imposition (valeur locative) qui dépend du local

---

## 5. TVA

### Pas d'API nécessaire

Les soins infirmiers sont **exonérés de TVA** de manière permanente (article 261-4-1° du CGI). Ce n'est pas un taux variable, c'est une exonération légale.

**Implémentation** : constante `TVA_SOINS_INFIRMIERS = 0` dans le code.

---

## 6. CVAE

### Pas d'API nécessaire pour les IDEL

Seuil d'assujettissement : CA > 500 000 €. La quasi-totalité des IDEL ne sont pas concernés.

Si nécessaire, le taux est disponible via OpenFisca ou dans le Code Général des Impôts.

---

## 7. Taxe foncière

### API Data Economie (même source que CFE)

- **Dataset** : `fiscalite-locale-des-particuliers`
- **Endpoint** : `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/fiscalite-locale-des-particuliers/records`
- **Champ** : `taux_global_tfb` (taxe foncière sur les propriétés bâties)

```bash
# Taux taxe foncière pour une commune
curl "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/fiscalite-locale-des-particuliers/records?where=insee_com%3D'75056'&select=libcom,taux_global_tfb"
```

---

## 8. PASS (Plafond Annuel de la Sécurité Sociale)

Valeur de référence utilisée par plusieurs calculs. Récupérable via :

- **OpenFisca** : `GET /parameter/cotsoc.gen.plafond_securite_sociale`
- **Mon-Entreprise** : `GET /rules/plafond sécurité sociale`

---

## Synthèse : couverture API par taxe

| Taxe / Cotisation | API dynamique | Fiabilité | Mise à jour |
|---|---|---|---|
| **IR (barème)** | OpenFisca | Bonne | Continue (open source) |
| **URSSAF maladie** | Mon-Entreprise | Excellente | Officielle URSSAF |
| **CSG/CRDS** | Mon-Entreprise + OpenFisca | Excellente | Officielle |
| **Allocations familiales** | Mon-Entreprise | Excellente | Officielle |
| **CFP** | Mon-Entreprise | Excellente | Officielle |
| **CARPIMKO retraite** | Aucune API | — | Manuelle 1x/an |
| **CARPIMKO invalidité** | Aucune API | — | Manuelle 1x/an |
| **CFE** | Data Economie | Bonne | Annuelle (REI) |
| **TVA** | Non nécessaire | — | Exonération permanente |
| **CVAE** | Non applicable | — | Seuil non atteint |
| **Taxe foncière** | Data Economie | Bonne | Annuelle (REI) |
| **PASS** | OpenFisca | Bonne | Annuelle |

---

## Recommandation d'architecture

```
┌─────────────────────────────────────────────┐
│              Nova-Fintech App               │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────┐    ┌────────────────────┐  │
│  │ Tax Engine  │───▶│ Cache / Fallback   │  │
│  │  (service)  │    │ (JSON local)       │  │
│  └──────┬──────┘    └────────────────────┘  │
│         │                                   │
└─────────┼───────────────────────────────────┘
          │
    ┌─────┼──────────────────┐
    │     │                  │
    ▼     ▼                  ▼
┌───────┐ ┌──────────────┐ ┌──────────────────┐
│OpenFis│ │Mon-Entreprise│ │Data Economie     │
│ca API │ │URSSAF API    │ │(DGFiP)           │
│       │ │              │ │                  │
│• IR   │ │• Maladie     │ │• CFE par commune │
│• CSG  │ │• CSG/CRDS    │ │• Taxe foncière   │
│• PASS │ │• AF, CFP     │ │                  │
└───────┘ └──────────────┘ └──────────────────┘
```

**Stratégie** :
1. Appeler les APIs au démarrage ou via un cron quotidien/hebdomadaire
2. Stocker les résultats en cache (DB ou fichier JSON)
3. Fallback sur les valeurs en cache si l'API est indisponible
4. Pour CARPIMKO : mise à jour manuelle annuelle du fichier de config

---

## Sources

- [API Mon-Entreprise — Swagger](https://mon-entreprise.urssaf.fr/api/v1/doc/)
- [API Mon-Entreprise — api.gouv.fr](https://api.gouv.fr/les-api/api-mon-entreprise)
- [GitHub Mon-Entreprise](https://github.com/betagouv/mon-entreprise)
- [OpenFisca API — Documentation](https://openfisca.org/doc/openfisca-web-api/endpoints.html)
- [OpenFisca France — GitHub](https://github.com/openfisca/openfisca-france)
- [Data Economie — Fiscalité locale entreprises](https://data.economie.gouv.fr/explore/dataset/fiscalite-locale-des-entreprises/api/)
- [Data Economie — Fiscalité locale particuliers](https://data.economie.gouv.fr/explore/dataset/fiscalite-locale-des-particuliers/api/)
- [APIs URSSAF — api.gouv.fr](https://api.gouv.fr/producteurs/urssaf)
- [OpenFisca — api.gouv.fr](https://api.gouv.fr/les-api/openfisca)
