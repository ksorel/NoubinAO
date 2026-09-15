# Checklist finale de soumission

Date : 2026-09-15
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Suite à une comparaison de NoubinAO avec un guide de référence générique
sur la réponse aux appels d'offres, plusieurs notions importantes du
guide n'étaient pas couvertes par le produit. Le Directeur a validé
qu'il fallait ajouter les plus importantes. Ce sous-projet est le
premier d'une série de plusieurs (les autres — matrice Go/No-Go,
rétroplanning de Bid Management, chiffrage, groupement/co-traitance —
seront brainstormés séparément, chacun ayant son propre cycle
spec → plan → implémentation).

C'est le plus petit et le plus rapide à livrer des cinq lacunes
identifiées : une checklist affichée sur la page détail d'un AO, juste
avant l'export du dossier, qui combine des vérifications calculées
automatiquement depuis l'état réel du dossier et trois points à cocher
manuellement, adaptés au contexte ivoirien (dépôt SIGMAP) plutôt qu'aux
formulaires français de l'ebook source (DC1/DC2, BPU/DQE).

Aucune notion de nouveau module au sens de `CLAUDE.md` : cette checklist
prolonge le Module 4 (mapping et assemblage), qui posait déjà
« chaque contenu généré doit rester traçable » et une validation
humaine avant export (`dossier_reponse.statut_relecture`).

## Décisions validées avec l'utilisateur

- **Vérifications automatiques + items manuels**, pas l'un ou l'autre.
  Les vérifications automatiques exploitent ce que NoubinAO sait déjà
  (pièces associées, sections validées, expiration des documents) ;
  les items manuels couvrent ce que le produit ne peut pas déduire
  (signature physique, contrôle du prix, dépôt effectif sur la
  plateforme officielle).
- **Jamais bloquant.** La checklist avertit mais ne désactive jamais le
  bouton « Exporter le dossier » — cohérent avec le principe déjà
  appliqué ailleurs dans le produit (suggestion + décision humaine,
  jamais un automatisme qui empêche une action légitime).
- **Trois items manuels, adaptés au contexte ivoirien** (pas les noms
  de formulaires français de l'ebook, hors périmètre — voir
  `CLAUDE.md`, qui cible le format national ARCOP/SIGMAP) :
  1. Pièces signées par la personne habilitée.
  2. Prix vérifié et cohérent.
  3. Déposé sur SIGMAP et récépissé conservé.
- **Traçabilité qui/quand sur les items manuels** — table dédiée plutôt
  qu'une colonne JSONB, pour savoir qui de l'équipe a validé quel point
  et quand, utile quand plusieurs personnes travaillent sur le même
  dossier.
- **Modélisation en table de liaison insert/delete, pas une colonne
  booléenne mise à jour.** Cocher un item = insérer une ligne ; décocher
  = la supprimer. C'est exactement le pattern déjà utilisé par
  `exigence_document` et `section_document` (aucune policy `update`,
  donc aucun risque de retomber dans le piège RLS `WITH CHECK` déjà
  rencontré ailleurs dans ce projet — voir la note dans le code du
  Module 6). Pas de champ `coche: boolean` à maintenir : la présence de
  la ligne EST l'état coché.

## Modèle de données

