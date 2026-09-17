# Groupement / co-traitance sur un AO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Documenter les membres d'un groupement (mandataire + co-traitants) sur un AO — nom, rôle, % de répartition, et pour les co-traitants une checklist de 6 pièces administratives à fournir — sans jamais partager de données entre comptes entreprise.

**Architecture:** Deux nouvelles tables (`membre_groupement`, `piece_membre_groupement`) au même niveau que `section_bpu`/`checklist_item_dossier` dans le modèle relationnel. Une fonction pure `calculerSommePourcentages` pour l'avertissement de somme. Une nouvelle carte dans l'onglet Vue d'ensemble de la page détail AO, entre la carte Go/No-Go et le Rétroplanning.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase Postgres/RLS, Zod, next-intl, Vitest, shadcn/ui (`Select`, `Checkbox`, `Input`, `Button`, `Label`), lucide-react.

## Global Constraints

- Scope purement informatif : aucun partage de compte ni de données entre entreprises. Un co-traitant n'a jamais accès à NoubinAO via cette fonctionnalité.
- Notre propre entreprise est un membre comme les autres dans la liste — aucune colonne ni logique serveur ne marque « c'est nous ». Le pré-remplissage (nom = nom entreprise, rôle = mandataire) se fait uniquement dans le formulaire d'ajout côté client, quand la liste est vide — jamais une ligne créée automatiquement en base.
- La checklist des 6 pièces (`rccm`, `carte_contribuable`, `attestation_fiscale`, `cnps`, `non_faillite`, `idu`) ne s'affiche que pour les membres de rôle `co_traitant` — c'est une règle d'affichage basée sur le champ `role`, pas une contrainte de données.
- Aucune contrainte métier forcée : plusieurs `mandataire` possibles, `pourcentage` toujours nullable, jamais bloquant.
- Somme des % : avertissement textuel seulement (jamais un blocage), affiché seulement si la somme est différente de 100 ET qu'au moins un membre a un `pourcentage` renseigné.
- `pourcentage` borné à `[0, 100]` côté Zod (contrairement à `prixUnitaire`/`debourseSec` ailleurs dans le projet, sans borne haute) — un pourcentage de marché n'a jamais de sens au-delà de 100 pour un seul membre.
- Pas de `<Table>` pour la liste des membres — seulement 3 champs par membre, un bloc `flex flex-wrap` par ligne (comme la sous-ligne pyramide de coût du BPU), pas de défilement horizontal inutile sur mobile.
- Nouvelle carte dans l'onglet **Vue d'ensemble** existant (pas de 3ᵉ onglet), rendue entre `<GoNoGo>` et `<Retroplanning>` dans `appel-offres-detail.tsx`.
- Suivre la convention déjà établie dans ce fichier pour les sections de l'onglet Vue d'ensemble (`GoNoGo`, `ChecklistSoumission`) : un simple `<div className="border rounded-lg p-4">` (ou `flex flex-col gap-3` sans bordure pour les sections plus légères) avec son propre `<h2>`, pas de composant shadcn `<Card>` — ce dernier n'est utilisé que dans `/parametres`.
- Migration SQL créée mais **jamais poussée par l'implémenteur** (`supabase db push` interdit) — relue et appliquée séparément par le contrôleur avant le merge.
- Pas de nouveau test sur les Server Actions ni les composants UI — seule `calculerSommePourcentages` est testée (TDD), cohérent avec le reste du projet.

---

### Task 1: Modèle de données — migration + types

**Files:**
- Create: `supabase/migrations/20260917100000_groupement_co_traitance.sql`
- Modify: `lib/appels-offres/types.ts`

**Interfaces:**
- Produces: `RoleMembreGroupement`, `MembreGroupement`, `PIECES_GROUPEMENT`, `ClePieceGroupement` — consommés par les Tasks 2-5.

- [ ] **Step 1: Écrire la migration**

Créer `supabase/migrations/20260917100000_groupement_co_traitance.sql` :

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

- [ ] **Step 2: Enrichir `lib/appels-offres/types.ts`**

Le fichier actuel se termine par l'interface `LigneBpu` :

```ts
export interface LigneBpu {
  id: string;
  section_bpu_id: string;
  code_article: string | null;
  designation: string;
  unite: string;
  quantite: number;
  prix_unitaire: number | null;
  debourse_sec: number | null;
  taux_frais_structure: number | null;
  ordre: number;
  created_by: string | null;
  created_at: string;
}
```

Ajouter à la fin du fichier :

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

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: NE PAS exécuter `supabase db push`**

La migration reste locale — elle sera appliquée par le contrôleur une
fois la branche entière revue, avant le merge. N'exécute aucune commande
touchant la base Supabase distante dans cette tâche.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260917100000_groupement_co_traitance.sql lib/appels-offres/types.ts
git commit -m "feat: tables membre_groupement/piece_membre_groupement, types RoleMembreGroupement/MembreGroupement/ClePieceGroupement"
```

---

### Task 2: Calcul pur `calculerSommePourcentages` (TDD)

**Files:**
- Create: `lib/appels-offres/groupement.ts`
- Create: `lib/appels-offres/groupement.test.ts`

**Interfaces:**
- Consumes: `MembreGroupement` depuis `./types` (Task 1) — seulement `pourcentage` via `Pick`.
- Produces: `calculerSommePourcentages(membres: Pick<MembreGroupement, "pourcentage">[]): number | null` — consommé par la Task 5 (`groupement-card.tsx`).

- [ ] **Step 1: Écrire les tests (ils doivent tous échouer, `calculerSommePourcentages` n'existe pas encore)**

Créer `lib/appels-offres/groupement.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { calculerSommePourcentages } from "./groupement";

