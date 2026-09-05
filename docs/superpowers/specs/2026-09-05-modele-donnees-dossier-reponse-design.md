# Modèle de données Dossier de réponse (Module 4, sous-projet 1)

Date : 2026-09-05
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Premier sous-projet du Module 4 (Mapping et assemblage), après validation
complète du Module 3 (Extraction de DAO) sur un cas réel (DAO Mairie de
Dabou, PDF et DOCX) et du sous-projet 5.1 (tableau de bord pipeline).

Le Module 4 complet ("croisement des exigences extraites avec la
bibliothèque documentaire, pré-remplissage du dossier, rédaction assistée
des sections variables, export Word/PDF", CLAUDE.md) est trop large pour
un seul spec — il se décompose en quatre sous-projets :

1. **Modèle de données** (ce spec) — tables `dossier_reponse` et
   `exigence_document`, migration Supabase.
2. Mapping manuel assisté — sur la page de détail d'un AO, associer
   chaque exigence à un ou plusieurs documents de la bibliothèque, avec
   des suggestions simples (mots-clés/type), pas de recherche vectorielle
   pgvector pour cette première itération.
3. Assemblage mécanique + export Word — à partir du mapping validé,
   génération d'un dossier structuré (insertion des documents/CV
   existants tels quels, sans génération de texte IA) et export au
   format Word (skill `docx`).
4. Rédaction assistée par IA des sections variables (sous-projet séparé,
   brainstormé plus tard, une fois les trois premiers validés sur un cas
   réel) — la partie la plus risquée du module (traçabilité, contenu
   halluciné), volontairement reportée après un socle mécanique solide.

Ce spec ne couvre que le sous-projet 1 : aucune UI, aucune Server Action,
aucune requête de lecture/écriture applicative au-delà de l'auto-création
best-effort décrite ci-dessous.

## Décisions validées avec l'utilisateur

- **Mapping many-to-many** entre exigence et document, via une table de
  liaison dédiée (`exigence_document`), pas une colonne `document_id`
  sur `exigence_ao`. Une exigence comme "personnel clé" peut nécessiter
  plusieurs CV (un par poste), et un même document (ex. RCCM) peut
  satisfaire plusieurs exigences distinctes du même AO.
- **`dossier_reponse` créé automatiquement**, pas sur action explicite de
  l'utilisateur : dès que `statut_traitement` de l'`appel_offres` passe à
  `'termine'`, une ligne `dossier_reponse` est créée en base (statut
  `'brouillon'`). Pas de bouton "Créer le dossier de réponse" séparé —
  le dossier existe implicitement dès que l'AO est exploitable.