```sql
-- Checklist de soumission (items manuels uniquement — les vérifications
-- automatiques ne sont jamais persistées, elles sont recalculées à
-- chaque affichage depuis l'état réel du dossier).
create type cle_checklist_item as enum (
  'pieces_signees',
  'prix_verifie',
  'depose_sigmap'
);

create table checklist_item_dossier (
  id uuid primary key default gen_random_uuid(),
  dossier_reponse_id uuid not null references dossier_reponse(id) on delete cascade,
  cle_item cle_checklist_item not null,
  -- Nullable + on delete set null (comme exigence_document.created_by) :
  -- l'item coché est un état d'équipe, pas une donnée privée — il doit
  -- rester coché même si la personne qui l'a coché quitte l'entreprise.
  coche_par uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (dossier_reponse_id, cle_item)
);

create index checklist_item_dossier_dossier_reponse_id_idx
  on checklist_item_dossier(dossier_reponse_id);

alter table checklist_item_dossier enable row level security;

-- Même pattern que exigence_document_select_membres /
-- section_document_select_membres : tout membre de l'entreprise
-- propriétaire de l'AO peut lire.
create policy "checklist_item_dossier_select_membres" on checklist_item_dossier
  for select using (
    exists (
      select 1 from dossier_reponse dr
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where dr.id = checklist_item_dossier.dossier_reponse_id and u.id = auth.uid()
    )
  );

-- Comme les policies insert des tables de liaison existantes, mais avec
-- une condition supplémentaire : coche_par doit être l'appelant
-- lui-même — pas de coche_par forgé au nom d'un collègue.
create policy "checklist_item_dossier_insert_membres" on checklist_item_dossier
  for insert with check (
    coche_par = auth.uid()
    and exists (
      select 1 from dossier_reponse dr
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where dr.id = checklist_item_dossier.dossier_reponse_id and u.id = auth.uid()
    )
  );

-- N'importe quel membre de l'équipe peut décocher un item — même
-- logique que exigence_document_delete_membres (un mapping peut être
-- retiré par n'importe qui de l'équipe, pas seulement son auteur).
create policy "checklist_item_dossier_delete_membres" on checklist_item_dossier
  for delete using (
    exists (
      select 1 from dossier_reponse dr
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where dr.id = checklist_item_dossier.dossier_reponse_id and u.id = auth.uid()
    )
  );
```

`dossier_reponse_id` est la clé d'ancrage (pas `appel_offres_id`) car
`obtenirAppelOffres` charge déjà `dossierReponse` (créé automatiquement
dès que le traitement du DAO se termine — voir
`obtenirOuCreerDossierReponse`), donc l'identifiant est toujours
disponible sans requête supplémentaire.

## Vérifications automatiques (calcul pur, jamais persisté)

Nouveau fichier `lib/appels-offres/checklist.ts` :

```ts
import type { ExigenceAo, SectionDossier } from "./types";
import type { Document } from "@/lib/documents/types";

export type CleItemAutomatique = "pieces_manquantes" | "sections_en_brouillon" | "documents_expires";

export interface ItemChecklistAutomatique {
  cle: CleItemAutomatique;
  ok: boolean;
  /** Nombre d'éléments concernés (0 si ok), pour affichage type "2 pièces manquantes". */
  nombre: number;
}

export function calculerChecklistAutomatique(
  exigences: ExigenceAo[],
  documentsParExigence: Record<string, Document[]>,
  sections: SectionDossier[],
  documentsParSection: Record<string, Document[]>,
  maintenant: Date = new Date(),
): ItemChecklistAutomatique[] {
  const piecesRequises = exigences.filter((e) => e.type_exigence === "piece_requise");
  const piecesManquantes = piecesRequises.filter(
    (e) => (documentsParExigence[e.id] ?? []).length === 0,
  ).length;

  const sectionsEnBrouillon = sections.filter((s) => s.statut === "brouillon").length;

  const documentsUtilises = new Map<string, Document>();
  for (const docs of Object.values(documentsParExigence)) {
    for (const doc of docs) documentsUtilises.set(doc.id, doc);
  }
  for (const docs of Object.values(documentsParSection)) {
    for (const doc of docs) documentsUtilises.set(doc.id, doc);
  }
  const documentsExpires = Array.from(documentsUtilises.values()).filter(
    (doc) => doc.date_expiration !== null && new Date(doc.date_expiration) < maintenant,
  ).length;

  return [
    { cle: "pieces_manquantes", ok: piecesManquantes === 0, nombre: piecesManquantes },
    { cle: "sections_en_brouillon", ok: sectionsEnBrouillon === 0, nombre: sectionsEnBrouillon },
    { cle: "documents_expires", ok: documentsExpires === 0, nombre: documentsExpires },
  ];
}
```

