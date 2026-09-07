# Rédaction assistée par IA (Module 4, sous-projet 4)

Date : 2026-09-07
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Quatrième et dernier sous-projet du Module 4 (Mapping et assemblage), après les
sous-projets 1 (modèle de données), 2 (mapping manuel assisté) et 3
(assemblage mécanique + export Word), tous fusionnés sur `main`. Rappel du
découpage complet (voir [[noubinao_module4_mapping_assemblage]]) :

1. Modèle de données — **complété**.
2. Mapping manuel assisté — **complété**.
3. Assemblage mécanique + export Word — **complété**.
4. Rédaction assistée par IA (ce spec) — le sous-projet le plus risqué du
   module (traçabilité, hallucination), volontairement traité en dernier.

**Point de vigilance hérité, non bloquant pour ce brainstorming** : la note
mémoire du module indiquait que ce sous-projet devait démarrer après
validation manuelle des 3 précédents sur un cas réel. Cette validation finale
(ouverture réelle du `.docx` du sous-projet 3, lecture de la policy RLS) n'a
pas encore été confirmée par Sorel au moment de ce brainstorming — à faire
avant de considérer l'ensemble du Module 4 définitivement clos, mais ne
bloque pas la conception de ce sous-projet.

Ce spec couvre la génération assistée de sections rédactionnelles (texte en
prose), avec la contrainte centrale imposée par `CLAUDE.md` : **tout contenu
généré doit rester traçable à sa source**, et le modèle ne doit jamais
produire une affirmation (certification, chiffre, référence) sans la relier
à un document vérifiable de la bibliothèque.

## Décisions validées avec l'utilisateur

- **Sections dérivées de `sommaire_attendu`**, pas une liste fermée
  prédéfinie ni un champ libre. Chaque intitulé de
  `appel_offres.sommaire_attendu` (déjà extrait au Module 3) devient une
  section candidate à la génération — s'adapte au sommaire réellement imposé
  par chaque DAO plutôt qu'à une liste figée.
