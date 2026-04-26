# Bordereaux Ozzen — Architecture & Implementation

## Types de documents

### 1. Rattrapages (implementé)
- Soins réalisés mais pas encore payés (créances)
- Contient le détail passage par passage
- Statuts : "à sécuriser" (carte Vitale non passée) ou "à envoyer" (prêt à télétransmettre)

### 2. Retours Noémie (non implementé)
- Paiements reçus des organismes payeurs (CPAM, mutuelles)
- Permet de mettre à jour le statut des passages : payé ou rejeté
- Contient les références de virement, organismes payeurs, motifs de rejet

### 3. Relevé mensuel (non implementé, basse priorité)
- Résumé agrégé du CA encaissé par mois
- Calculable à partir des deux autres — utile seulement pour vérification

## Tables

### practices
| Champ | Type | Description |
|---|---|---|
| id | UUID | PK |
| name | VARCHAR(255) | Nom du cabinet ("Balzano Celia (perso)") |
| finess | VARCHAR(9) | Numéro FINESS unique |

### practices_links
| Champ | Type | Description |
|---|---|---|
| id | UUID | PK |
| practice_id | UUID | FK -> practices |
| practitioner_id | UUID | FK -> practitioners |

### practices_links_suggestions
| Champ | Type | Description |
|---|---|---|
| id | UUID | PK |
| practice_id | UUID | FK -> practices |
| practitioner_id | UUID | FK -> practitioners |
| status | ENUM | pending, accepted, dismissed |

### bordereau_imports
| Champ | Type | Description |
|---|---|---|
| id | UUID | PK |
| practice_id | UUID | FK -> practices |
| file_name | VARCHAR(500) | Nom du fichier importé |
| document_type | VARCHAR(50) | "rattrapage" ou "noemie" |
| passage_count | INTEGER | Nombre de passages importés |
| total_amount | NUMERIC(12,2) | Montant total |

### care_passages
| Champ | Type | Description |
|---|---|---|
| id | UUID | PK |
| practice_id | UUID | FK -> practices |
| import_id | UUID | FK -> bordereau_imports (nullable) |
| invoice_number | VARCHAR(20) | N° facture Ozzen (ex: "4218") |
| care_date | DATE | Date du soin |
| care_moment | VARCHAR(20) | matin, midi, soir, nuit, 07h30... |
| practitioner | VARCHAR(255) | Nom du praticien (texte brut du PDF) |
| cotation | VARCHAR(255) | Code NGAP (ex: "AMX 4 + MCI") |
| status | ENUM | a_securiser, a_envoyer, paye, rejete |
| part_caisse_status | VARCHAR(50) | Statut part Sécu |
| part_mutuelle_status | VARCHAR(50) | Statut part mutuelle |
| honoraires | NUMERIC(10,2) | |
| majoration | NUMERIC(10,2) | |
| ferie_dim_nuit | NUMERIC(10,2) | |
| ifd | NUMERIC(10,2) | Indemnité Forfaitaire de Déplacement |
| total | NUMERIC(10,2) | |

## Parsing PDF (rattrapages)

### Fichier
`src/lib/parsers/parse-rattrapages.ts`

### Détection du type de document
`src/lib/parsers/detect-document.ts`
- Vérifie que c'est un document Ozzen ("OZZEN SAS")
- Distingue rattrapage / noémie / relevé mensuel / inconnu

### Logique de parsing
1. Extraction texte brut via `pdf-parse` (v1.1.1, import via `pdf-parse/lib/pdf-parse`)
2. Parsing de l'en-tête : cabinet, période, praticiens, statut global
3. Parsing des sections patient (délimitées par "Détail des passages pour NOM")
4. Pour chaque ligne :
   - Lignes normales : commencent par une date (DD/MM/YYYY + moment)
   - Lignes continuation : pas de date, héritent du contexte précédent (date + moment + praticien)
   - Extraction du n° facture : 4 chiffres juste avant "À sécuriser" ou "À envoyer"
   - Extraction des montants : 5 derniers montants en euros de la ligne
5. Gestion des cas complexes :
   - Cotations avec fractions : "AMI 4,1 / 2", "(AMX 1 + AMX 1 + AMX 1) / 2"
   - Heures précises : "07h30", "11h45"
   - Montants avec espaces insécables : "1  069,20 €"
   - Footer Ozzen à ignorer

### Validation
Testé sur le PDF "FACTURATION RATTRAPAGES faits le 16.04.26" :
- 383 passages parsés
- Total exact : 7 402,39 €
- Ventilation honoraires/majorations/férié/IFD exacte
- 0 champs vides, 0 doublons
- Cas REBOUL (multi-cotations, 07h30, continuations) : OK
- Cas SENNAOUI (passages nuit) : OK
- Cas DAKEYO (double "À sécuriser" caisse+mutuelle) : OK

## Flow d'import (admin)

### Page : `/admin/statements`

1. Upload du PDF
2. Détection : est-ce Ozzen ? Quel type ?
3. Si rattrapage → parsing → preview des passages dans un tableau
4. Sélection du cabinet (dropdown existants + option "Nouveau cabinet")
5. Détection des doublons : clé = `date + moment + invoice + cotation + practitioner + total`
6. Import en base → création du `bordereau_import` + `care_passages`
7. Détection des suggestions de lien praticien (pour tous les praticiens inscrits)
8. Historique des imports en bas de page avec option de suppression

## Liaison praticien-cabinet

### Name matching
`src/lib/name-matching.ts`

Fonction `namesMatch(nameA, nameB)` :
1. Normalisation : minuscules, accents retirés, tirets/points → espaces, espaces multiples nettoyés
2. Retrait des civilités : m, mme, mr, mlle, monsieur, madame, etc.
3. Check 1 : mots triés identiques ("La Briola Marion" = "Marion La Briola")
4. Check 2 : concaténation identique ("Marion Labriola" = "Marion La Briola")

### Suggestions de lien

Détection déclenchée :
- A l'onboarding du praticien (`actions/onboarding.ts`)
- A l'import d'un bordereau (`actions/bordereaux.ts`)

Flow :
1. On cherche dans `care_passages` les practices où le nom du praticien apparaît
2. On exclut les practices déjà suggérées ou déjà liées
3. On crée des `practices_links_suggestions` en statut "pending"
4. Bandeau affiché sur le dashboard du praticien
5. Acceptation → création du `practice_link` + suggestion passe en "accepted"
6. Refus → suggestion passe en "dismissed", plus reproposée

### Lecture des passages (praticien)

`actions/facturation.ts` → `getFacturationData()`
1. Récupère les `practiceLinks` du praticien
2. Pré-filtre SQL : `WHERE practiceId IN (...) AND practitioner ILIKE '%NomDeFamille%'`
3. Filtre fin JS : `namesMatch(fullName, passage.practitioner)`

## Pages praticien

### Dashboard (`/dashboard`)
- Résumé CA total en attente
- Ventilation par statut (à sécuriser / à envoyer / payé / rejeté)
- Ventilation honoraires / majorations / férié / IFD
- Bandeau de suggestion de lien cabinet
- Lien vers `/facturation`

### Facturation (`/facturation`)
- Tableau filtrable : cabinet, statut, plage de dates
- Colonnes triables : cabinet, date, moment, n° facture, statut, total
- Résumé cards par statut en haut
