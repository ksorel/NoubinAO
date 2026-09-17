# Groupement / co-traitance sur un AO

Date : 2026-09-17
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Lacune 5/5 identifiée en comparant NoubinAO à un ebook générique sur la
réponse aux AO (voir mémoire `noubinao_lacunes_ebook_checklist`) — la
seule des 5 pas encore brainstormée, et la plus grosse : les 4 autres
(checklist finale, Go/No-Go, rétroplanning, chiffrage BPU + pyramide de
coût) sont livrées et mergées sur `main`. L'ebook mentionne le
groupement (plusieurs entreprises répondent ensemble à un AO, un
mandataire et un ou plusieurs co-traitants, avec une répartition du
marché en %) comme une notion importante de la réponse aux AO,
totalement absente de NoubinAO aujourd'hui.

**Décision d'architecture prise en premier, avant toute fonctionnalité**
(remet en question l'hypothèse structurante « un AO = une seule
entreprise » sur laquelle tout le cloisonnement RLS actuel par
`entreprise_id` est bâti) : le groupement reste **purement informatif**.
L'entreprise qui utilise NoubinAO (mandataire ou co-traitant) documente
elle-même, dans son propre compte, qui sont les membres du groupement
sur cet AO. **Aucun partage de compte ni de données entre entreprises** —
un co-traitant n'a pas accès à NoubinAO via cette fonctionnalité, il
n'existe que comme une ligne d'information dans le compte de
l'utilisateur. Alternative écartée : vrai partage multi-comptes (RLS
multi-tenant, invitations) — beaucoup plus risqué et coûteux au regard
du garde-fou de temps du Directeur sur ce projet bootstrap (voir
CLAUDE.md), pour une valeur ajoutée qui reste de la documentation, pas
de la collaboration temps réel.

## Décisions validées avec l'utilisateur

- **Scope informatif seulement** (voir ci-dessus) — validé explicitement
  après avoir présenté l'alternative multi-comptes.
- **Notre propre entreprise est un membre comme les autres** : la liste
  des membres du groupement n'est pas limitée aux « co-traitants »
  externes, elle inclut aussi une ligne pour l'entreprise qui utilise
  NoubinAO, avec son propre rôle et son propre %. Pas de champ ou de
  colonne spéciale marquant « c'est nous » — une ligne parmi d'autres,
  texte libre comme les autres.
- **Champs par membre** : nom (texte libre), rôle (`mandataire` ou
  `co_traitant`), % de répartition du marché (nullable, comme
  `prix_unitaire`/`debourse_sec` ailleurs dans le projet — un membre peut
  être listé avant que la répartition soit négociée).
- **Pré-remplissage du premier membre, mais uniquement côté formulaire
  d'ajout, jamais en base avant validation** (option A soumise à
  l'utilisateur, retenue explicitement plutôt que l'option B — un
  get-or-create serveur comme `dossier_reponse` au Module 4, jugée trop
  lourde pour ce besoin) : quand la liste est vide, le formulaire
  d'ajout est pré-rempli avec nom = nom de l'entreprise courante, rôle =
  `mandataire` — l'utilisateur peut modifier avant de valider, exactement
  comme le formulaire d'ajout de ligne BPU. Aucune ligne n'existe en base
  tant que l'utilisateur n'a pas cliqué « Ajouter ».
- **Checklist des pièces administratives à fournir, réutilisant la liste
  déjà documentée dans CLAUDE.md** (RCCM, Carte de Contribuable,
  Attestation de Régularité Fiscale, CNPS, certificat de non-faillite,
  IDU) — 6 clés fixes, cochables, **uniquement affichées pour les membres
  de rôle `co_traitant`** (notre propre ligne a déjà ses pièces suivies
  via la bibliothèque documentaire et la checklist automatique
  existante — afficher la même checklist sur notre propre ligne serait
  redondant). La règle est purement basée sur la valeur du champ `role`
  de la ligne, pas sur une notion de « qui est nous » (qui n'est pas
  trackée structurellement, voir décision précédente).
- **Aucune contrainte métier forcée sur le rôle ou le nombre de
  membres** : rien n'empêche plusieurs lignes `mandataire`, ou zéro — pas
  de validation stricte imposée par l'outil, cohérent avec le reste du
  projet (Go/No-Go, checklist manuelle) qui documente sans jamais
  bloquer.
