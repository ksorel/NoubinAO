# Modèle de données Appel d'Offres (Module 3, sous-projet 1)

Date : 2026-08-31
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Premier sous-projet du Module 3 (Extraction de DAO), après validation de
l'hypothèse technique par le spike (`docs/superpowers/specs/2026-08-25-spike-extraction-dao-design.md`,
`scripts/dao-spike/`) : le pipeline normalisation → découpage → extraction
IA fonctionne de façon fiable sur des DAO ivoiriens réalistes, y compris
le repli OCR sur page scannée.

Le Module 3 complet est trop large pour un seul spec — il se décompose en
quatre sous-projets :

1. **Modèle de données** (ce spec) — tables `appel_offres`/`exigence_ao`,
   migration Supabase.
2. Pipeline de normalisation intégré à l'app (migration du script
   autonome `scripts/dao-spike/` vers du code `lib/` réutilisable et
   testé).
3. Upload de DAO + orchestration (Server Action : upload → stockage →
   normalisation → extraction → sauvegarde).
4. UI d'upload et de revue des exigences extraites.

Ce spec ne couvre que le sous-projet 1 : aucune UI, aucun upload réel,
aucune Server Action, aucune connexion au pipeline de normalisation.

## Décisions validées avec l'utilisateur

- **Structure plate pour `exigence_ao`, sans hiérarchie critère/sous-critère.**
  Le spike a montré que Claude retrouve fiablement les sous-critères
  individuels d'une grille de pondération complexe, mais sans reconstituer
  le regroupement à 2 niveaux (critère parent → sous-critères). Modéliser
  cette hiérarchie demanderait de fiabiliser un signal que le spike n'a
  pas prouvé fiable — reporté à plus tard si le besoin se confirme à
  l'usage réel.
- **Deux colonnes de statut distinctes sur `appel_offres`** :
  `statut_pipeline` (métier — identifié/en préparation/soumis/en
  attente/gagné/perdu, décrit dans CLAUDE.md pour le futur tableau de
  bord du Module 5) et `statut_traitement` (technique — état
  d'avancement de la normalisation/extraction). Les mélanger créerait des
  états ambigus : un AO peut être "en préparation" côté métier alors que
  son traitement technique est terminé depuis longtemps.

## Table `appel_offres`

```sql
create type statut_pipeline_ao as enum (
  'identifie', 'en_preparation', 'soumis', 'en_attente', 'gagne', 'perdu'
);
create type statut_traitement_ao as enum (
  'en_attente', 'normalisation', 'extraction', 'termine', 'erreur'
);

create table appel_offres (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  titre text,
  acheteur text,
  secteur text,
  date_limite timestamptz,
  montant_caution numeric,
  statut_pipeline statut_pipeline_ao not null default 'identifie',
  statut_traitement statut_traitement_ao not null default 'en_attente',
  erreur_traitement text,
  fichier_dao_path text not null,
  fichier_dao_nom_original text not null,
  dao_markdown text,
  sommaire_attendu text[],
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);
```

Les champs extraits (`titre`, `acheteur`, `secteur`, `date_limite`,
`montant_caution`, `dao_markdown`, `sommaire_attendu`) sont **nullables** :
ils n'existent qu'après upload + traitement réussi. Seuls `entreprise_id`,
`fichier_dao_path`/`fichier_dao_nom_original`, les deux statuts et
`created_at` sont garantis dès la création de la ligne. `erreur_traitement`
stocke un message lisible si `statut_traitement = 'erreur'`, pour
l'affichage dans l'UI du sous-projet 4.

## Table `exigence_ao`

```sql
create type type_exigence_ao as enum ('piece_requise', 'critere_evaluation');

create table exigence_ao (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  type_exigence type_exigence_ao not null,
  libelle text not null,
  description text,
  ponderation numeric,
  source_section text,
  created_at timestamptz not null default now()
);
```

Une seule table pour les deux catégories (conforme au modèle de données
de CLAUDE.md : "exigence_ao — extraite du DAO : type de pièce requise,
critère d'évaluation, pondération"), distinguées par `type_exigence`.
`libelle` porte le type de pièce OU le nom du critère selon le cas ;
`description` n'a de sens que pour une pièce requise ; `ponderation` n'a
de sens que pour un critère d'évaluation (les deux restent `null`
sinon). `source_section` reprend le champ de traçabilité déjà validé par
le spike (ex. `"DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES"`), conformément
à l'exigence de CLAUDE.md qu'aucune donnée générée par l'IA ne reste sans
source vérifiable.

## RLS et stockage du fichier DAO

Mêmes politiques RLS que `document` (Module 2) : `select`/`insert`/`delete`
scopés par appartenance de l'utilisateur à l'entreprise, sur
`appel_offres` et `exigence_ao`.

Pour le fichier DAO source : réutilisation du bucket Storage privé
`documents` déjà créé au Module 2, avec un préfixe de chemin distinct
pour ne pas mélanger avec la bibliothèque documentaire — ex.
`<entreprise_id>/appels-offres/<appel_offres_id>-<nom_fichier>` au lieu de
`<entreprise_id>/<document_id>-<nom_fichier>`. Les 3 politiques Storage
existantes (scopées par le premier segment du chemin, `entreprise_id`)
s'appliquent déjà sans modification. Pas de nouveau bucket, pas de
nouvelle politique Storage.

## Organisation du code

Nouveau dossier `lib/appels-offres/` (miroir de `lib/documents/`) :

- `types.ts` — types `AppelOffres`, `ExigenceAo`, constantes des enums
  (`STATUTS_PIPELINE_AO`, `STATUTS_TRAITEMENT_AO`, `TYPES_EXIGENCE_AO`).
- `storage-path.ts` — fonction `construireCheminStockageDao(entrepriseId,
  appelOffresId, nomFichierOriginal)`, même esprit que
  `construireCheminStockage` de `lib/documents/`, mais avec le préfixe
  `appels-offres/`.

`schema.ts`/`actions.ts`/`queries.ts` ne sont pas construits dans ce
sous-projet — ils appartiennent aux sous-projets 3 (upload/orchestration)
et 4 (UI), qui ont besoin du modèle de données en place mais pas
l'inverse.

## Tests

Test unitaire Vitest pour `construireCheminStockageDao` (fonction pure),
même pattern TDD que `lib/documents/storage-path.test.ts` existant. Pas
de test automatisé pour la migration SQL elle-même — vérifiée par
application réelle via `supabase db push`, comme pour
`bibliotheque_documentaire.sql`.

## Hors périmètre

- Toute UI, tout upload réel, toute Server Action.
- Connexion au pipeline de normalisation (`dao_markdown` reste un champ
  vide en pratique tant que le sous-projet 2 n'existe pas).
- Hiérarchie critère/sous-critère dans `exigence_ao` — reportée, voir
  "Décisions validées avec l'utilisateur".
- Formats bailleurs (Banque mondiale, BAD) — hors périmètre V1 du produit
  entier.