Notes :
- La détection « déjà expiré » (`date_expiration < maintenant`) est
  volontairement distincte de `calculerStatutExpiration`
  (`lib/documents/expiration.ts`), qui ne distingue pas « expire dans 5
  jours » de « expiré depuis 6 mois » (les deux tombent en `"rouge"`).
  On ne modifie pas `calculerStatutExpiration` ni le badge existant de
  la bibliothèque (hors périmètre, Module 2 déjà livré) — cette
  fonction ajoute juste la distinction dont la checklist a besoin,
  localement.
- Un même document peut apparaître dans `documentsParExigence` et
  `documentsParSection` (ex. une référence projet utilisée à la fois
  comme pièce requise et comme source d'une section rédigée) — la
  déduplication par `Map` sur `doc.id` évite de le compter deux fois
  dans `documentsExpires`.
- Fonction pure, testable indépendamment de Supabase — même approche
  TDD que `lib/email/correspondance.ts`.

## Lecture

Nouveau type dans `lib/appels-offres/types.ts`, même convention que
`TYPES_EXIGENCE_AO`/`TypeExigenceAo` :

```ts
export const CLES_CHECKLIST_MANUELLE = [
  "pieces_signees",
  "prix_verifie",
  "depose_sigmap",
] as const;

export type CleChecklistManuelle = (typeof CLES_CHECKLIST_MANUELLE)[number];
```

Nouvelle fonction dans `lib/appels-offres/queries.ts` :

```ts
export async function listerChecklistManuelle(
  dossierReponseId: string,
): Promise<CleChecklistManuelle[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("checklist_item_dossier")
    .select("cle_item")
    .eq("dossier_reponse_id", dossierReponseId);

  if (error) throw error;

  return (data ?? []).map((ligne) => ligne.cle_item as CleChecklistManuelle);
}
```

Retourne uniquement les clés des items cochés (liste courte, jamais
plus de 3 éléments) — suffisant pour que le composant sache lesquelles
des 3 cases sont cochées. `page.tsx` appelle cette fonction en parallèle
des autres requêtes déjà faites pour la page détail AO (mêmes
`Promise.all`, pas de nouvel aller-retour série).

## Server Action

Nouveau fichier ou ajout à `lib/appels-offres/actions.ts` :

```ts
export async function basculerChecklistManuelle(
  appelOffresId: string,
  dossierReponseId: string,
  cleItem: CleChecklistManuelle,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: existant, error: erreurLecture } = await supabase
    .from("checklist_item_dossier")
    .select("id")
    .eq("dossier_reponse_id", dossierReponseId)
    .eq("cle_item", cleItem)
    .maybeSingle();

  if (erreurLecture) return { erreur: "Échec de la mise à jour. Réessayez." };

  if (existant) {
    const { error } = await supabase
      .from("checklist_item_dossier")
      .delete()
      .eq("id", existant.id);
    if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
  } else {
    const { error } = await supabase.from("checklist_item_dossier").insert({
      dossier_reponse_id: dossierReponseId,
      cle_item: cleItem,
      coche_par: utilisateur.id,
    });
    if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}
```

`appelOffresId` est requis en premier paramètre uniquement pour
construire la bonne URL de revalidation (`dossier_reponse_id` ne
correspond à aucune route) — même raison d'être que le premier
paramètre de `lierEmailAAppelOffres`. Le composant appelant l'a déjà
disponible (`appelOffres.id`), aucune requête supplémentaire.

## Intégration dans `obtenirAppelOffres` / `page.tsx`

Même schéma que pour les emails (Module 6, sous-projet 3) : ne PAS
ajouter la checklist manuelle au retour de `obtenirAppelOffres` (qui a
déjà plusieurs appelants ne l'utilisant pas — `exporterDossierReponse`,
`genererContenuSection` — cf. la leçon tirée de la revue finale du
Module 6). `page.tsx` appelle `listerChecklistManuelle(dossierReponse.id)`
séparément, en parallèle des autres chargements propres à la page.

Les vérifications automatiques n'ont besoin d'aucune requête
supplémentaire : `calculerChecklistAutomatique` est appelée directement
dans `page.tsx` (ou dans `appel-offres-detail.tsx`) avec les données
déjà retournées par `obtenirAppelOffres`.

## Interface

Nouveau composant `app/(app)/appels-offres/[id]/checklist-soumission.tsx`
(composant client, pour les cases à cocher), inséré dans
`appel-offres-detail.tsx` juste avant le bouton « Exporter le dossier ».

- **Items automatiques** : liste en lecture seule, une icône
  ok (✓, vert) ou problème (⚠, ambre) par ligne, avec le nombre
  concerné si problème (« 2 pièces requises sans document »,
  « 1 section encore en brouillon », « 1 document expiré utilisé »).
  Pas de lien cliquable vers la source dans cette première version
  (YAGNI — l'utilisateur voit déjà ces informations dans les sections
  « Pièces requises » et « Rédaction assistée » plus haut sur la même
  page).
- **Items manuels** : 3 cases à cocher (`Checkbox` shadcn/ui), libellé +
  état, `onCheckedChange` appelle `basculerChecklistManuelle` dans un
  `useTransition`, optimiste (bascule immédiatement, revert si erreur —
  même pattern que `onDelier` dans `fil-suivi.tsx`).
- **Badge récapitulatif** : texte du type « 2 points à vérifier avant
  soumission » si au moins un item automatique est en problème ou un
  item manuel est décoché ; sinon « Prêt pour soumission » — jamais un
  blocage, juste un résumé visuel en tête de section.
- Nouvelle clé i18n `AppelsOffres.detail.checklist.*` dans
  `messages/fr.json` / `messages/en.json`, même structure que les
  namespaces existants de cette page.

## États et erreurs

- Aucun item automatique ne peut être dans un état "erreur" — c'est un
  calcul pur sur des données déjà chargées, toujours disponible.
- Échec de `basculerChecklistManuelle` (réseau, RLS) : toast d'erreur
  générique + revert de la case décochée/cochée optimistiquement.
- Aucune migration de données nécessaire : une checklist sans aucune
  ligne dans `checklist_item_dossier` affiche simplement les 3 cases
  décochées — c'est l'état initial normal pour tout AO existant.

## Tests

Vitest, TDD, sur `calculerChecklistAutomatique` :
- Toutes les pièces requises couvertes → `ok: true, nombre: 0`.
- Une pièce requise sans document → `ok: false, nombre: 1`.
- Une exigence de type `critere_evaluation` sans document ne doit
  jamais compter comme pièce manquante (seul `piece_requise` est
  concerné).
- Toutes les sections validées → `ok: true`.
- Une section en `brouillon` → `ok: false, nombre: 1`.
- Un document avec `date_expiration` dans le futur → non compté.
- Un document avec `date_expiration` dans le passé, utilisé comme pièce
  requise → compté.
- Le même document utilisé à la fois comme pièce requise et comme
  source de section, expiré → compté une seule fois (déduplication).
- Aucune exigence/section/document du tout (AO tout juste traité,
  aucune pièce mappée) → les trois items sont `ok: true` (rien à
  signaler, pas un faux problème).

Pas de test sur les fonctions Supabase (`listerChecklistManuelle`,
`basculerChecklistManuelle`) — cohérent avec le reste du projet, qui ne
teste pas les accès base de données directement.

## Hors périmètre

- Pas de blocage de l'export, quelle que soit la sévérité d'un problème
  détecté — décision explicite de l'utilisateur (voir « Décisions
  validées »).
- Pas de lien cliquable depuis un item automatique en problème vers sa
  source exacte dans la page — pourrait être ajouté plus tard si
  l'usage réel montre que c'est nécessaire.
- Pas de personnalisation des items manuels par l'utilisateur (liste
  fixe de 3, pas de checklist-builder) — les 3 items couvrent les points
  les plus importants et les plus fréquemment oubliés d'après l'ebook
  source ; à réévaluer seulement si l'usage réel montre un besoin
  différent.
- Les quatre autres lacunes identifiées (Go/No-Go, rétroplanning de Bid
  Management, chiffrage, groupement/co-traitance) sont explicitement
  hors périmètre de ce sous-projet — chacune fera l'objet d'un
  brainstorming séparé.