- **Somme des % jamais bloquante** : un avertissement discret (texte,
  pas de blocage de la saisie ni de l'export) s'affiche si la somme des
  % renseignés (non-null) est différente de 100, et seulement si au moins
  un membre a un % renseigné (sinon rien à signaler).
- **UI : nouvelle carte dans l'onglet Vue d'ensemble** de la page détail
  AO (pas un 3ᵉ onglet — l'ampleur ne justifie pas d'ajouter à la
  contrainte des 2 onglets existants, voir mémoire
  `noubinao_module7_page_detail_onglets`), même patron que la carte
  Go/No-Go et les sections BPU (liste éditable inline, formulaire
  d'ajout en bas).
- **Checklist des pièces toujours visible sous une ligne co-traitant**,
  pas de second niveau de repli/chevron — le rôle conditionne déjà
  l'affichage, un chevron supplémentaire serait un clic pour rien.
- **Pas de nouveau palier tarifaire** : le groupement ne consomme aucun
  appel API Claude (aucune génération IA dans ce sous-projet), cohérent
  avec la facturation au nombre d'AO traités/mois, pas par
  fonctionnalité.
- **Hors périmètre (YAGNI)** : pas de partage réel de données entre
  comptes entreprise ; pas d'invitation d'un co-traitant à rejoindre
  NoubinAO ; pas de génération d'acte de groupement (document légal) —
  seulement le suivi informatif ; pas de lien entre un membre du
  groupement et une ligne du BPU (la répartition financière du
  groupement et le chiffrage du BPU restent deux informations
  distinctes, non croisées en V1).

## Modèle de données

Nouvelle migration `supabase/migrations/20260917100000_groupement_co_traitance.sql` :

```sql
-- Groupement / co-traitance sur un AO (Module 7, lacune 5, la seule des
-- 5 lacunes identifiées vs un ebook générique sur la réponse aux AO qui
-- restait à traiter — voir mémoire noubinao_lacunes_ebook_checklist).
-- Scope volontairement informatif seulement : aucune donnée partagée
-- entre comptes entreprise, un membre du groupement (y compris notre
-- propre entreprise) n'est qu'une ligne texte dans le compte de
-- l'utilisateur. CRUD complet comme section_bpu (ajout, modification,
-- réordonnancement, suppression), pas 1:1 comme evaluation_go_no_go.
create type role_membre_groupement as enum ('mandataire', 'co_traitant');

create table membre_groupement (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  nom text not null,
  role role_membre_groupement not null,
  -- Nullable, comme prix_unitaire/debourse_sec : un membre peut être
  -- listé avant que la répartition du marché soit négociée.
  pourcentage numeric,
  ordre integer not null default 0,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index membre_groupement_appel_offres_id_idx on membre_groupement(appel_offres_id);

-- Pièces administratives à fournir par un co-traitant, mêmes 6 clés que
-- documentées dans CLAUDE.md (bibliothèque documentaire). Existence de
-- la ligne = pièce fournie, même convention que checklist_item_dossier
-- (pas de colonne booléenne) : cocher/décocher insère/supprime la ligne.
-- Affiché côté UI uniquement pour les membres de rôle co_traitant, mais
-- rien n'empêche techniquement une ligne sur un membre mandataire — la
-- restriction est une décision d'affichage, pas une contrainte de
-- données (plus simple, évite un check contraint sur une jointure).
create type cle_piece_groupement as enum (
  'rccm',
  'carte_contribuable',
  'attestation_fiscale',
  'cnps',
  'non_faillite',
  'idu'
);

create table piece_membre_groupement (
  id uuid primary key default gen_random_uuid(),
  membre_groupement_id uuid not null references membre_groupement(id) on delete cascade,
  cle_piece cle_piece_groupement not null,
  created_at timestamptz not null default now(),
  unique (membre_groupement_id, cle_piece)
);

create index piece_membre_groupement_membre_id_idx on piece_membre_groupement(membre_groupement_id);

alter table membre_groupement enable row level security;
alter table piece_membre_groupement enable row level security;

create policy "membre_groupement_select_membres" on membre_groupement
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = membre_groupement.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "membre_groupement_insert_membres" on membre_groupement
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = membre_groupement.appel_offres_id and u.id = auth.uid()
    )
  );

-- WITH CHECK volontairement limité à l'appartenance entreprise, comme
-- section_bpu_update_membres : n'importe quel membre de l'équipe doit
-- pouvoir corriger une ligne créée par un collègue.
create policy "membre_groupement_update_membres" on membre_groupement
  for update
  using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = membre_groupement.appel_offres_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = membre_groupement.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "membre_groupement_delete_membres" on membre_groupement
  for delete using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = membre_groupement.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "piece_membre_groupement_select_membres" on piece_membre_groupement
  for select using (
    exists (
      select 1 from membre_groupement mg
      join appel_offres ao on ao.id = mg.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where mg.id = piece_membre_groupement.membre_groupement_id and u.id = auth.uid()
    )
  );

create policy "piece_membre_groupement_insert_membres" on piece_membre_groupement
  for insert with check (
    exists (
      select 1 from membre_groupement mg
      join appel_offres ao on ao.id = mg.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where mg.id = piece_membre_groupement.membre_groupement_id and u.id = auth.uid()
    )
  );

create policy "piece_membre_groupement_delete_membres" on piece_membre_groupement
  for delete using (
    exists (
      select 1 from membre_groupement mg
      join appel_offres ao on ao.id = mg.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where mg.id = piece_membre_groupement.membre_groupement_id and u.id = auth.uid()
    )
  );
```

Nouveaux types dans `lib/appels-offres/types.ts` :

```ts
export const ROLES_MEMBRE_GROUPEMENT = ["mandataire", "co_traitant"] as const;
export type RoleMembreGroupement = (typeof ROLES_MEMBRE_GROUPEMENT)[number];

export interface MembreGroupement {
  id: string;
  appel_offres_id: string;
  nom: string;
  role: RoleMembreGroupement;
  pourcentage: number | null;
  ordre: number;
  created_by: string | null;
  created_at: string;
}

// Mêmes 6 pièces que documentées dans CLAUDE.md (bibliothèque
// documentaire) — liste fixe, pas dérivée de TYPES_DOCUMENT (qui
// catégorise des fichiers uploadés, pas des exigences de suivi manuel
// sur une entreprise externe qui n'a pas de compte NoubinAO).
export const PIECES_GROUPEMENT = [
  "rccm",
  "carte_contribuable",
  "attestation_fiscale",
  "cnps",
  "non_faillite",
  "idu",
] as const;
export type ClePieceGroupement = (typeof PIECES_GROUPEMENT)[number];
```

## Calculs (fonction pure)

Nouveau fichier `lib/appels-offres/groupement.ts` (même principe de
séparation que `bpu.ts`/`export/plan.ts` : logique pure testée, à part
du code appelant Supabase) :

```ts
import type { MembreGroupement } from "./types";

type MembreAvecPourcentage = Pick<MembreGroupement, "pourcentage">;

// Retourne null si aucun membre n'a de pourcentage renseigné (pour ne
// jamais afficher "0%" trompeur là où rien n'a encore été saisi).
export function calculerSommePourcentages(
  membres: MembreAvecPourcentage[],
): number | null {
  const renseignes = membres.filter((m) => m.pourcentage !== null);
  if (renseignes.length === 0) return null;
  return renseignes.reduce((total, m) => total + (m.pourcentage ?? 0), 0);
}
```

**Tests** (`lib/appels-offres/groupement.test.ts`) :
- Liste vide → `null`.
- Aucun membre avec `pourcentage` renseigné → `null`.
- Un ou plusieurs membres avec `pourcentage`, d'autres `null` → somme des
  seuls membres renseignés (les `null` ignorés, pas traités comme `0`).
- Somme exacte à 100 → `100` (cas nominal, pas de traitement spécial
  côté fonction — l'avertissement d'écart est un calcul UI, pas une
  responsabilité de cette fonction).
- Somme différente de 100 (au-dessus ou au-dessous) → retourne la valeur
  réelle telle quelle, la fonction ne juge jamais la validité du total.

## Validation (Zod)

Nouveau schéma dans `lib/appels-offres/schema.ts` :

```ts
export const membreGroupementSchema = z.object({
  nom: z
    .string()
    .trim()
    .min(1, "Le nom est requis")
    .max(200, "Nom trop long (200 caractères maximum)"),
  role: z.enum(ROLES_MEMBRE_GROUPEMENT),
  // Borné à [0, 100] : contrairement au taux de frais de structure du
  // sous-projet BPU (un coefficient qui peut dépasser 100%), c'est un
  // pourcentage réel de répartition d'un marché — jamais > 100 pour un
  // seul membre.
  pourcentage: z
    .string()
    .nullable()
    .refine((v) => v === null || v.trim().length === 0 || /^\d+(\.\d+)?$/.test(v.trim()), {
      message: "Pourcentage invalide",
    })
    .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100), {
      message: "Le pourcentage doit être compris entre 0 et 100",
    }),
});

export type MembreGroupementInput = z.infer<typeof membreGroupementSchema>;
```

## Server Actions

Nouvelles fonctions dans `lib/appels-offres/actions.ts`, même patron que
`creerSectionBpu`/`renommerSectionBpu`/`deplacerSectionBpu`/`supprimerSectionBpu` :

```ts
export async function creerMembreGroupement(
  appelOffresId: string,
  input: { nom: string; role: string; pourcentage: string | null },
): Promise<{ erreur: string } | { succes: true; membre: MembreGroupement }>

export async function modifierMembreGroupement(
  appelOffresId: string,
  membreId: string,
  input: { nom: string; role: string; pourcentage: string | null },
): Promise<{ erreur: string } | { succes: true }>

export async function deplacerMembreGroupement(
  appelOffresId: string,
  membreId: string,
  sens: "haut" | "bas",
): Promise<{ erreur: string } | { succes: true; membres: MembreGroupement[] }>

export async function supprimerMembreGroupement(
  appelOffresId: string,
  membreId: string,
): Promise<{ erreur: string } | { succes: true }>
```

Chacune : auth via `obtenirUtilisateurCourant`, validation
`membreGroupementSchema.safeParse` (sauf `deplacer`/`supprimer`),
`revalidatePath('/appels-offres/${appelOffresId}')`, `{ erreur }`
générique sur échec Supabase — même patron exact que les Server Actions
de section BPU (le déplacement réutilise la même mécanique de
permutation par `ordre`).

Nouvelle Server Action pour la checklist de pièces, même patron exact
que `basculerChecklistManuelle` (existant, `lib/appels-offres/actions.ts`
ligne 595 — lecture par `(membreId, clePiece)`, `delete` si la ligne
existe déjà, sinon `insert`) :

```ts
export async function basculerPieceMembreGroupement(
  appelOffresId: string,
  membreId: string,
  clePiece: ClePieceGroupement,
): Promise<{ erreur: string } | { succes: true; fournie: boolean }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: existant, error: erreurLecture } = await supabase
    .from("piece_membre_groupement")
    .select("id")
    .eq("membre_groupement_id", membreId)
    .eq("cle_piece", clePiece)
    .maybeSingle();

  if (erreurLecture) return { erreur: "Échec de la mise à jour. Réessayez." };

  if (existant) {
    const { error } = await supabase
      .from("piece_membre_groupement")
      .delete()
      .eq("id", existant.id);
    if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
    revalidatePath(`/appels-offres/${appelOffresId}`);
    return { succes: true as const, fournie: false };
  }

  const { error } = await supabase.from("piece_membre_groupement").insert({
    membre_groupement_id: membreId,
    cle_piece: clePiece,
  });
  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, fournie: true };
}
```

Contrairement à `checklist_item_dossier` (qui trace `coche_par`, un état
d'équipe attribuable), `piece_membre_groupement` ne trace pas qui a
coché — la pièce d'un co-traitant externe n'a pas de notion d'auteur
interne pertinente, seulement un état fourni/non fourni.

## Intégration dans la lecture existante

Nouvelle fonction dans `lib/appels-offres/queries.ts` :

```ts
export async function listerGroupement(appelOffresId: string): Promise<{
  membres: MembreGroupement[];
  piecesParMembre: Record<string, ClePieceGroupement[]>;
}>
```

Charge `membre_groupement` (triés par `ordre`) puis, pour l'ensemble des
`id` obtenus, `piece_membre_groupement` en une seconde requête (`.in("membre_groupement_id", ids)`),
regroupées en mémoire par membre — même pattern que `obtenirAppelOffres`
pour `exigence_document`, pas de requête jointe SQL (plus simple à lire,
cohérent avec le reste du projet qui n'utilise pas de jointures
imbriquées côté Supabase JS).

Appelée depuis `app/(app)/appels-offres/[id]/page.tsx`, ajoutée au
`Promise.all` existant, transmise en prop à `AppelOffresDetail` puis à
la nouvelle carte (voir section Interface).

## Interface

**Nouveau fichier `app/(app)/appels-offres/[id]/groupement-card.tsx`**
(Client Component, dans une `<Card>` shadcn/ui — **pas de `<Table>`** :
seulement 3 champs par membre (contre 5-7 pour une ligne BPU), un
tableau imposerait un défilement horizontal inutile sur mobile pour si
peu de colonnes, contraire au mobile-first de CLAUDE.md). Chaque membre
est un bloc `flex flex-wrap items-end gap-2` (même style que la
sous-ligne pyramide de coût du BPU) : `<Input>` nom, `<Select>` rôle
(mandataire/co-traitant), `<Input type="number">` pourcentage, boutons
↑/↓/Supprimer — même mécanique `onBlur` que `BpuLigneRow` (sauvegarde au
blur, pas de bouton « Enregistrer » séparé).
- Quand `role === "co_traitant"` pour un membre : un bloc juste en
  dessous (toujours visible, pas de chevron) affiche les 6 cases à
  cocher `PIECES_GROUPEMENT`, chaque case appelant
  `basculerPieceMembreGroupement` au clic.
- Formulaire d'ajout en bas : pré-rempli avec nom = nom de l'entreprise
  courante et rôle = `mandataire` **uniquement quand la liste est
  vide** (state local, pas une prop serveur — la valeur du nom
  d'entreprise doit donc être transmise en prop à la carte pour ce
  pré-remplissage).
- Pied de carte : somme des % (`calculerSommePourcentages`) avec un
  texte d'avertissement discret (`text-muted-foreground` ou équivalent
  ambre, pas rouge — ce n'est pas une erreur) si la somme n'est ni
  `null` ni égale à 100.

**`app/(app)/appels-offres/[id]/appel-offres-detail.tsx`** : nouvelle
prop `groupement: { membres: MembreGroupement[]; piecesParMembre: Record<string, ClePieceGroupement[]> }`
et `nomEntreprise: string` (pour le pré-remplissage), rendu de
`<GroupementCard>` dans l'onglet Vue d'ensemble, après la carte Go/No-Go
(ordre de lecture logique : d'abord qualifier l'AO, puis composer le
groupement, avant le chiffrage BPU qui a son propre onglet).

**`app/(app)/appels-offres/[id]/page.tsx`** : `listerGroupement(id)`
ajouté au `Promise.all` existant. `nomEntreprise` : vérifié dans le code
existant — `obtenirUtilisateurCourant()` (`lib/utilisateur/queries.ts`)
ne sélectionne que `id, entreprise_id, nom`, où `nom` est le nom de
l'**utilisateur**, pas de l'entreprise ; aucune fonction n'expose
aujourd'hui `entreprise.nom` (la seule lecture existante de la ligne
`entreprise`, `obtenirTauxFraisStructureDefaut`, ne sélectionne que
`taux_frais_structure_defaut`). Nouvelle fonction dans
`lib/utilisateur/queries.ts`, à côté de `obtenirTauxFraisStructureDefaut` :

```ts
export async function obtenirNomEntreprise(entrepriseId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entreprise")
    .select("nom")
    .eq("id", entrepriseId)
    .maybeSingle();
  return data?.nom ?? null;
}
```

## États et erreurs

- Aucun membre : la carte affiche un message vide (cohérent avec
  `aucuneSection` du BPU) et le formulaire d'ajout pré-rempli comme
  décrit ci-dessus.
- Membre `mandataire` : pas de checklist de pièces affichée, jamais.
- Membre `co_traitant`, aucune pièce cochée : les 6 cases apparaissent
  toutes décochées, jamais de warning (une pièce non cochée n'est pas
  une erreur, juste un état pas encore renseigné — cohérent avec
  `checklist_item_dossier`, jamais bloquant pour l'export).
- Pourcentage vide sur un ou plusieurs membres : ignorés dans le calcul
  de la somme, jamais traités comme `0`.
- Somme des % ≠ 100 : avertissement textuel, jamais bloquant, jamais une
  erreur de validation Zod.
- Échec d'une Server Action (`creerMembreGroupement`, etc.) : toast
  d'erreur générique + revert local, même patron que le reste du BPU.

## Tests

- TDD sur `calculerSommePourcentages` (voir cas listés en section
  Calculs).
- Pas de nouveau test sur les Server Actions ni sur les composants UI —
  cohérent avec le reste du projet.

## Hors périmètre

- Partage réel de données entre comptes entreprise, invitation d'un
  co-traitant à rejoindre NoubinAO (voir décision d'architecture en
  introduction).
- Génération d'un acte de groupement ou de tout autre document légal —
  seulement le suivi informatif dans l'interface.
- Lien entre un membre du groupement et une ligne du BPU (répartition
  financière du groupement et chiffrage du bordereau restent deux
  informations distinctes en V1).
- Nouveau palier tarifaire ou changement du modèle de facturation.
- Validation stricte de la somme des % ou du nombre de mandataires —
  toujours informatif, jamais bloquant.