describe("calculerSommePourcentages", () => {
  it("retourne null pour une liste vide", () => {
    expect(calculerSommePourcentages([])).toBeNull();
  });

  it("retourne null quand aucun membre n'a de pourcentage renseigné", () => {
    expect(
      calculerSommePourcentages([{ pourcentage: null }, { pourcentage: null }]),
    ).toBeNull();
  });

  it("somme les pourcentages renseignés, ignore les null", () => {
    expect(
      calculerSommePourcentages([
        { pourcentage: 60 },
        { pourcentage: null },
        { pourcentage: 40 },
      ]),
    ).toBe(100);
  });

  it("retourne la somme exacte quand elle vaut 100", () => {
    expect(calculerSommePourcentages([{ pourcentage: 70 }, { pourcentage: 30 }])).toBe(100);
  });

  it("retourne la somme réelle sans la juger quand elle est différente de 100", () => {
    expect(calculerSommePourcentages([{ pourcentage: 60 }, { pourcentage: 60 }])).toBe(120);
    expect(calculerSommePourcentages([{ pourcentage: 30 }])).toBe(30);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/appels-offres/groupement.test.ts`
Expected: FAIL — impossible de résoudre `./groupement` (le fichier n'existe pas encore).

- [ ] **Step 3: Écrire l'implémentation**

Créer `lib/appels-offres/groupement.ts` :

```ts
import type { MembreGroupement } from "./types";

type MembreAvecPourcentage = Pick<MembreGroupement, "pourcentage">;

// Retourne null si aucun membre n'a de pourcentage renseigné (pour ne
// jamais afficher "0%" trompeur là où rien n'a encore été saisi). Les
// membres à null sont ignorés dans la somme, jamais traités comme 0.
export function calculerSommePourcentages(
  membres: MembreAvecPourcentage[],
): number | null {
  const renseignes = membres.filter((m) => m.pourcentage !== null);
  if (renseignes.length === 0) return null;
  return renseignes.reduce((total, m) => total + (m.pourcentage ?? 0), 0);
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run lib/appels-offres/groupement.test.ts`
Expected: PASS, 5/5 tests verts.

- [ ] **Step 5: Vérifier que le projet compile toujours**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/groupement.ts lib/appels-offres/groupement.test.ts
git commit -m "feat: calculerSommePourcentages (TDD)"
```

---

### Task 3: Validation, Server Actions et `obtenirNomEntreprise`

**Files:**
- Modify: `lib/appels-offres/schema.ts`
- Modify: `lib/appels-offres/actions.ts`
- Modify: `lib/utilisateur/queries.ts`

**Interfaces:**
- Consumes: `MembreGroupement`, `RoleMembreGroupement`, `ClePieceGroupement` depuis `./types` (Task 1).
- Produces: `membreGroupementSchema` (Zod), `creerMembreGroupement`, `modifierMembreGroupement`, `deplacerMembreGroupement`, `supprimerMembreGroupement`, `basculerPieceMembreGroupement`, `obtenirNomEntreprise(entrepriseId: string): Promise<string | null>` — consommés par la Task 5.

- [ ] **Step 1: Ajouter `membreGroupementSchema` à `lib/appels-offres/schema.ts`**

L'import des types en tête du fichier actuel :

```ts
import { CRITERES_GO_NO_GO, STATUTS_PIPELINE_AO } from "./types";
```

devient :

```ts
import { CRITERES_GO_NO_GO, ROLES_MEMBRE_GROUPEMENT, STATUTS_PIPELINE_AO } from "./types";
```

Ajouter à la fin du fichier (après `tauxFraisStructureDefautSchema`) :

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

- [ ] **Step 2: Ajouter les Server Actions à `lib/appels-offres/actions.ts`**

L'import du schéma actuel :

```ts
import {
  televerserDaoSchema,
  modifierAppelOffresSchema,
  modifierStatutPipelineSchema,
  mettreAJourEvaluationGoNoGoSchema,
  creerJalonSchema,
  creerSectionBpuSchema,
  ligneBpuSchema,
  tauxFraisStructureDefautSchema,
} from "./schema";
```

devient :

```ts
import {
  televerserDaoSchema,
  modifierAppelOffresSchema,
  modifierStatutPipelineSchema,
  mettreAJourEvaluationGoNoGoSchema,
  creerJalonSchema,
  creerSectionBpuSchema,
  ligneBpuSchema,
  tauxFraisStructureDefautSchema,
  membreGroupementSchema,
} from "./schema";
```

L'import de types en tête du fichier actuel :

```ts
import type {
  AppelOffres,
  CleChecklistManuelle,
  CritereGoNoGo,
  JalonRetroplanning,
  LigneBpu,
  SectionBpu,
  StatutPipelineAo,
  StatutSectionDossier,
} from "./types";
```

devient :

```ts
import type {
  AppelOffres,
  ClePieceGroupement,
  CleChecklistManuelle,
  CritereGoNoGo,
  JalonRetroplanning,
  LigneBpu,
  MembreGroupement,
  SectionBpu,
  StatutPipelineAo,
  StatutSectionDossier,
} from "./types";
```

Ajouter à la fin du fichier :

```ts
export async function creerMembreGroupement(
  appelOffresId: string,
  input: { nom: string; role: string; pourcentage: string | null },
): Promise<{ erreur: string } | { succes: true; membre: MembreGroupement }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = membreGroupementSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data: dernierMembre } = await supabase
    .from("membre_groupement")
    .select("ordre")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prochainOrdre = dernierMembre ? dernierMembre.ordre + 1 : 0;

  const { data, error } = await supabase
    .from("membre_groupement")
    .insert({
      appel_offres_id: appelOffresId,
      nom: parsed.data.nom,
      role: parsed.data.role,
      pourcentage: parsed.data.pourcentage,
      ordre: prochainOrdre,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de l'ajout du membre. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, membre: data as MembreGroupement };
}

export async function modifierMembreGroupement(
  appelOffresId: string,
  membreId: string,
  input: { nom: string; role: string; pourcentage: string | null },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = membreGroupementSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("membre_groupement")
    .update({
      nom: parsed.data.nom,
      role: parsed.data.role,
      pourcentage: parsed.data.pourcentage,
    })
    .eq("id", membreId)
    .select("id");

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Membre introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

// Même mécanique de permutation que deplacerSectionBpu, scopée
// directement à l'AO (pas de parent intermédiaire comme section_bpu
// pour ligne_bpu — membre_groupement est un niveau plat).
export async function deplacerMembreGroupement(
  appelOffresId: string,
  membreId: string,
  sens: "haut" | "bas",
): Promise<{ erreur: string } | { succes: true; membres: MembreGroupement[] }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: membres, error: erreurLecture } = await supabase
    .from("membre_groupement")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: true });

  if (erreurLecture || !membres) return { erreur: "Échec du déplacement. Réessayez." };

  const index = membres.findIndex((m) => m.id === membreId);
  if (index === -1) return { erreur: "Membre introuvable." };

  const indexVoisin = sens === "haut" ? index - 1 : index + 1;
  if (indexVoisin < 0 || indexVoisin >= membres.length) {
    return { succes: true as const, membres: membres as MembreGroupement[] };
  }

  const membre = membres[index];
  const voisin = membres[indexVoisin];
  const ordreMembre = membre.ordre;
  const ordreVoisin = voisin.ordre;

  const { error: erreurA } = await supabase
    .from("membre_groupement")
    .update({ ordre: ordreVoisin })
    .eq("id", membre.id);

  const { error: erreurB } = await supabase
    .from("membre_groupement")
    .update({ ordre: ordreMembre })
    .eq("id", voisin.id);

  if (erreurA || erreurB) return { erreur: "Échec du déplacement. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);

  const membresReordonnes = membres
    .map((m) => {
      if (m.id === membre.id) return { ...m, ordre: ordreVoisin };
      if (m.id === voisin.id) return { ...m, ordre: ordreMembre };
      return m;
    })
    .sort((a, b) => a.ordre - b.ordre);

  return { succes: true as const, membres: membresReordonnes as MembreGroupement[] };
}

export async function supprimerMembreGroupement(
  appelOffresId: string,
  membreId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("membre_groupement")
    .delete()
    .eq("id", membreId)
    .select("id");

  if (error) return { erreur: "Échec de la suppression. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Membre introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

// Même patron exact que basculerChecklistManuelle (existant plus haut
// dans ce fichier) : lecture par clé composite, delete si la ligne
// existe déjà, sinon insert. Contrairement à checklist_item_dossier,
// piece_membre_groupement ne trace pas d'auteur (coche_par) — la pièce
// d'un co-traitant externe n'a pas de notion d'auteur interne
// pertinente, seulement un état fourni/non fourni.
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

- [ ] **Step 3: Ajouter `obtenirNomEntreprise` à `lib/utilisateur/queries.ts`**

Le fichier actuel se termine par `obtenirTauxFraisStructureDefaut` :

```ts
export async function obtenirTauxFraisStructureDefaut(
  entrepriseId: string,
): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entreprise")
    .select("taux_frais_structure_defaut")
    .eq("id", entrepriseId)
    .maybeSingle();
  return data?.taux_frais_structure_defaut ?? null;
}
```

Ajouter à la fin du fichier :

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

- [ ] **Step 4: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 5: Vérifier que les tests passent toujours**

Run: `npx vitest run`
Expected: tous les tests verts (les 5 tests de la Task 2 + tous les
tests existants, aucune régression). Aucun nouveau test dans cette
tâche.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/schema.ts lib/appels-offres/actions.ts lib/utilisateur/queries.ts
git commit -m "feat: Server Actions de membre de groupement + basculerPieceMembreGroupement + obtenirNomEntreprise"
```

---

### Task 4: Requête `listerGroupement`

**Files:**
- Modify: `lib/appels-offres/queries.ts`

**Interfaces:**
- Consumes: `MembreGroupement`, `ClePieceGroupement` depuis `./types` (Task 1).
- Produces: `listerGroupement(appelOffresId: string): Promise<{ membres: MembreGroupement[]; piecesParMembre: Record<string, ClePieceGroupement[]> }>` — consommé par la Task 5.

- [ ] **Step 1: Enrichir l'import de types en tête de `lib/appels-offres/queries.ts`**

L'import actuel :

```ts
import type {
  AppelOffres,
  CleChecklistManuelle,
  DossierReponse,
  EvaluationGoNoGo,
  ExigenceAo,
  JalonRetroplanning,
  LigneBpu,
  SectionBpu,
  SectionDossier,
} from "./types";
```

devient :

```ts
import type {
  AppelOffres,
  ClePieceGroupement,
  CleChecklistManuelle,
  DossierReponse,
  EvaluationGoNoGo,
  ExigenceAo,
  JalonRetroplanning,
  LigneBpu,
  MembreGroupement,
  SectionBpu,
  SectionDossier,
} from "./types";
```

- [ ] **Step 2: Ajouter `listerGroupement`**

Juste après `listerBpu` (fin du fichier), même patron exact :

```ts
export async function listerGroupement(appelOffresId: string): Promise<{
  membres: MembreGroupement[];
  piecesParMembre: Record<string, ClePieceGroupement[]>;
}> {
  const supabase = await createClient();

  const { data: membres, error: erreurMembres } = await supabase
    .from("membre_groupement")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: true });

  if (erreurMembres) throw erreurMembres;

  const membresTypes = (membres ?? []) as MembreGroupement[];
  const piecesParMembre: Record<string, ClePieceGroupement[]> = {};

  for (const membre of membresTypes) {
    piecesParMembre[membre.id] = [];
  }

  if (membresTypes.length > 0) {
    const { data: pieces, error: erreurPieces } = await supabase
      .from("piece_membre_groupement")
      .select("membre_groupement_id, cle_piece")
      .in(
        "membre_groupement_id",
        membresTypes.map((m) => m.id),
      );

    if (erreurPieces) throw erreurPieces;

    for (const piece of pieces ?? []) {
      piecesParMembre[piece.membre_groupement_id].push(piece.cle_piece as ClePieceGroupement);
    }
  }

  return { membres: membresTypes, piecesParMembre };
}
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Vérifier que les tests passent toujours**

Run: `npx vitest run`
Expected: tous les tests verts, aucune régression. Aucun nouveau test
dans cette tâche (pas de test sur le code appelant Supabase, cohérent
avec le reste du projet).

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/queries.ts
git commit -m "feat: listerGroupement"
```

---

### Task 5: Interface — carte Groupement

**Files:**
- Create: `app/(app)/appels-offres/[id]/groupement-card.tsx`
- Modify: `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`
- Modify: `app/(app)/appels-offres/[id]/page.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `calculerSommePourcentages` (Task 2) ; toutes les Server Actions de la Task 3 ; `listerGroupement`, `obtenirNomEntreprise` (Tasks 3-4) ; `MembreGroupement`, `RoleMembreGroupement`, `ROLES_MEMBRE_GROUPEMENT`, `PIECES_GROUPEMENT`, `ClePieceGroupement` (Task 1).

- [ ] **Step 1: Ajouter les traductions dans `messages/fr.json`**

Le bloc `"goNoGo"` actuel se termine ainsi, juste avant `"retroplanning"` :

```json
      "goNoGo": {
        "titre": "Décision Go/No-Go",
        "criteres": {
          "juridique": "Capacité juridique & administrative",
          "faisabilite": "Faisabilité technique & disponibilité",
          "rentabilite": "Rentabilité & alignement stratégique"
        },
        "critereValeur": {
          "a_evaluer": "À évaluer",
          "oui": "Oui",
          "non": "Non"
        },
        "verdict": {
          "go": "Go",
          "no_go": "No-Go",
          "en_attente": "En attente"
        },
        "notePlaceholder": "Note (optionnel)",
        "boutonEnregistrer": "Enregistrer",
        "envoiEnCours": "Enregistrement...",
        "toastEnregistre": "Évaluation enregistrée"
      },
      "retroplanning": {
```

Insérer un nouveau bloc `"groupement"` entre les deux :

```json
      "goNoGo": {
        "titre": "Décision Go/No-Go",
        "criteres": {
          "juridique": "Capacité juridique & administrative",
          "faisabilite": "Faisabilité technique & disponibilité",
          "rentabilite": "Rentabilité & alignement stratégique"
        },
        "critereValeur": {
          "a_evaluer": "À évaluer",
          "oui": "Oui",
          "non": "Non"
        },
        "verdict": {
          "go": "Go",
          "no_go": "No-Go",
          "en_attente": "En attente"
        },
        "notePlaceholder": "Note (optionnel)",
        "boutonEnregistrer": "Enregistrer",
        "envoiEnCours": "Enregistrement...",
        "toastEnregistre": "Évaluation enregistrée"
      },
      "groupement": {
        "titre": "Groupement",
        "aucunMembre": "Aucun membre pour l'instant.",
        "champNom": "Nom de l'entreprise",
        "champRole": "Rôle",
        "role": {
          "mandataire": "Mandataire",
          "co_traitant": "Co-traitant"
        },
        "champPourcentage": "% du marché",
        "fleche": {
          "haut": "↑",
          "bas": "↓"
        },
        "supprimer": "Supprimer",
        "boutonAjouter": "Ajouter un membre",
        "ajoutEnCours": "Ajout...",
        "champsRequis": "Veuillez remplir les champs requis",
        "toastMembreAjoute": "Membre ajouté",
        "toastMembreSupprime": "Membre supprimé",
        "erreurBascule": "Échec de la mise à jour. Réessayez.",
        "piecesAFournir": "Pièces à fournir",
        "pieces": {
          "rccm": "RCCM",
          "carte_contribuable": "Carte de Contribuable",
          "attestation_fiscale": "Attestation de Régularité Fiscale",
          "cnps": "Attestation CNPS",
          "non_faillite": "Certificat de non-faillite",
          "idu": "IDU"
        },
        "totalPourcentage": "Total",
        "avertissementSomme": "La somme des % ({total}%) est différente de 100%"
      },
      "retroplanning": {
```

- [ ] **Step 2: Ajouter les mêmes traductions dans `messages/en.json`**

Même bloc `"goNoGo"`, même position (juste avant `"retroplanning"`) :

```json
      "goNoGo": {
        "titre": "Go/No-Go decision",
        "criteres": {
          "juridique": "Legal & administrative capacity",
          "faisabilite": "Technical feasibility & availability",
          "rentabilite": "Profitability & strategic fit"
        },
        "critereValeur": {
          "a_evaluer": "To evaluate",
          "oui": "Yes",
          "non": "No"
        },
        "verdict": {
          "go": "Go",
          "no_go": "No-Go",
          "en_attente": "Pending"
        },
        "notePlaceholder": "Note (optional)",
        "boutonEnregistrer": "Save",
        "envoiEnCours": "Saving...",
        "toastEnregistre": "Evaluation saved"
      },
      "retroplanning": {
```

devient :

```json
      "goNoGo": {
        "titre": "Go/No-Go decision",
        "criteres": {
          "juridique": "Legal & administrative capacity",
          "faisabilite": "Technical feasibility & availability",
          "rentabilite": "Profitability & strategic fit"
        },
        "critereValeur": {
          "a_evaluer": "To evaluate",
          "oui": "Yes",
          "non": "No"
        },
        "verdict": {
          "go": "Go",
          "no_go": "No-Go",
          "en_attente": "Pending"
        },
        "notePlaceholder": "Note (optional)",
        "boutonEnregistrer": "Save",
        "envoiEnCours": "Saving...",
        "toastEnregistre": "Evaluation saved"
      },
      "groupement": {
        "titre": "Consortium",
        "aucunMembre": "No member yet.",
        "champNom": "Company name",
        "champRole": "Role",
        "role": {
          "mandataire": "Lead firm",
          "co_traitant": "Partner firm"
        },
        "champPourcentage": "% of the contract",
        "fleche": {
          "haut": "↑",
          "bas": "↓"
        },
        "supprimer": "Delete",
        "boutonAjouter": "Add a member",
        "ajoutEnCours": "Adding...",
        "champsRequis": "Please fill in the required fields",
        "toastMembreAjoute": "Member added",
        "toastMembreSupprime": "Member deleted",
        "erreurBascule": "Update failed. Please try again.",
        "piecesAFournir": "Documents to provide",
        "pieces": {
          "rccm": "Trade register (RCCM)",
          "carte_contribuable": "Taxpayer card",
          "attestation_fiscale": "Tax compliance certificate",
          "cnps": "Social security certificate (CNPS)",
          "non_faillite": "Non-bankruptcy certificate",
          "idu": "Unique identifier (IDU)"
        },
        "totalPourcentage": "Total",
        "avertissementSomme": "The percentages add up to {total}%, not 100%"
      },
      "retroplanning": {
```

- [ ] **Step 3: Vérifier que les deux fichiers restent du JSON valide**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('OK')"`
Expected: `OK`.

- [ ] **Step 4: Créer `app/(app)/appels-offres/[id]/groupement-card.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  creerMembreGroupement,
  modifierMembreGroupement,
  deplacerMembreGroupement,
  supprimerMembreGroupement,
  basculerPieceMembreGroupement,
} from "@/lib/appels-offres/actions";
import { calculerSommePourcentages } from "@/lib/appels-offres/groupement";
import {
  ROLES_MEMBRE_GROUPEMENT,
  PIECES_GROUPEMENT,
  type MembreGroupement,
  type RoleMembreGroupement,
  type ClePieceGroupement,
} from "@/lib/appels-offres/types";

function LignePieces({
  appelOffresId,
  membreId,
  piecesInitiales,
}: {
  appelOffresId: string;
  membreId: string;
  piecesInitiales: ClePieceGroupement[];
}) {
  const t = useTranslations("AppelsOffres.detail.groupement");
  const [pieces, setPieces] = useState(piecesInitiales);
  const [isPending, startTransition] = useTransition();

  function basculer(cle: ClePieceGroupement, coche: boolean) {
    setPieces((liste) => (coche ? [...liste, cle] : liste.filter((c) => c !== cle)));

    startTransition(async () => {
      const resultat = await basculerPieceMembreGroupement(appelOffresId, membreId, cle);
      if ("erreur" in resultat) {
        toast.error(t("erreurBascule"));
        setPieces((liste) => (coche ? liste.filter((c) => c !== cle) : [...liste, cle]));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 pl-4">
      <h4 className="text-xs font-medium uppercase text-muted-foreground">
        {t("piecesAFournir")}
      </h4>
      <ul className="flex flex-col gap-1 text-sm">
        {PIECES_GROUPEMENT.map((cle) => {
          const coche = pieces.includes(cle);
          return (
            <li key={cle} className="flex items-center gap-2">
              <Checkbox
                id={`piece-${membreId}-${cle}`}
                checked={coche}
                aria-busy={isPending}
                onCheckedChange={(valeur) => basculer(cle, valeur === true)}
              />
              <Label htmlFor={`piece-${membreId}-${cle}`}>{t(`pieces.${cle}`)}</Label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LigneMembre({
  appelOffresId,
  membre,
  piecesInitiales,
  estPremiere,
  estDerniere,
  onMembresModifies,
}: {
  appelOffresId: string;
  membre: MembreGroupement;
  piecesInitiales: ClePieceGroupement[];
  estPremiere: boolean;
  estDerniere: boolean;
  onMembresModifies: (updater: (membresCourants: MembreGroupement[]) => MembreGroupement[]) => void;
}) {
  const t = useTranslations("AppelsOffres.detail.groupement");
  const [nom, setNom] = useState(membre.nom);
  const [role, setRole] = useState<RoleMembreGroupement>(membre.role);
  const [pourcentage, setPourcentage] = useState(
    membre.pourcentage === null ? "" : String(membre.pourcentage),
  );

  function reinitialiser() {
    setNom(membre.nom);
    setRole(membre.role);
    setPourcentage(membre.pourcentage === null ? "" : String(membre.pourcentage));
  }

  async function enregistrer(champsRole?: RoleMembreGroupement) {
    const input = {
      nom,
      role: champsRole ?? role,
      pourcentage: pourcentage.trim().length > 0 ? pourcentage : null,
    };

    const resultat = await modifierMembreGroupement(appelOffresId, membre.id, input);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      reinitialiser();
      return;
    }

    onMembresModifies((membresCourants) =>
      membresCourants.map((m) =>
        m.id === membre.id
          ? {
              ...m,
              nom: input.nom,
              role: input.role,
              pourcentage: input.pourcentage === null ? null : Number(input.pourcentage),
            }
          : m,
      ),
    );
  }

  async function deplacer(sens: "haut" | "bas") {
    const resultat = await deplacerMembreGroupement(appelOffresId, membre.id, sens);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    const membresRetournes = resultat.membres;
    onMembresModifies(() => membresRetournes);
  }

  async function supprimer() {
    const resultat = await supprimerMembreGroupement(appelOffresId, membre.id);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onMembresModifies((membresCourants) => membresCourants.filter((m) => m.id !== membre.id));
    toast.success(t("toastMembreSupprime"));
  }

  return (
    <li className="flex flex-col gap-2 border-b pb-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`membre-nom-${membre.id}`}>{t("champNom")}</Label>
          <Input
            id={`membre-nom-${membre.id}`}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            onBlur={() => enregistrer()}
            className="w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`membre-role-${membre.id}`}>{t("champRole")}</Label>
          <Select
            value={role}
            onValueChange={(valeur) => {
              const nouveauRole = valeur as RoleMembreGroupement;
              setRole(nouveauRole);
              void enregistrer(nouveauRole);
            }}
          >
            <SelectTrigger id={`membre-role-${membre.id}`} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES_MEMBRE_GROUPEMENT.map((valeur) => (
                <SelectItem key={valeur} value={valeur}>
                  {t(`role.${valeur}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`membre-pourcentage-${membre.id}`}>{t("champPourcentage")}</Label>
          <Input
            id={`membre-pourcentage-${membre.id}`}
            type="number"
            value={pourcentage}
            onChange={(e) => setPourcentage(e.target.value)}
            onBlur={() => enregistrer()}
            className="w-24"
          />
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => deplacer("haut")}
            disabled={estPremiere}
          >
            {t("fleche.haut")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => deplacer("bas")}
            disabled={estDerniere}
          >
            {t("fleche.bas")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={supprimer}>
            {t("supprimer")}
          </Button>
        </div>
      </div>

      {role === "co_traitant" && (
        <LignePieces
          appelOffresId={appelOffresId}
          membreId={membre.id}
          piecesInitiales={piecesInitiales}
        />
      )}
    </li>
  );
}

export function GroupementCard({
  appelOffresId,
  membresInitiaux,
  piecesParMembreInitial,
  nomEntreprise,
}: {
  appelOffresId: string;
  membresInitiaux: MembreGroupement[];
  piecesParMembreInitial: Record<string, ClePieceGroupement[]>;
  nomEntreprise: string | null;
}) {
  const t = useTranslations("AppelsOffres.detail.groupement");
  const [membres, setMembres] = useState(membresInitiaux);
  const [piecesParMembre, setPiecesParMembre] = useState(piecesParMembreInitial);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [nouveauMembre, setNouveauMembre] = useState(() => ({
    nom: nomEntreprise ?? "",
    role: "mandataire" as RoleMembreGroupement,
    pourcentage: "",
  }));

  const somme = calculerSommePourcentages(membres);

  async function ajouterMembre() {
    if (nouveauMembre.nom.trim().length === 0) {
      toast.error(t("champsRequis"));
      return;
    }

    setAjoutEnCours(true);
    const resultat = await creerMembreGroupement(appelOffresId, {
      nom: nouveauMembre.nom,
      role: nouveauMembre.role,
      pourcentage: nouveauMembre.pourcentage.trim().length > 0 ? nouveauMembre.pourcentage : null,
    });
    setAjoutEnCours(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setMembres((liste) => [...liste, resultat.membre]);
    setPiecesParMembre((carte) => ({ ...carte, [resultat.membre.id]: [] }));
    setNouveauMembre({ nom: "", role: "mandataire", pourcentage: "" });
    toast.success(t("toastMembreAjoute"));
  }

  const membresTries = membres.slice().sort((a, b) => a.ordre - b.ordre);

  return (
    <div className="flex flex-col gap-3 border rounded-lg p-4">
      <h2 className="text-lg font-semibold">{t("titre")}</h2>

      {membresTries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("aucunMembre")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {membresTries.map((membre, index) => (
            <LigneMembre
              key={membre.id}
              appelOffresId={appelOffresId}
              membre={membre}
              piecesInitiales={piecesParMembre[membre.id] ?? []}
              estPremiere={index === 0}
              estDerniere={index === membresTries.length - 1}
              onMembresModifies={(updater) => setMembres(updater)}
            />
          ))}
        </ul>
      )}

      {somme !== null && somme !== 100 && (
        <p className="text-sm text-[hsl(var(--checklist-attention))]">
          {t("avertissementSomme", { total: somme })}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouveau-membre-nom">{t("champNom")}</Label>
          <Input
            id="nouveau-membre-nom"
            value={nouveauMembre.nom}
            onChange={(e) => setNouveauMembre((v) => ({ ...v, nom: e.target.value }))}
            className="w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouveau-membre-role">{t("champRole")}</Label>
          <Select
            value={nouveauMembre.role}
            onValueChange={(valeur) =>
              setNouveauMembre((v) => ({ ...v, role: valeur as RoleMembreGroupement }))
            }
          >
            <SelectTrigger id="nouveau-membre-role" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES_MEMBRE_GROUPEMENT.map((valeur) => (
                <SelectItem key={valeur} value={valeur}>
                  {t(`role.${valeur}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouveau-membre-pourcentage">{t("champPourcentage")}</Label>
          <Input
            id="nouveau-membre-pourcentage"
            type="number"
            value={nouveauMembre.pourcentage}
            onChange={(e) => setNouveauMembre((v) => ({ ...v, pourcentage: e.target.value }))}
            className="w-24"
          />
        </div>
        <Button type="button" variant="outline" onClick={ajouterMembre} disabled={ajoutEnCours}>
          {ajoutEnCours ? t("ajoutEnCours") : t("boutonAjouter")}
        </Button>
      </div>
    </div>
  );
}
```

Note sur le `<Select>` de rôle par ligne existante : contrairement au
formulaire d'ajout (qui n'enregistre rien avant le clic sur
« Ajouter »), changer le rôle d'une ligne existante doit être persisté
immédiatement — `onValueChange` appelle directement `enregistrer(nouveauRole)`
avec le rôle explicitement passé en paramètre plutôt que de compter sur
`setRole` (état React, mise à jour asynchrone) pour que la valeur soit
déjà à jour au moment de l'appel.

- [ ] **Step 5: Modifier `appel-offres-detail.tsx`**

L'import de types actuel :

```tsx
import type {
  AppelOffres,
  CleChecklistManuelle,
  EvaluationGoNoGo,
  ExigenceAo,
  JalonRetroplanning,
  LigneBpu,
  SectionBpu,
} from "@/lib/appels-offres/types";
```

devient :

```tsx
import type {
  AppelOffres,
  ClePieceGroupement,
  CleChecklistManuelle,
  EvaluationGoNoGo,
  ExigenceAo,
  JalonRetroplanning,
  LigneBpu,
  MembreGroupement,
  SectionBpu,
} from "@/lib/appels-offres/types";
```

L'import du composant `Bpu` actuel :

```tsx
import { Bpu } from "./bpu";
```

devient :

```tsx
import { Bpu } from "./bpu";
import { GroupementCard } from "./groupement-card";
```

La signature du composant actuelle :

```tsx
  dateLimiteConnue,
  bpu,
  tauxFraisStructureDefaut,
}: {
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  documentsParExigence: Record<string, Document[]>;
  bibliotheque: Document[];
  sections: SectionDossier[];
  documentsParSection: Record<string, Document[]>;
  emailsLies: EmailResume[];
  suggestions: EmailResume[];
  dossierReponseId: string;
  checklistAutomatique: ItemChecklistAutomatique[];
  checklistManuelle: CleChecklistManuelle[];
  evaluationGoNoGo: EvaluationGoNoGo;
  jalons: JalonRetroplanning[];
  dateLimiteConnue: boolean;
  bpu: { sections: SectionBpu[]; lignesParSection: Record<string, LigneBpu[]> };
  tauxFraisStructureDefaut: number | null;
}) {
```

devient :

```tsx
  dateLimiteConnue,
  bpu,
  tauxFraisStructureDefaut,
  groupement,
  nomEntreprise,
}: {
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  documentsParExigence: Record<string, Document[]>;
  bibliotheque: Document[];
  sections: SectionDossier[];
  documentsParSection: Record<string, Document[]>;
  emailsLies: EmailResume[];
  suggestions: EmailResume[];
  dossierReponseId: string;
  checklistAutomatique: ItemChecklistAutomatique[];
  checklistManuelle: CleChecklistManuelle[];
  evaluationGoNoGo: EvaluationGoNoGo;
  jalons: JalonRetroplanning[];
  dateLimiteConnue: boolean;
  bpu: { sections: SectionBpu[]; lignesParSection: Record<string, LigneBpu[]> };
  tauxFraisStructureDefaut: number | null;
  groupement: { membres: MembreGroupement[]; piecesParMembre: Record<string, ClePieceGroupement[]> };
  nomEntreprise: string | null;
}) {
```

Le rendu actuel :

```tsx
          <GoNoGo appelOffresId={appelOffres.id} evaluation={evaluationGoNoGo} />

          <Retroplanning
```

devient :

```tsx
          <GoNoGo appelOffresId={appelOffres.id} evaluation={evaluationGoNoGo} />

          <GroupementCard
            appelOffresId={appelOffres.id}
            membresInitiaux={groupement.membres}
            piecesParMembreInitial={groupement.piecesParMembre}
            nomEntreprise={nomEntreprise}
          />

          <Retroplanning
```

- [ ] **Step 6: Modifier `page.tsx`**

L'import actuel :

```tsx
import { obtenirUtilisateurCourant, obtenirTauxFraisStructureDefaut } from "@/lib/utilisateur/queries";
import {
  obtenirAppelOffres,
  listerChecklistManuelle,
  obtenirEvaluationGoNoGo,
  listerJalonsRetroplanning,
  listerBpu,
} from "@/lib/appels-offres/queries";
```

devient :

```tsx
import {
  obtenirUtilisateurCourant,
  obtenirTauxFraisStructureDefaut,
  obtenirNomEntreprise,
} from "@/lib/utilisateur/queries";
import {
  obtenirAppelOffres,
  listerChecklistManuelle,
  obtenirEvaluationGoNoGo,
  listerJalonsRetroplanning,
  listerBpu,
  listerGroupement,
} from "@/lib/appels-offres/queries";
```

Le chargement des données actuel :

```tsx
  const [
    bibliotheque,
    emailsLies,
    suggestions,
    checklistManuelle,
    evaluationGoNoGo,
    jalons,
    bpu,
    tauxFraisStructureDefaut,
  ] = await Promise.all([
    listerDocuments(utilisateur.entreprise_id),
    listerEmailsLies(id),
    obtenirSuggestionsEmail(utilisateur.id, {
      titre: resultat.appelOffres.titre,
      acheteur: resultat.appelOffres.acheteur,
      date_limite: resultat.appelOffres.date_limite,
    }),
    listerChecklistManuelle(resultat.dossierReponse.id),
    obtenirEvaluationGoNoGo(id),
    listerJalonsRetroplanning(id),
    listerBpu(id),
    obtenirTauxFraisStructureDefaut(utilisateur.entreprise_id),
  ]);
```

devient :

```tsx
  const [
    bibliotheque,
    emailsLies,
    suggestions,
    checklistManuelle,
    evaluationGoNoGo,
    jalons,
    bpu,
    tauxFraisStructureDefaut,
    groupement,
    nomEntreprise,
  ] = await Promise.all([
    listerDocuments(utilisateur.entreprise_id),
    listerEmailsLies(id),
    obtenirSuggestionsEmail(utilisateur.id, {
      titre: resultat.appelOffres.titre,
      acheteur: resultat.appelOffres.acheteur,
      date_limite: resultat.appelOffres.date_limite,
    }),
    listerChecklistManuelle(resultat.dossierReponse.id),
    obtenirEvaluationGoNoGo(id),
    listerJalonsRetroplanning(id),
    listerBpu(id),
    obtenirTauxFraisStructureDefaut(utilisateur.entreprise_id),
    listerGroupement(id),
    obtenirNomEntreprise(utilisateur.entreprise_id),
  ]);
```

Le rendu de `<AppelOffresDetail>` actuel :

```tsx
        dateLimiteConnue={resultat.appelOffres.date_limite !== null}
        bpu={bpu}
        tauxFraisStructureDefaut={tauxFraisStructureDefaut}
      />
```

devient :

```tsx
        dateLimiteConnue={resultat.appelOffres.date_limite !== null}
        bpu={bpu}
        tauxFraisStructureDefaut={tauxFraisStructureDefaut}
        groupement={groupement}
        nomEntreprise={nomEntreprise}
      />
```

- [ ] **Step 7: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 8: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`
Expected: tous les tests passent, aucune régression. Aucun nouveau test
dans cette tâche.

- [ ] **Step 9: Vérifier le build de production**

Run: `npx next build`
Expected: build réussi, aucune erreur.

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/appels-offres/[id]/groupement-card.tsx" "app/(app)/appels-offres/[id]/appel-offres-detail.tsx" "app/(app)/appels-offres/[id]/page.tsx" messages/fr.json messages/en.json
git commit -m "feat: carte Groupement (membres, répartition, pièces des co-traitants)"
```

---

## Self-Review Notes

- **Couverture du spec** : modèle de données + types (Task 1), calcul pur
  en TDD (Task 2), validation + Server Actions + `obtenirNomEntreprise`
  (Task 3), requête `listerGroupement` (Task 4), interface carte
  Groupement (Task 5) — chaque section du spec
  `2026-09-17-groupement-co-traitance-design.md` a une tâche
  correspondante.
- **Convention UI locale respectée** : la spec mentionnait une `<Card>`
  shadcn/ui, mais la lecture du code existant (`go-no-go.tsx`,
  `checklist-soumission.tsx`) montre que les sections de l'onglet Vue
  d'ensemble utilisent un simple `<div className="border rounded-lg p-4">`
  avec leur propre `<h2>` — `<Card>` n'est utilisé que dans
  `/parametres`. La Task 5 suit la convention réellement observée dans
  le fichier modifié, pas la description informelle de la spec (« follow
  existing patterns »).
- **Cohérence des types** : `MembreGroupement`/`ClePieceGroupement`/
  `RoleMembreGroupement` définis une seule fois (Task 1), réutilisés sans
  redéfinition dans toutes les tâches suivantes. Signature des Server
  Actions identique entre leur définition (Task 3) et leur site d'appel
  dans `groupement-card.tsx` (Task 5), vérifiée champ par champ.
- **`basculerPieceMembreGroupement` calqué sur `basculerChecklistManuelle`**
  (lu directement dans `lib/appels-offres/actions.ts` avant d'écrire ce
  plan, pas supposé) — même mécanique lecture/delete-ou-insert, sans
  `coche_par` (pas de notion d'auteur pertinente sur une pièce d'un
  co-traitant externe).
- **Pattern optimistic update + revert** pour la checklist de pièces
  (`LignePieces` dans `groupement-card.tsx`) : calqué sur
  `ChecklistSoumission` (`basculer` applique l'état inverse à l'état
  courant en cas d'échec, pas un instantané figé — voir mémoire
  `noubinao_functional_state_updates`).
- **RLS vérifiée par lecture réelle** des migrations existantes
  (`section_bpu`/`checklist_item_dossier`) avant d'écrire ce plan, pas
  supposée — `membre_groupement` reprend exactement le patron CRUD de
  `section_bpu` (select/insert/update/delete avec `with check` répété
  explicitement sur l'update), `piece_membre_groupement` reprend celui de
  `checklist_item_dossier` (select/insert/delete, pas d'update).
- **`entreprise.nom` vérifié dans la migration d'origine**
  (`20260822124743_bibliotheque_documentaire.sql`) avant d'écrire
  `obtenirNomEntreprise` — colonne `not null`, existe depuis la première
  migration du projet.
- **Aucun placeholder** : chaque étape contient le code exact à écrire ou
  le texte exact à remplacer, y compris les 5 tests complets de la
  Task 2.
- **Vérification manuelle en conditions réelles**, à faire une fois les 5
  tâches exécutées et la migration appliquée par le contrôleur : ajouter
  un membre mandataire (pré-rempli avec le nom de l'entreprise sur la
  première ligne), ajouter un co-traitant et cocher/décocher ses pièces,
  vérifier que la checklist disparaît en repassant un membre en
  mandataire, vérifier l'avertissement de somme des % avec plusieurs
  répartitions, réordonner et supprimer des membres.