- **Trois statuts de relecture** : `brouillon` (mapping en cours) →
  `relu` (l'utilisateur a validé manuellement le contenu) → `exporte`
  (un export Word a été généré au moins une fois). Correspond au cycle
  de vie minimal couvrant les sous-projets 2 et 3.
- **Auto-création en code applicatif, pas en trigger PostgreSQL.**
  L'insertion de `dossier_reponse` a lieu dans `traitement.ts`, au même
  endroit que le passage à `statut_traitement='termine'` — cohérent avec
  le reste du pipeline (aucune logique cachée côté base ; aucun trigger
  n'existe dans les migrations actuelles). Une migration de rattrapage
  crée les lignes manquantes pour les AO déjà `'termine'` (dont Mairie de
  Dabou, déjà traité avant ce sous-projet).
- **Insertion best-effort, non bloquante.** Si l'insertion de
  `dossier_reponse` échoue juste après le passage à `'termine'`, elle ne
  doit pas faire échouer tout le traitement — l'extraction a réussi,
  la ligne annexe manquante ne doit pas faire basculer l'AO en erreur.
  Filet de sécurité : la future requête de lecture du sous-projet 2 fait
  un *get-or-create* (si la ligne manque encore à la lecture, elle est
  créée à la volée).

## Table `dossier_reponse`

```sql
create type statut_relecture_dossier as enum ('brouillon', 'relu', 'exporte');

create table dossier_reponse (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null unique references appel_offres(id) on delete cascade,
  statut_relecture statut_relecture_dossier not null default 'brouillon',
  export_path text,
  exporte_le timestamptz,
  created_at timestamptz not null default now()
);
```

`appel_offres_id` est `unique` pour garantir la relation 1:1 (un seul
dossier de réponse par AO). `export_path` (chemin Storage du dernier
export Word généré) et `exporte_le` restent `null` tant qu'aucun export
n'a eu lieu — posés dès maintenant pour éviter une migration
supplémentaire au sous-projet 3, mais ni lus ni écrits par le code de ce
sous-projet.

Aucune colonne "sections" à ce stade : la structure du contenu assemblé
(comment une section est définie, à partir de quoi) sera décidée au
brainstorming du sous-projet 3, une fois le mapping du sous-projet 2 en
place — modéliser cette structure maintenant reviendrait à deviner un
besoin pas encore précisé.

## Table `exigence_document`

```sql
create table exigence_document (
  id uuid primary key default gen_random_uuid(),
  exigence_ao_id uuid not null references exigence_ao(id) on delete cascade,
  document_id uuid not null references document(id) on delete cascade,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (exigence_ao_id, document_id)
);
```

La contrainte `unique (exigence_ao_id, document_id)` empêche d'associer
deux fois le même document à la même exigence (un second clic sur
"associer" dans l'UI du sous-projet 2 doit rester sans effet, pas créer
un doublon). `on delete cascade` des deux côtés : si l'exigence ou le
document est supprimé, le lien disparaît sans laisser d'orphelin —
cohérent avec `exigence_ao.appel_offres_id on delete cascade` déjà en
place.

## Auto-création et backfill

Dans `lib/appels-offres/traitement.ts`, immédiatement après l'écriture de
`statut_traitement='termine'` sur `appel_offres` :

```ts
try {
  await supabase.from("dossier_reponse").insert({ appel_offres_id: appelOffresId });
} catch {
  // Best-effort : voir "Insertion best-effort, non bloquante" ci-dessus.
  // Le sous-projet 2 répare via get-or-create à la lecture si nécessaire.
}
```

Migration de rattrapage (même fichier de migration que les tables
ci-dessus, pas une migration séparée) :

```sql
insert into dossier_reponse (appel_offres_id)
select id from appel_offres
where statut_traitement = 'termine'
  and id not in (select appel_offres_id from dossier_reponse);
```

## RLS

Même schéma de policies que `exigence_ao` :

- `dossier_reponse` : `select`/`insert`/`delete` via jointure directe sur
  `appel_offres_id` → `appel_offres.entreprise_id` → appartenance de
  l'utilisateur.
- `exigence_document` : `select`/`insert`/`delete` via jointure sur
  `exigence_ao_id` → `exigence_ao.appel_offres_id` → `appel_offres.entreprise_id`
  → appartenance de l'utilisateur. Pas de vérification séparée sur
  `document_id` : un utilisateur ne peut de toute façon référencer que
  des documents de sa propre entreprise (RLS déjà en place sur
  `document`), et la jointure applicative (sous-projet 2) ne proposera
  que des documents de la bibliothèque de l'entreprise courante.

Pas de policy `update` sur `dossier_reponse` dans cette migration : comme
pour `appel_offres` (policy `update` ajoutée dans une migration séparée,
`20260901190618_appel_offres_update_policy.sql`, seulement quand le
besoin réel est apparu), l'ajout attendra que le sous-projet 2 ou 3 ait
effectivement besoin de faire évoluer `statut_relecture`.

## Organisation du code

Dans `lib/appels-offres/types.ts` (fichier existant) : ajout de
`StatutRelectureDossier`, `STATUTS_RELECTURE_DOSSIER`, `DossierReponse`,
`ExigenceDocument`.

Pas de nouveau fichier `schema.ts`/`actions.ts`/`queries.ts` dédié à ce
sous-projet — l'insertion best-effort vit directement dans
`traitement.ts` existant (pas assez de logique pour justifier un nouveau
module), et les requêtes de lecture/écriture applicatives appartiennent
au sous-projet 2.

## Tests

Vitest pour la fonction d'insertion best-effort ajoutée à
`traitement.test.ts` (existant) : vérifie qu'une erreur d'insertion de
`dossier_reponse` ne fait pas échouer `traiterDao` et laisse
`statut_traitement='termine'`. Pas de test automatisé pour la migration
SQL elle-même (ni la table, ni le backfill) — vérifiée par application
réelle via `supabase db push`, comme les migrations précédentes.

## Hors périmètre

- Toute UI de mapping, toute Server Action de lecture/écriture sur
  `dossier_reponse`/`exigence_document` — sous-projet 2.
- Structure de contenu ("sections") de `dossier_reponse` — décidée au
  brainstorming du sous-projet 3.
- Génération de texte par IA — sous-projet 4, reporté explicitement.
- Recherche vectorielle pgvector pour suggérer des documents — écartée
  pour la première itération du sous-projet 2 (mots-clés/type suffisent
  pour valider l'utilité du mapping avant d'investir dans une recherche
  plus sophistiquée).