- **Traçabilité au niveau section**, pas phrase par phrase. Chaque section
  générée enregistre l'ensemble exact des documents fournis en contexte au
  prompt (table de liaison dédiée, voir Modèle de données) — affichée dans
  l'UI comme "Généré à partir de : X, Y" pendant la relecture. Pas de
  citation inline par affirmation (trop fragile à obtenir de façon fiable
  d'un LLM, complexifierait fortement le prompt et le parsing).
- **Validation humaine section par section, obligatoire avant export.**
  Chaque section a son propre statut (`brouillon`/`validee`). Seules les
  sections `validee` apparaissent dans l'export Word du sous-projet 3 — le
  risque d'hallucination est le point le plus dangereux de ce sous-projet,
  la relecture humaine explicite est donc une porte, pas une option.
- **Sélection manuelle des documents source par section**, pas
  d'heuristique automatique. Avant de générer, l'utilisateur choisit dans la
  bibliothèque les documents à fournir à Claude pour cette section précise
  (même interaction `Select` que le mapping documents/exigences du
  sous-projet 2). `appel_offres.dao_markdown` est toujours inclus en plus
  (respect des consignes du DAO), quels que soient les documents choisis.
- **Génération synchrone, un appel Claude par section.** Pas de file
  d'attente QStash (pattern du Module 3) : chaque génération est un seul
  appel réseau, déclenché directement par un bouton "Générer" sur la
  section, largement sous les limites de durée d'une Server Action.
- **Modèle Claude configurable, `claude-haiku-4-5-20251001` par défaut en
  développement** — cohérent avec `CLAUDE.md` et le pattern déjà utilisé
  dans `extraire.ts`. Le nom du modèle est extrait en constante/variable
  d'environnement pour permettre une montée en gamme en production sans
  retoucher le code, si la qualité rédactionnelle de Haiku s'avère
  insuffisante sur un cas réel.
- **Aucune mention des sources dans le `.docx` exporté.** La traçabilité
  sert à la relecture humaine avant validation — une fois une section
  validée, le texte exporté est une prose propre, sans annotation
  technique, comme un vrai dossier de réponse professionnel. La
  traçabilité reste consultable dans NoubinAO à tout moment, simplement pas
  imposée dans le livrable final envoyé à l'acheteur.

## Modèle de données

Nouvelle migration, deux tables au même patron que `dossier_reponse`/
`exigence_document` (sous-projet 1) :

```sql
create type statut_section_dossier as enum ('brouillon', 'validee');

create table section_dossier (
  id uuid primary key default gen_random_uuid(),
  dossier_reponse_id uuid not null references dossier_reponse(id) on delete cascade,
  titre text not null,
  contenu text,
  statut statut_section_dossier not null default 'brouillon',
  generated_at timestamptz,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (dossier_reponse_id, titre)
);

create table section_document (
  id uuid primary key default gen_random_uuid(),
  section_dossier_id uuid not null references section_dossier(id) on delete cascade,
  document_id uuid not null references document(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (section_dossier_id, document_id)
);

create index section_document_document_id_idx on section_document(document_id);

alter table section_dossier enable row level security;
alter table section_document enable row level security;

-- select/insert/update/delete sur section_dossier, select/insert/delete sur
-- section_document, toutes scopées par appartenance à l'entreprise via
-- dossier_reponse → appel_offres → utilisateur, même patron que les
-- policies de dossier_reponse/exigence_document (sous-projet 1) et de la
-- policy update de dossier_reponse (sous-projet 3, avec with check).
```

- `contenu` nullable : une section existe (créée au premier "Générer") même
  avant d'avoir un texte utilisable si la génération échoue — évite de
  perdre le lien vers les documents source déjà sélectionnés en cas de
  retry.
- `unique (dossier_reponse_id, titre)` : une seule ligne par intitulé de
  section pour un dossier donné — régénérer réutilise la même ligne
  (upsert), ne duplique pas.
- Contrairement à `exigence_document` (sous-projet 1), **`section_document`
  a une policy `update`** dès sa création (pas de rattrapage nécessaire) :
  la leçon du sous-projet 3 (policy `UPDATE` manquante découverte tardivement
  sur `dossier_reponse`) s'applique directement ici puisque `section_dossier`
  a elle-même besoin d'`UPDATE` (changement de statut, régénération).

## Génération

Nouveau module `lib/appels-offres/redaction/generer.ts`, sur le même
principe que `normalisation/extraire.ts` (prompt strict, pas d'invention) :

```ts
export async function genererSectionRedaction(
  titreSection: string,
  daoMarkdown: string | null,
  documentsSource: Document[],
): Promise<string>
```

- Construit un prompt combinant `daoMarkdown` (tronqué à une longueur
  maximale de sécurité, même logique que `LONGUEUR_MAX_CONTENU_PERTINENT`
  dans `extraire.ts`) et le `contenu_markdown` de chaque document source
  sélectionné, avec une consigne stricte : rédiger la section demandée,
  n'inventer aucun fait absent des documents fournis, signaler explicitement
  (dans le texte généré) si l'information nécessaire est absente plutôt que
  de l'inventer.
- Retourne le texte brut généré (pas de JSON ici, contrairement à
  `extraireInformationsAo` — c'est de la prose, pas des données
  structurées).
- Modèle Claude lu depuis `process.env.ANTHROPIC_MODELE_REDACTION`, avec
  repli sur `"claude-haiku-4-5-20251001"` si la variable n'est pas définie
  — nouvelle variable d'environnement, à ajouter à la liste de `CLAUDE.md`
  (optionnelle : absente en développement, définie en production seulement
  si Haiku s'avère insuffisant).

## Server Actions

Dans `lib/appels-offres/actions.ts` :

- `genererContenuSection(dossierReponseId, titre, documentIds: string[])` —
  crée ou met à jour la ligne `section_dossier` (upsert sur
  `(dossier_reponse_id, titre)`), remplace les lignes `section_document`
  associées par la nouvelle sélection, appelle `genererSectionRedaction`,
  enregistre `contenu`/`generated_at`, remet `statut` à `'brouillon'` (une
  régénération invalide toujours la validation précédente).
- `modifierContenuSection(sectionId, contenu: string)` — édition manuelle du
  texte par l'utilisateur après génération, avant validation. Ne touche pas
  au statut ni aux documents source.
- `validerSection(sectionId)` / `devaliderSection(sectionId)` — bascule de
  statut, même pattern de défense en profondeur (`.select("id")` après
  `.update()`) que `modifierStatutPipeline` et `dissocierDocumentAExigence`.

## UI

Dans `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`, nouvelle zone
après les sections existantes (pièces requises / critères), une carte par
intitulé de `sommaire_attendu` :

1. Sélecteur de documents source (réutilise le pattern `Select` du
   sous-projet 2), permettant de choisir plusieurs documents avant de
   générer.
2. Bouton "Générer" (ou "Régénérer" si un contenu existe déjà), appelant
   `genererContenuSection`.
3. Zone de texte éditable affichant `contenu` une fois généré, modifiable
   via `modifierContenuSection`.
4. Badge de statut (`brouillon`/`validée`) + bouton pour basculer le statut.
5. Liste des documents source utilisés ("Généré à partir de : ...").

## Intégration à l'export (modifie le sous-projet 3)

- `lib/appels-offres/export/plan.ts` : `PlanExport` gagne un champ
  `sectionsRedigees: Array<{ titre: string; contenu: string }>`, alimenté
  uniquement par les sections `statut === 'validee'` — les sections en
  `brouillon` n'apparaissent jamais dans l'export.
- `lib/appels-offres/export/docx.ts` : rend chaque section rédigée comme un
  titre (`HEADING_1`) suivi de paragraphes de prose (découpage simple par
  saut de ligne) — aucune mention de source, aucun lien, cohérent avec la
  décision "traçabilité interface seulement".

## Gestion d'erreurs et garde-fous anti-hallucination

- Échec de génération (erreur API, réponse vide) : la Server Action retourne
  `{ erreur }`. La ligne `section_dossier` garde son état précédent
  (`contenu` et `generated_at` non écrasés tant que la génération n'a pas
  réellement abouti) — pas de perte de contenu déjà validé en cas d'échec
  d'une régénération ultérieure.
- Aucun document sélectionné : génération autorisée, reposant uniquement sur
  `dao_markdown` — pas bloquant (cohérent avec le reste du produit, qui ne
  bloque jamais sur un mapping incomplet), mais le prompt est construit de
  façon à ce que Claude signale l'absence de matière plutôt que d'inventer.
- Une section régénérée repasse systématiquement à `'brouillon'` — aucune
  section ne peut rester marquée `'validee'` avec un contenu que personne
  n'a relu après une régénération.

## Tests

- Vitest sur la construction du prompt (fonction pure de préparation,
  séparée de l'appel réseau — même principe que `construireContenuPertinent`
  dans `extraire.ts`) : troncature du `dao_markdown`, inclusion des
  documents source, absence de documents source.
- Pas de test sur l'appel Claude lui-même, ni sur les Server Actions
  (cohérent avec le reste du projet).
- Vérification manuelle après implémentation : qualité réelle du texte
  généré sur un cas réel (à la charge de Sorel, comme pour les sous-projets
  précédents), et confirmation que Haiku suffit ou qu'une montée en gamme
  est nécessaire.

## Hors périmètre

- Citation phrase par phrase — reportée, jugée trop fragile pour un LLM en
  V1.
- Génération groupée/asynchrone de toutes les sections d'un coup — reportée,
  le déclenchement section par section suffit au flux de relecture validé.
- Sélection automatique des documents source par heuristique — reportée,
  cohérent avec le choix de sélection manuelle.
- Mention des sources dans le `.docx` exporté — délibérément exclue.
- Édition collaborative en temps réel du texte généré (plusieurs
  utilisateurs sur la même section simultanément) — non demandé, hors
  périmètre.
- Versionnement de l'historique des régénérations d'une section (garder les
  anciennes versions) — non demandé ; une régénération remplace le contenu
  précédent.
