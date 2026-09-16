# BPU détaillé (bordereau des prix unitaires) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un bordereau des prix unitaires (BPU) par appel d'offres (AO) — sections/lots avec leurs lignes chiffrées (désignation, unité, quantité, prix unitaire, montant), totaux par section et général — dans un nouvel onglet « BPU » sur la page détail AO.

**Architecture:** Deux tables (`section_bpu`, `ligne_bpu`, CRUD complet, RLS équipe) stockent le bordereau. Des fonctions pures calculent montant de ligne, total (section ou général) et nombre de lignes non chiffrées. La page détail AO passe à 2 onglets (« Vue d'ensemble » = tout l'existant inchangé, « BPU » = nouveau) pour ne pas allonger indéfiniment une page déjà longue. Jamais bloquant : le BPU est utilisable dès l'ouverture de la page, indépendamment du traitement du DAO.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase Postgres/RLS, Zod, next-intl, Vitest, shadcn/ui (`Tabs`, `Table`, `Input`, `Button`).

## Global Constraints

- Jamais bloquant : le BPU est disponible dès l'ouverture de la page, sans dépendre de `statut_traitement === "termine"`.
- Saisie manuelle uniquement — pas d'extraction automatique du BPU depuis le DAO dans ce sous-projet.
- La policy RLS `update` sur `section_bpu` et `ligne_bpu` a un `with check` explicite limité à l'appartenance entreprise (PAS de contrainte sur `created_by`) — n'importe quel membre de l'équipe doit pouvoir modifier une section/ligne créée par un collègue.
- La policy RLS `insert` sur les deux tables a un `with check` qui exige `created_by = auth.uid()`.
- **La migration SQL ne doit PAS être appliquée à la base Supabase distante par l'implémenteur** (`supabase db push` interdit) — elle sera relue et appliquée séparément par le contrôleur, **avant** le merge sur `main` (leçon des sous-projets précédents : une requête ajoutée sans condition sur une page en production doit avoir sa migration appliquée avant le merge, pas après).
- `prix_unitaire` est nullable (ligne pas encore chiffrée) — `0` est un prix valide et ne doit **jamais** être traité comme « non chiffré » (tester `=== null`, jamais la véracité JS).
- 2 onglets seulement sur la page détail AO (« Vue d'ensemble » regroupant tout l'existant tel quel, « BPU » nouveau) — pas de refonte en un onglet par section.
- Réordonnancement de section/ligne uniquement par boutons monter/descendre — pas de glisser-déposer.
- Aucun `disabled` sur les `Input` d'une ligne pendant sa propre sauvegarde (`onBlur`) — seuls les boutons ponctuels d'ajout (section, ligne) sont désactivés le temps de leur propre requête (leçon des pièges de focus clavier Radix déjà rencontrés dans ce projet).
- Tout revert d'état optimiste après échec d'une Server Action doit être fonctionnel (opération inverse ou réinsertion précise), jamais un instantané global figé.
- Toute écriture d'état déclenchée après une Server Action de ligne (`onLignesModifiees`) prend un **updater fonctionnel** (`(lignesCourantes) => LigneBpu[]`), jamais un tableau déjà calculé — dérive toujours de l'état courant, pas d'une valeur capturée plus tôt.
- Après un déplacement (section ou ligne) réussi : `window.location.reload()`, pas de mise à jour optimiste de l'ordre (le nouvel ordre exact résulte d'une permutation calculée côté serveur, non déductible côté client sans le relire).
- Montants affichés via `toLocaleString("fr-FR")`, pas `useLocale()` — cohérent avec `montant_caution` déjà affiché ainsi dans `pipeline-table.tsx`.

---

### Task 1: Modèle de données — migration + types

**Files:**
- Create: `supabase/migrations/20260916120000_bpu.sql`
- Modify: `lib/appels-offres/types.ts`

**Interfaces:**
- Produces: `interface SectionBpu { id, appel_offres_id, titre, ordre, created_by, created_at }`, `interface LigneBpu { id, section_bpu_id, code_article, designation, unite, quantite, prix_unitaire, ordre, created_by, created_at }` — consommés par les Tasks 2, 3, 4, 5.

- [ ] **Step 1: Écrire la migration**

Créer `supabase/migrations/20260916120000_bpu.sql` :

```sql
-- BPU détaillé (Module 7, sous-projet 4a). Bordereau des prix unitaires
-- organisé en sections (lots), chacune avec ses lignes chiffrées. CRUD
-- complet comme jalon_retroplanning (contrairement à evaluation_go_no_go,
-- 1:1, et à checklist_item_dossier, insert/delete seul) : ajout,
-- modification, réordonnancement et suppression de sections et de lignes.
create table section_bpu (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  titre text not null,
  ordre integer not null default 0,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index section_bpu_appel_offres_id_idx on section_bpu(appel_offres_id);

create table ligne_bpu (
  id uuid primary key default gen_random_uuid(),
  section_bpu_id uuid not null references section_bpu(id) on delete cascade,
  code_article text,
  designation text not null,
  unite text not null,
  quantite numeric not null,
  -- Nullable : une ligne peut être structurée avant d'être chiffrée (le
  -- bordereau peut provenir du DAO avec désignation/unité/quantité déjà
  -- fixées, prix à déterminer ensuite).
  prix_unitaire numeric,
  ordre integer not null default 0,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index ligne_bpu_section_bpu_id_idx on ligne_bpu(section_bpu_id);

alter table section_bpu enable row level security;
alter table ligne_bpu enable row level security;

create policy "section_bpu_select_membres" on section_bpu
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = section_bpu.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "section_bpu_insert_membres" on section_bpu
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = section_bpu.appel_offres_id and u.id = auth.uid()
    )
  );

-- WITH CHECK volontairement limité à l'appartenance entreprise, comme
-- jalon_retroplanning_update_membres : n'importe quel membre doit pouvoir
-- renommer/réordonner une section créée par un collègue.
create policy "section_bpu_update_membres" on section_bpu
  for update
  using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = section_bpu.appel_offres_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = section_bpu.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "section_bpu_delete_membres" on section_bpu
  for delete using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = section_bpu.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "ligne_bpu_select_membres" on ligne_bpu
  for select using (
    exists (
      select 1 from section_bpu sb
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sb.id = ligne_bpu.section_bpu_id and u.id = auth.uid()
    )
  );

create policy "ligne_bpu_insert_membres" on ligne_bpu
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from section_bpu sb
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sb.id = ligne_bpu.section_bpu_id and u.id = auth.uid()
    )
  );

-- WITH CHECK volontairement limité à l'appartenance entreprise, même
-- raisonnement que section_bpu_update_membres : n'importe quel membre
-- doit pouvoir corriger le prix saisi par un collègue.
create policy "ligne_bpu_update_membres" on ligne_bpu
  for update
  using (
    exists (
      select 1 from section_bpu sb
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sb.id = ligne_bpu.section_bpu_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from section_bpu sb
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sb.id = ligne_bpu.section_bpu_id and u.id = auth.uid()
    )
  );

create policy "ligne_bpu_delete_membres" on ligne_bpu
  for delete using (
    exists (
      select 1 from section_bpu sb
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sb.id = ligne_bpu.section_bpu_id and u.id = auth.uid()
    )
  );
```

- [ ] **Step 2: Ajouter les types**

À la fin de `lib/appels-offres/types.ts`, ajouter :

```ts
export interface SectionBpu {
  id: string;
  appel_offres_id: string;
  titre: string;
  ordre: number;
  created_by: string | null;
  created_at: string;
}

export interface LigneBpu {
  id: string;
  section_bpu_id: string;
  code_article: string | null;
  designation: string;
  unite: string;
  quantite: number;
  prix_unitaire: number | null;
  ordre: number;
  created_by: string | null;
  created_at: string;
}
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: NE PAS exécuter `supabase db push`**

La migration reste locale pour l'instant — elle sera appliquée par le
contrôleur une fois la branche entière revue, avant le merge. N'exécute
aucune commande touchant la base Supabase distante dans cette tâche.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260916120000_bpu.sql lib/appels-offres/types.ts
git commit -m "feat: tables section_bpu + ligne_bpu, types SectionBpu/LigneBpu"
```

---

### Task 2: Calculs purs (`lib/appels-offres/bpu.ts`, TDD)

**Files:**
- Create: `lib/appels-offres/bpu.ts`
- Create: `lib/appels-offres/bpu.test.ts`

**Interfaces:**
- Consumes: `LigneBpu` depuis `./types` (Task 1) — seulement les champs `quantite`/`prix_unitaire` via `Pick`.
- Produces: `calculerMontantLigne(ligne: Pick<LigneBpu, "quantite" | "prix_unitaire">): number | null`, `sommerMontants(lignes: Pick<LigneBpu, "quantite" | "prix_unitaire">[]): number`, `compterLignesNonChiffrees(lignes: Pick<LigneBpu, "quantite" | "prix_unitaire">[]): number` — consommés par la Task 5 (composants UI).

- [ ] **Step 1: Écrire les tests (ils doivent tous échouer, le fichier `bpu.ts` n'existe pas encore)**

Créer `lib/appels-offres/bpu.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { calculerMontantLigne, compterLignesNonChiffrees, sommerMontants } from "./bpu";

describe("calculerMontantLigne", () => {
  it("multiplie quantité et prix unitaire", () => {
    expect(calculerMontantLigne({ quantite: 12, prix_unitaire: 5000 })).toBe(60000);
  });

  it("retourne null quand le prix unitaire est null", () => {
    expect(calculerMontantLigne({ quantite: 12, prix_unitaire: null })).toBeNull();
  });

  it("retourne 0 (pas null) quand le prix unitaire vaut 0", () => {
    expect(calculerMontantLigne({ quantite: 12, prix_unitaire: 0 })).toBe(0);
  });
});

describe("sommerMontants", () => {
  it("additionne les montants de plusieurs lignes chiffrées", () => {
    const lignes = [
      { quantite: 2, prix_unitaire: 1000 },
      { quantite: 3, prix_unitaire: 2000 },
    ];
    expect(sommerMontants(lignes)).toBe(8000);
  });

  it("ignore les lignes non chiffrées dans la somme", () => {
    const lignes = [
      { quantite: 2, prix_unitaire: 1000 },
      { quantite: 5, prix_unitaire: null },
    ];
    expect(sommerMontants(lignes)).toBe(2000);
  });

  it("retourne 0 sur un tableau vide", () => {
    expect(sommerMontants([])).toBe(0);
  });
});

describe("compterLignesNonChiffrees", () => {
  it("compte les lignes à prix_unitaire null", () => {
    const lignes = [
      { quantite: 1, prix_unitaire: null },
      { quantite: 2, prix_unitaire: 500 },
      { quantite: 3, prix_unitaire: null },
    ];
    expect(compterLignesNonChiffrees(lignes)).toBe(2);
  });

  it("retourne 0 sur un tableau vide", () => {
    expect(compterLignesNonChiffrees([])).toBe(0);
  });

  it("ne compte pas une ligne à prix_unitaire 0 comme non chiffrée", () => {
    expect(compterLignesNonChiffrees([{ quantite: 1, prix_unitaire: 0 }])).toBe(0);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/appels-offres/bpu.test.ts`
Expected: FAIL — `Cannot find module './bpu'` (le fichier n'existe pas encore).

- [ ] **Step 3: Écrire l'implémentation**

Créer `lib/appels-offres/bpu.ts` :

```ts
import type { LigneBpu } from "./types";

type LigneAvecMontant = Pick<LigneBpu, "quantite" | "prix_unitaire">;

export function calculerMontantLigne(ligne: LigneAvecMontant): number | null {
  if (ligne.prix_unitaire === null) return null;
  return ligne.quantite * ligne.prix_unitaire;
}

export function sommerMontants(lignes: LigneAvecMontant[]): number {
  return lignes.reduce((total, ligne) => {
    const montant = calculerMontantLigne(ligne);
    return montant === null ? total : total + montant;
  }, 0);
}

export function compterLignesNonChiffrees(lignes: LigneAvecMontant[]): number {
  return lignes.filter((ligne) => ligne.prix_unitaire === null).length;
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run lib/appels-offres/bpu.test.ts`
Expected: PASS, 8/8 tests verts.

- [ ] **Step 5: Vérifier que le projet compile toujours**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/bpu.ts lib/appels-offres/bpu.test.ts
git commit -m "feat: calculerMontantLigne + sommerMontants + compterLignesNonChiffrees (TDD)"
```

---

### Task 3: Lecture + Server Actions sections

**Files:**
- Modify: `lib/appels-offres/queries.ts`
- Modify: `lib/appels-offres/schema.ts`
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: `SectionBpu`, `LigneBpu` depuis `./types` (Task 1).
- Produces: `listerBpu(appelOffresId: string): Promise<{ sections: SectionBpu[]; lignesParSection: Record<string, LigneBpu[]> }>`, `creerSectionBpuSchema` (Zod), `creerSectionBpu(appelOffresId: string, titre: string): Promise<{ erreur: string } | { succes: true; section: SectionBpu }>`, `renommerSectionBpu(appelOffresId: string, sectionId: string, titre: string): Promise<{ erreur: string } | { succes: true }>`, `deplacerSectionBpu(appelOffresId: string, sectionId: string, sens: "haut" | "bas"): Promise<{ erreur: string } | { succes: true }>`, `supprimerSectionBpu(appelOffresId: string, sectionId: string): Promise<{ erreur: string } | { succes: true }>` — consommés par la Task 5 (`page.tsx` et les composants UI).

- [ ] **Step 1: Ajouter `listerBpu` à `lib/appels-offres/queries.ts`**

L'import de types actuel :

```ts
import type {
  AppelOffres,
  CleChecklistManuelle,
  DossierReponse,
  EvaluationGoNoGo,
  ExigenceAo,
  JalonRetroplanning,
  SectionDossier,
} from "./types";
```

devient :

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

Puis ajouter à la fin du fichier :

```ts
export async function listerBpu(appelOffresId: string): Promise<{
  sections: SectionBpu[];
  lignesParSection: Record<string, LigneBpu[]>;
}> {
  const supabase = await createClient();

  const { data: sections, error: erreurSections } = await supabase
    .from("section_bpu")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: true });

  if (erreurSections) throw erreurSections;

  const sectionsTypees = (sections ?? []) as SectionBpu[];
  const lignesParSection: Record<string, LigneBpu[]> = {};

  for (const section of sectionsTypees) {
    lignesParSection[section.id] = [];
  }

  if (sectionsTypees.length > 0) {
    const { data: lignes, error: erreurLignes } = await supabase
      .from("ligne_bpu")
      .select("*")
      .in(
        "section_bpu_id",
        sectionsTypees.map((s) => s.id),
      )
      .order("ordre", { ascending: true });

    if (erreurLignes) throw erreurLignes;

    for (const ligne of (lignes ?? []) as LigneBpu[]) {
      lignesParSection[ligne.section_bpu_id].push(ligne);
    }
  }

  return { sections: sectionsTypees, lignesParSection };
}
```

- [ ] **Step 2: Ajouter `creerSectionBpuSchema` à `lib/appels-offres/schema.ts`**

Ajouter à la fin du fichier :

```ts
export const creerSectionBpuSchema = z.object({
  titre: z
    .string()
    .trim()
    .min(1, "Le titre est requis")
    .max(200, "Titre trop long (200 caractères maximum)"),
});
```

- [ ] **Step 3: Ajouter les 4 Server Actions de section à `lib/appels-offres/actions.ts`**

L'import du schéma actuel :

```ts
import {
  televerserDaoSchema,
  modifierAppelOffresSchema,
  modifierStatutPipelineSchema,
  mettreAJourEvaluationGoNoGoSchema,
  creerJalonSchema,
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
} from "./schema";
```

L'import de types actuel :

```ts
import type {
  AppelOffres,
  CleChecklistManuelle,
  CritereGoNoGo,
  JalonRetroplanning,
  StatutPipelineAo,
  StatutSectionDossier,
} from "./types";
```

devient :

```ts
import type {
  AppelOffres,
  CleChecklistManuelle,
  CritereGoNoGo,
  JalonRetroplanning,
  SectionBpu,
  StatutPipelineAo,
  StatutSectionDossier,
} from "./types";
```

Puis ajouter à la fin du fichier :

```ts
export async function creerSectionBpu(
  appelOffresId: string,
  titre: string,
): Promise<{ erreur: string } | { succes: true; section: SectionBpu }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = creerSectionBpuSchema.safeParse({ titre });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Titre invalide" };
  }

  const supabase = await createClient();

  const { data: derniereSection } = await supabase
    .from("section_bpu")
    .select("ordre")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prochainOrdre = derniereSection ? derniereSection.ordre + 1 : 0;

  const { data, error } = await supabase
    .from("section_bpu")
    .insert({
      appel_offres_id: appelOffresId,
      titre: parsed.data.titre,
      ordre: prochainOrdre,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de la création de la section. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, section: data as SectionBpu };
}

export async function renommerSectionBpu(
  appelOffresId: string,
  sectionId: string,
  titre: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = creerSectionBpuSchema.safeParse({ titre });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Titre invalide" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("section_bpu")
    .update({ titre: parsed.data.titre })
    .eq("id", sectionId)
    .select("id");

  if (error) return { erreur: "Échec du renommage. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Section introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

// Permutation de l'ordre avec la section voisine (précédente si
// sens === "haut", suivante si "bas"). Deux UPDATE séquentiels, pas une
// transaction atomique — limitation mineure acceptée (voir spec, section
// États et erreurs).
export async function deplacerSectionBpu(
  appelOffresId: string,
  sectionId: string,
  sens: "haut" | "bas",
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: sections, error: erreurLecture } = await supabase
    .from("section_bpu")
    .select("id, ordre")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: true });

  if (erreurLecture || !sections) return { erreur: "Échec du déplacement. Réessayez." };

  const index = sections.findIndex((s) => s.id === sectionId);
  if (index === -1) return { erreur: "Section introuvable." };

  const indexVoisin = sens === "haut" ? index - 1 : index + 1;
  if (indexVoisin < 0 || indexVoisin >= sections.length) {
    return { succes: true as const };
  }

  const section = sections[index];
  const voisine = sections[indexVoisin];

  const { error: erreurA } = await supabase
    .from("section_bpu")
    .update({ ordre: voisine.ordre })
    .eq("id", section.id);

  const { error: erreurB } = await supabase
    .from("section_bpu")
    .update({ ordre: section.ordre })
    .eq("id", voisine.id);

  if (erreurA || erreurB) return { erreur: "Échec du déplacement. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function supprimerSectionBpu(
  appelOffresId: string,
  sectionId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("section_bpu")
    .delete()
    .eq("id", sectionId)
    .select("id");

  if (error) return { erreur: "Échec de la suppression. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Section introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}
```

- [ ] **Step 4: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 5: Vérifier que les tests passent toujours**

Run: `npx vitest run`
Expected: tous les tests verts (les 8 tests de la Task 2 + tous les tests existants, aucune régression). Aucun nouveau test dans cette tâche — pas de test sur les fonctions Supabase, cohérent avec le reste du projet.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/queries.ts lib/appels-offres/schema.ts lib/appels-offres/actions.ts
git commit -m "feat: listerBpu + Server Actions de section (créer/renommer/déplacer/supprimer)"
```

---

### Task 4: Server Actions lignes

**Files:**
- Modify: `lib/appels-offres/schema.ts`
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: `LigneBpu` depuis `./types` (Task 1).
- Produces: `ligneBpuSchema` (Zod, réutilisé pour création ET modification), `creerLigneBpu(appelOffresId: string, sectionId: string, input: { codeArticle: string | null; designation: string; unite: string; quantite: string; prixUnitaire: string | null }): Promise<{ erreur: string } | { succes: true; ligne: LigneBpu }>`, `modifierLigneBpu(appelOffresId: string, ligneId: string, input: même forme): Promise<{ erreur: string } | { succes: true }>`, `deplacerLigneBpu(appelOffresId: string, sectionId: string, ligneId: string, sens: "haut" | "bas"): Promise<{ erreur: string } | { succes: true }>`, `supprimerLigneBpu(appelOffresId: string, ligneId: string): Promise<{ erreur: string } | { succes: true }>` — consommés par la Task 5 (composants UI).

- [ ] **Step 1: Ajouter `ligneBpuSchema` à `lib/appels-offres/schema.ts`**

Ajouter à la fin du fichier (après `creerSectionBpuSchema` ajouté en
Task 3) :

```ts
// Réutilisé pour la création ET la modification d'une ligne (même forme
// de saisie dans les deux cas — voir Server Actions).
export const ligneBpuSchema = z.object({
  codeArticle: z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || v.length <= 50, {
      message: "Code article trop long (50 caractères maximum)",
    }),
  designation: z
    .string()
    .trim()
    .min(1, "La désignation est requise")
    .max(500, "Désignation trop longue (500 caractères maximum)"),
  unite: z
    .string()
    .trim()
    .min(1, "L'unité est requise")
    .max(20, "Unité trop longue (20 caractères maximum)"),
  // Même garde-fou que montantCaution (modifierAppelOffresSchema) contre
  // les négatifs et la notation scientifique : vérifier le format de la
  // chaîne source avant conversion, pas seulement Number.isFinite après.
  quantite: z
    .string()
    .refine((v) => /^\d+(\.\d+)?$/.test(v.trim()), { message: "Quantité invalide" })
    .transform((v) => Number(v.trim()))
    .refine((v) => Number.isFinite(v) && v > 0, {
      message: "La quantité doit être positive",
    }),
  prixUnitaire: z
    .string()
    .nullable()
    .refine((v) => v === null || v.trim().length === 0 || /^\d+(\.\d+)?$/.test(v.trim()), {
      message: "Prix unitaire invalide",
    })
    .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null))
    .refine((v) => v === null || Number.isFinite(v), {
      message: "Prix unitaire invalide",
    }),
});

export type LigneBpuInput = z.infer<typeof ligneBpuSchema>;
```

- [ ] **Step 2: Ajouter les 4 Server Actions de ligne à `lib/appels-offres/actions.ts`**

L'import du schéma actuel (après le Step 3 de la Task 3, il contient
déjà `creerSectionBpuSchema`) :

```ts
import {
  televerserDaoSchema,
  modifierAppelOffresSchema,
  modifierStatutPipelineSchema,
  mettreAJourEvaluationGoNoGoSchema,
  creerJalonSchema,
  creerSectionBpuSchema,
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
} from "./schema";
```

L'import de types actuel (après le Step 3 de la Task 3, il contient déjà
`SectionBpu`) :

```ts
import type {
  AppelOffres,
  CleChecklistManuelle,
  CritereGoNoGo,
  JalonRetroplanning,
  SectionBpu,
  StatutPipelineAo,
  StatutSectionDossier,
} from "./types";
```

devient :

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

Puis ajouter à la fin du fichier :

```ts
export async function creerLigneBpu(
  appelOffresId: string,
  sectionId: string,
  input: {
    codeArticle: string | null;
    designation: string;
    unite: string;
    quantite: string;
    prixUnitaire: string | null;
  },
): Promise<{ erreur: string } | { succes: true; ligne: LigneBpu }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = ligneBpuSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data: derniereLigne } = await supabase
    .from("ligne_bpu")
    .select("ordre")
    .eq("section_bpu_id", sectionId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prochainOrdre = derniereLigne ? derniereLigne.ordre + 1 : 0;

  const { data, error } = await supabase
    .from("ligne_bpu")
    .insert({
      section_bpu_id: sectionId,
      code_article: parsed.data.codeArticle,
      designation: parsed.data.designation,
      unite: parsed.data.unite,
      quantite: parsed.data.quantite,
      prix_unitaire: parsed.data.prixUnitaire,
      ordre: prochainOrdre,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de l'ajout de la ligne. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, ligne: data as LigneBpu };
}

export async function modifierLigneBpu(
  appelOffresId: string,
  ligneId: string,
  input: {
    codeArticle: string | null;
    designation: string;
    unite: string;
    quantite: string;
    prixUnitaire: string | null;
  },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = ligneBpuSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ligne_bpu")
    .update({
      code_article: parsed.data.codeArticle,
      designation: parsed.data.designation,
      unite: parsed.data.unite,
      quantite: parsed.data.quantite,
      prix_unitaire: parsed.data.prixUnitaire,
    })
    .eq("id", ligneId)
    .select("id");

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Ligne introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

// Même mécanique de permutation que deplacerSectionBpu, scopée à la
// section (les lignes ne se déplacent jamais d'une section à l'autre
// dans ce sous-projet).
export async function deplacerLigneBpu(
  appelOffresId: string,
  sectionId: string,
  ligneId: string,
  sens: "haut" | "bas",
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: lignes, error: erreurLecture } = await supabase
    .from("ligne_bpu")
    .select("id, ordre")
    .eq("section_bpu_id", sectionId)
    .order("ordre", { ascending: true });

  if (erreurLecture || !lignes) return { erreur: "Échec du déplacement. Réessayez." };

  const index = lignes.findIndex((l) => l.id === ligneId);
  if (index === -1) return { erreur: "Ligne introuvable." };

  const indexVoisin = sens === "haut" ? index - 1 : index + 1;
  if (indexVoisin < 0 || indexVoisin >= lignes.length) {
    return { succes: true as const };
  }

  const ligne = lignes[index];
  const voisine = lignes[indexVoisin];

  const { error: erreurA } = await supabase
    .from("ligne_bpu")
    .update({ ordre: voisine.ordre })
    .eq("id", ligne.id);

  const { error: erreurB } = await supabase
    .from("ligne_bpu")
    .update({ ordre: ligne.ordre })
    .eq("id", voisine.id);

  if (erreurA || erreurB) return { erreur: "Échec du déplacement. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function supprimerLigneBpu(
  appelOffresId: string,
  ligneId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ligne_bpu")
    .delete()
    .eq("id", ligneId)
    .select("id");

  if (error) return { erreur: "Échec de la suppression. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Ligne introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Vérifier que les tests passent toujours**

Run: `npx vitest run`
Expected: tous les tests verts, aucune régression. Aucun nouveau test
dans cette tâche.

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/schema.ts lib/appels-offres/actions.ts
git commit -m "feat: Server Actions de ligne BPU (créer/modifier/déplacer/supprimer)"
```

---

### Task 5: Interface — onglets + BPU sur la page détail AO

**Files:**
- Create: `app/(app)/appels-offres/[id]/bpu.tsx`
- Create: `app/(app)/appels-offres/[id]/bpu-section.tsx`
- Create: `app/(app)/appels-offres/[id]/bpu-ligne-row.tsx`
- Modify: `app/(app)/appels-offres/[id]/page.tsx`
- Modify: `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `listerBpu` (Task 3) ; `creerSectionBpu`, `renommerSectionBpu`, `deplacerSectionBpu`, `supprimerSectionBpu` (Task 3) ; `creerLigneBpu`, `modifierLigneBpu`, `deplacerLigneBpu`, `supprimerLigneBpu` (Task 4) ; `calculerMontantLigne`, `sommerMontants`, `compterLignesNonChiffrees` (Task 2) ; `SectionBpu`, `LigneBpu` (Task 1).

- [ ] **Step 1: Ajouter les traductions dans `messages/fr.json`**

Dans le bloc `"AppelsOffres.detail"`, juste après l'ouverture `"detail": {`
et avant `"boutonTelecharger"` :

```json
    "detail": {
      "onglets": {
        "vueEnsemble": "Vue d'ensemble",
        "bpu": "BPU"
      },
      "boutonTelecharger": "Télécharger le DAO",
```

Puis, le bloc `"retroplanning"` actuel se termine, suivi de `"exigences"` :

```json
        "toastGenere": "Rétroplanning généré",
        "toastAjoute": "Jalon ajouté"
      },
      "exigences": {
```

Remplacer par (ajout du bloc `bpu` entre les deux) :

```json
        "toastGenere": "Rétroplanning généré",
        "toastAjoute": "Jalon ajouté"
      },
      "bpu": {
        "titre": "Bordereau des prix unitaires",
        "totalGeneral": "Total général",
        "lignesNonChiffrees": "{count, plural, =0 {Toutes les lignes sont chiffrées} one {# ligne à chiffrer} other {# lignes à chiffrer}}",
        "aucuneSection": "Aucune section pour l'instant.",
        "titreSectionPlaceholder": "Titre de la section (ex. Lot 1 — Terrassement)",
        "champTitreSection": "Titre de la section",
        "boutonAjouterSection": "Ajouter une section",
        "ajoutEnCours": "Ajout...",
        "supprimerSection": "Supprimer la section",
        "toastSectionAjoutee": "Section ajoutée",
        "toastSectionSupprimee": "Section supprimée",
        "colonneCode": "Code",
        "colonneDesignation": "Désignation",
        "colonneUnite": "Unité",
        "colonneQuantite": "Quantité",
        "colonnePrixUnitaire": "Prix unitaire (FCFA)",
        "colonneMontant": "Montant",
        "nonChiffree": "—",
        "totalSection": "Total section",
        "boutonAjouterLigne": "Ajouter une ligne",
        "toastLigneAjoutee": "Ligne ajoutée",
        "toastLigneSupprimee": "Ligne supprimée",
        "supprimer": "Supprimer",
        "deplacerHaut": "Déplacer vers le haut",
        "deplacerBas": "Déplacer vers le bas",
        "fleche": {
          "haut": "↑",
          "bas": "↓"
        }
      },
      "exigences": {
```

- [ ] **Step 2: Ajouter les mêmes traductions dans `messages/en.json`**

Dans le bloc `"AppelsOffres.detail"`, juste après l'ouverture `"detail": {` :

```json
    "detail": {
      "onglets": {
        "vueEnsemble": "Overview",
        "bpu": "BPU"
      },
      "boutonTelecharger": "Download the DAO",
```

Puis, le bloc `"retroplanning"` actuel se termine :

```json
        "toastGenere": "Timeline generated",
        "toastAjoute": "Milestone added"
      },
      "exigences": {
```

Remplacer par :

```json
        "toastGenere": "Timeline generated",
        "toastAjoute": "Milestone added"
      },
      "bpu": {
        "titre": "Bill of quantities",
        "totalGeneral": "Grand total",
        "lignesNonChiffrees": "{count, plural, =0 {All lines are priced} one {# line to price} other {# lines to price}}",
        "aucuneSection": "No sections yet.",
        "titreSectionPlaceholder": "Section title (e.g. Lot 1 — Earthworks)",
        "champTitreSection": "Section title",
        "boutonAjouterSection": "Add section",
        "ajoutEnCours": "Adding...",
        "supprimerSection": "Delete section",
        "toastSectionAjoutee": "Section added",
        "toastSectionSupprimee": "Section deleted",
        "colonneCode": "Code",
        "colonneDesignation": "Description",
        "colonneUnite": "Unit",
        "colonneQuantite": "Quantity",
        "colonnePrixUnitaire": "Unit price (FCFA)",
        "colonneMontant": "Amount",
        "nonChiffree": "—",
        "totalSection": "Section total",
        "boutonAjouterLigne": "Add line",
        "toastLigneAjoutee": "Line added",
        "toastLigneSupprimee": "Line deleted",
        "supprimer": "Delete",
        "deplacerHaut": "Move up",
        "deplacerBas": "Move down",
        "fleche": {
          "haut": "↑",
          "bas": "↓"
        }
      },
      "exigences": {
```

Note : le texte exact déjà présent pour `"boutonTelecharger"` dans
chaque fichier (`"Télécharger le DAO"` / `"Download the DAO"`) doit être
préservé tel quel — seul le bloc `"onglets"` est inséré juste avant.

- [ ] **Step 3: Vérifier que les deux fichiers restent du JSON valide**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('OK')"`
Expected: `OK`.

- [ ] **Step 4: Créer `app/(app)/appels-offres/[id]/bpu-ligne-row.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import {
  modifierLigneBpu,
  deplacerLigneBpu,
  supprimerLigneBpu,
} from "@/lib/appels-offres/actions";
import { calculerMontantLigne } from "@/lib/appels-offres/bpu";
import type { LigneBpu } from "@/lib/appels-offres/types";

export function BpuLigneRow({
  appelOffresId,
  sectionId,
  ligne,
  estPremiere,
  estDerniere,
  onLignesModifiees,
}: {
  appelOffresId: string;
  sectionId: string;
  ligne: LigneBpu;
  estPremiere: boolean;
  estDerniere: boolean;
  onLignesModifiees: (
    sectionId: string,
    updater: (lignesCourantes: LigneBpu[]) => LigneBpu[],
  ) => void;
}) {
  const t = useTranslations("AppelsOffres.detail.bpu");
  const [codeArticle, setCodeArticle] = useState(ligne.code_article ?? "");
  const [designation, setDesignation] = useState(ligne.designation);
  const [unite, setUnite] = useState(ligne.unite);
  const [quantite, setQuantite] = useState(String(ligne.quantite));
  const [prixUnitaire, setPrixUnitaire] = useState(
    ligne.prix_unitaire === null ? "" : String(ligne.prix_unitaire),
  );

  const montant = calculerMontantLigne(ligne);

  function reinitialiser() {
    setCodeArticle(ligne.code_article ?? "");
    setDesignation(ligne.designation);
    setUnite(ligne.unite);
    setQuantite(String(ligne.quantite));
    setPrixUnitaire(ligne.prix_unitaire === null ? "" : String(ligne.prix_unitaire));
  }

  async function enregistrer() {
    const input = {
      codeArticle: codeArticle.trim().length > 0 ? codeArticle : null,
      designation,
      unite,
      quantite,
      prixUnitaire: prixUnitaire.trim().length > 0 ? prixUnitaire : null,
    };

    const resultat = await modifierLigneBpu(appelOffresId, ligne.id, input);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      reinitialiser();
      return;
    }

    onLignesModifiees(sectionId, (lignesCourantes) =>
      lignesCourantes.map((l) =>
        l.id === ligne.id
          ? {
              ...l,
              code_article: input.codeArticle,
              designation: input.designation,
              unite: input.unite,
              quantite: Number(input.quantite),
              prix_unitaire: input.prixUnitaire === null ? null : Number(input.prixUnitaire),
            }
          : l,
      ),
    );
  }

  async function deplacer(sens: "haut" | "bas") {
    const resultat = await deplacerLigneBpu(appelOffresId, sectionId, ligne.id, sens);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.location.reload();
  }

  async function supprimer() {
    const resultat = await supprimerLigneBpu(appelOffresId, ligne.id);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onLignesModifiees(sectionId, (lignesCourantes) =>
      lignesCourantes.filter((l) => l.id !== ligne.id),
    );
    toast.success(t("toastLigneSupprimee"));
  }

  return (
    <TableRow>
      <TableCell>
        <Input
          value={codeArticle}
          onChange={(e) => setCodeArticle(e.target.value)}
          onBlur={enregistrer}
          aria-label={t("colonneCode")}
          className="w-20"
        />
      </TableCell>
      <TableCell>
        <Input
          value={designation}
          onChange={(e) => setDesignation(e.target.value)}
          onBlur={enregistrer}
          aria-label={t("colonneDesignation")}
        />
      </TableCell>
      <TableCell>
        <Input
          value={unite}
          onChange={(e) => setUnite(e.target.value)}
          onBlur={enregistrer}
          aria-label={t("colonneUnite")}
          className="w-20"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={quantite}
          onChange={(e) => setQuantite(e.target.value)}
          onBlur={enregistrer}
          aria-label={t("colonneQuantite")}
          className="w-24"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={prixUnitaire}
          onChange={(e) => setPrixUnitaire(e.target.value)}
          onBlur={enregistrer}
          aria-label={t("colonnePrixUnitaire")}
          className="w-28"
        />
      </TableCell>
      <TableCell className="text-right">
        {montant === null ? t("nonChiffree") : `${montant.toLocaleString("fr-FR")} FCFA`}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => deplacer("haut")}
            disabled={estPremiere}
            aria-label={t("deplacerHaut")}
          >
            {t("fleche.haut")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => deplacer("bas")}
            disabled={estDerniere}
            aria-label={t("deplacerBas")}
          >
            {t("fleche.bas")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={supprimer}>
            {t("supprimer")}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 5: Créer `app/(app)/appels-offres/[id]/bpu-section.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { toast } from "sonner";
import {
  renommerSectionBpu,
  deplacerSectionBpu,
  supprimerSectionBpu,
  creerLigneBpu,
} from "@/lib/appels-offres/actions";
import { sommerMontants } from "@/lib/appels-offres/bpu";
import type { SectionBpu, LigneBpu } from "@/lib/appels-offres/types";
import { BpuLigneRow } from "./bpu-ligne-row";

export function BpuSection({
  appelOffresId,
  section,
  lignes,
  estPremiere,
  estDerniere,
  onSectionModifiee,
  onSectionSupprimee,
  onLignesModifiees,
}: {
  appelOffresId: string;
  section: SectionBpu;
  lignes: LigneBpu[];
  estPremiere: boolean;
  estDerniere: boolean;
  onSectionModifiee: (section: SectionBpu) => void;
  onSectionSupprimee: (sectionId: string) => void;
  onLignesModifiees: (
    sectionId: string,
    updater: (lignesCourantes: LigneBpu[]) => LigneBpu[],
  ) => void;
}) {
  const t = useTranslations("AppelsOffres.detail.bpu");
  const [titre, setTitre] = useState(section.titre);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [nouvelleLigne, setNouvelleLigne] = useState({
    codeArticle: "",
    designation: "",
    unite: "",
    quantite: "",
    prixUnitaire: "",
  });

  const totalSection = sommerMontants(lignes);

  async function renommer() {
    const titreTaille = titre.trim();
    if (titreTaille.length === 0 || titreTaille === section.titre) {
      setTitre(section.titre);
      return;
    }

    const resultat = await renommerSectionBpu(appelOffresId, section.id, titre);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      setTitre(section.titre);
      return;
    }
    onSectionModifiee({ ...section, titre: titreTaille });
  }

  async function deplacer(sens: "haut" | "bas") {
    const resultat = await deplacerSectionBpu(appelOffresId, section.id, sens);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.location.reload();
  }

  async function supprimer() {
    const resultat = await supprimerSectionBpu(appelOffresId, section.id);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onSectionSupprimee(section.id);
    toast.success(t("toastSectionSupprimee"));
  }

  async function ajouterLigne() {
    if (
      nouvelleLigne.designation.trim().length === 0 ||
      nouvelleLigne.unite.trim().length === 0 ||
      nouvelleLigne.quantite.trim().length === 0
    ) {
      return;
    }

    setAjoutEnCours(true);
    const resultat = await creerLigneBpu(appelOffresId, section.id, {
      codeArticle: nouvelleLigne.codeArticle.trim().length > 0 ? nouvelleLigne.codeArticle : null,
      designation: nouvelleLigne.designation,
      unite: nouvelleLigne.unite,
      quantite: nouvelleLigne.quantite,
      prixUnitaire:
        nouvelleLigne.prixUnitaire.trim().length > 0 ? nouvelleLigne.prixUnitaire : null,
    });
    setAjoutEnCours(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onLignesModifiees(section.id, (lignesCourantes) => [...lignesCourantes, resultat.ligne]);
    setNouvelleLigne({ codeArticle: "", designation: "", unite: "", quantite: "", prixUnitaire: "" });
    toast.success(t("toastLigneAjoutee"));
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Input
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          onBlur={renommer}
          className="font-medium"
          aria-label={t("champTitreSection")}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => deplacer("haut")}
          disabled={estPremiere}
          aria-label={t("deplacerHaut")}
        >
          {t("fleche.haut")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => deplacer("bas")}
          disabled={estDerniere}
          aria-label={t("deplacerBas")}
        >
          {t("fleche.bas")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={supprimer}>
          {t("supprimerSection")}
        </Button>
      </div>

      {lignes.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colonneCode")}</TableHead>
              <TableHead>{t("colonneDesignation")}</TableHead>
              <TableHead>{t("colonneUnite")}</TableHead>
              <TableHead>{t("colonneQuantite")}</TableHead>
              <TableHead>{t("colonnePrixUnitaire")}</TableHead>
              <TableHead>{t("colonneMontant")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lignes.map((ligne, index) => (
              <BpuLigneRow
                key={ligne.id}
                appelOffresId={appelOffresId}
                sectionId={section.id}
                ligne={ligne}
                estPremiere={index === 0}
                estDerniere={index === lignes.length - 1}
                onLignesModifiees={onLignesModifiees}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <p className="text-right text-sm font-medium">
        {t("totalSection")} : {totalSection.toLocaleString("fr-FR")} FCFA
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <Input
          placeholder={t("colonneCode")}
          value={nouvelleLigne.codeArticle}
          onChange={(e) => setNouvelleLigne((v) => ({ ...v, codeArticle: e.target.value }))}
          className="w-20"
        />
        <Input
          placeholder={t("colonneDesignation")}
          value={nouvelleLigne.designation}
          onChange={(e) => setNouvelleLigne((v) => ({ ...v, designation: e.target.value }))}
        />
        <Input
          placeholder={t("colonneUnite")}
          value={nouvelleLigne.unite}
          onChange={(e) => setNouvelleLigne((v) => ({ ...v, unite: e.target.value }))}
          className="w-20"
        />
        <Input
          type="number"
          placeholder={t("colonneQuantite")}
          value={nouvelleLigne.quantite}
          onChange={(e) => setNouvelleLigne((v) => ({ ...v, quantite: e.target.value }))}
          className="w-24"
        />
        <Input
          type="number"
          placeholder={t("colonnePrixUnitaire")}
          value={nouvelleLigne.prixUnitaire}
          onChange={(e) => setNouvelleLigne((v) => ({ ...v, prixUnitaire: e.target.value }))}
          className="w-28"
        />
        <Button type="button" variant="outline" onClick={ajouterLigne} disabled={ajoutEnCours}>
          {ajoutEnCours ? t("ajoutEnCours") : t("boutonAjouterLigne")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Créer `app/(app)/appels-offres/[id]/bpu.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { creerSectionBpu } from "@/lib/appels-offres/actions";
import { sommerMontants, compterLignesNonChiffrees } from "@/lib/appels-offres/bpu";
import type { SectionBpu, LigneBpu } from "@/lib/appels-offres/types";
import { BpuSection } from "./bpu-section";

export function Bpu({
  appelOffresId,
  sectionsInitiales,
  lignesParSectionInitiales,
}: {
  appelOffresId: string;
  sectionsInitiales: SectionBpu[];
  lignesParSectionInitiales: Record<string, LigneBpu[]>;
}) {
  const t = useTranslations("AppelsOffres.detail.bpu");
  const [sections, setSections] = useState(sectionsInitiales);
  const [lignesParSection, setLignesParSection] = useState(lignesParSectionInitiales);
  const [nouveauTitre, setNouveauTitre] = useState("");
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  const toutesLesLignes = sections.flatMap((s) => lignesParSection[s.id] ?? []);
  const totalGeneral = sommerMontants(toutesLesLignes);
  const nonChiffrees = compterLignesNonChiffrees(toutesLesLignes);

  async function ajouterSection() {
    if (nouveauTitre.trim().length === 0) return;

    setAjoutEnCours(true);
    const resultat = await creerSectionBpu(appelOffresId, nouveauTitre);
    setAjoutEnCours(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setSections((liste) => [...liste, resultat.section]);
    setLignesParSection((carte) => ({ ...carte, [resultat.section.id]: [] }));
    setNouveauTitre("");
    toast.success(t("toastSectionAjoutee"));
  }

  function retirerSection(sectionId: string) {
    setSections((liste) => liste.filter((s) => s.id !== sectionId));
    setLignesParSection((carte) => {
      const copie = { ...carte };
      delete copie[sectionId];
      return copie;
    });
  }

  const sectionsTriees = sections.slice().sort((a, b) => a.ordre - b.ordre);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("titre")}</h2>
        <div className="text-right text-sm">
          <p className="font-semibold">
            {t("totalGeneral")} : {totalGeneral.toLocaleString("fr-FR")} FCFA
          </p>
          {nonChiffrees > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("lignesNonChiffrees", { count: nonChiffrees })}
            </p>
          )}
        </div>
      </div>

      {sectionsTriees.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("aucuneSection")}</p>
      )}

      {sectionsTriees.map((section, index) => (
        <BpuSection
          key={section.id}
          appelOffresId={appelOffresId}
          section={section}
          lignes={(lignesParSection[section.id] ?? []).slice().sort((a, b) => a.ordre - b.ordre)}
          estPremiere={index === 0}
          estDerniere={index === sectionsTriees.length - 1}
          onSectionModifiee={(sectionModifiee) =>
            setSections((liste) =>
              liste.map((s) => (s.id === sectionModifiee.id ? sectionModifiee : s)),
            )
          }
          onSectionSupprimee={retirerSection}
          onLignesModifiees={(sectionId, updater) =>
            setLignesParSection((carte) => ({
              ...carte,
              [sectionId]: updater(carte[sectionId] ?? []),
            }))
          }
        />
      ))}

      <div className="flex items-end gap-2">
        <Input
          value={nouveauTitre}
          onChange={(e) => setNouveauTitre(e.target.value)}
          placeholder={t("titreSectionPlaceholder")}
        />
        <Button type="button" variant="outline" onClick={ajouterSection} disabled={ajoutEnCours}>
          {ajoutEnCours ? t("ajoutEnCours") : t("boutonAjouterSection")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Modifier `app/(app)/appels-offres/[id]/page.tsx`**

L'import actuel :

```tsx
import {
  obtenirAppelOffres,
  listerChecklistManuelle,
  obtenirEvaluationGoNoGo,
  listerJalonsRetroplanning,
} from "@/lib/appels-offres/queries";
```

devient :

```tsx
import {
  obtenirAppelOffres,
  listerChecklistManuelle,
  obtenirEvaluationGoNoGo,
  listerJalonsRetroplanning,
  listerBpu,
} from "@/lib/appels-offres/queries";
```

Le chargement des données actuel :

```tsx
  const [bibliotheque, emailsLies, suggestions, checklistManuelle, evaluationGoNoGo, jalons] =
    await Promise.all([
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
    ]);
```

devient :

```tsx
  const [bibliotheque, emailsLies, suggestions, checklistManuelle, evaluationGoNoGo, jalons, bpu] =
    await Promise.all([
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
    ]);
```

Le rendu de `<AppelOffresDetail>` actuel :

```tsx
      <AppelOffresDetail
        appelOffres={resultat.appelOffres}
        exigences={resultat.exigences}
        documentsParExigence={resultat.documentsParExigence}
        bibliotheque={bibliotheque}
        sections={resultat.sections}
        documentsParSection={resultat.documentsParSection}
        emailsLies={emailsLies}
        suggestions={suggestions}
        dossierReponseId={resultat.dossierReponse.id}
        checklistAutomatique={checklistAutomatique}
        checklistManuelle={checklistManuelle}
        evaluationGoNoGo={evaluationGoNoGo}
        jalons={jalons}
        dateLimiteConnue={resultat.appelOffres.date_limite !== null}
      />
```

devient :

```tsx
      <AppelOffresDetail
        appelOffres={resultat.appelOffres}
        exigences={resultat.exigences}
        documentsParExigence={resultat.documentsParExigence}
        bibliotheque={bibliotheque}
        sections={resultat.sections}
        documentsParSection={resultat.documentsParSection}
        emailsLies={emailsLies}
        suggestions={suggestions}
        dossierReponseId={resultat.dossierReponse.id}
        checklistAutomatique={checklistAutomatique}
        checklistManuelle={checklistManuelle}
        evaluationGoNoGo={evaluationGoNoGo}
        jalons={jalons}
        dateLimiteConnue={resultat.appelOffres.date_limite !== null}
        bpu={bpu}
      />
```

- [ ] **Step 8: Modifier `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`**

Import à ajouter, à côté de l'import de `Retroplanning` :

```tsx
import { Retroplanning } from "./retroplanning";
```

devient :

```tsx
import { Retroplanning } from "./retroplanning";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bpu } from "./bpu";
```

L'import de types actuel :

```tsx
import type {
  AppelOffres,
  CleChecklistManuelle,
  EvaluationGoNoGo,
  ExigenceAo,
  JalonRetroplanning,
} from "@/lib/appels-offres/types";
```

devient :

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

La signature du composant actuelle :

```tsx
export function AppelOffresDetail({
  appelOffres,
  exigences,
  documentsParExigence,
  bibliotheque,
  sections,
  documentsParSection,
  emailsLies,
  suggestions,
  dossierReponseId,
  checklistAutomatique,
  checklistManuelle,
  evaluationGoNoGo,
  jalons,
  dateLimiteConnue,
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
}) {
```

devient :

```tsx
export function AppelOffresDetail({
  appelOffres,
  exigences,
  documentsParExigence,
  bibliotheque,
  sections,
  documentsParSection,
  emailsLies,
  suggestions,
  dossierReponseId,
  checklistAutomatique,
  checklistManuelle,
  evaluationGoNoGo,
  jalons,
  dateLimiteConnue,
  bpu,
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
}) {
```

Le bloc actuel (du début du `<form>` jusqu'à la fin du composant) :

```tsx
      <form action={onSubmit} className="flex flex-col gap-4">
```

... (le contenu interne de `<form>` ne change pas) ...

```tsx
      </form>

      <GoNoGo appelOffresId={appelOffres.id} evaluation={evaluationGoNoGo} />

      <Retroplanning
        appelOffresId={appelOffres.id}
        dateLimiteConnue={dateLimiteConnue}
        jalonsInitiaux={jalons}
      />

      {pret && (
        <>
```

... (le contenu interne du bloc `pret` ne change pas) ...

```tsx
        </>
      )}
    </div>
  );
}
```

devient (le `<form>` et le bloc `{pret && (...)}` gardent tout leur
contenu interne intact, seule leur enveloppe change — ils passent dans
`<TabsContent value="vue-ensemble">`, et un second `<TabsContent
value="bpu">` apparaît à côté) :

```tsx
      <Tabs defaultValue="vue-ensemble">
        <TabsList>
          <TabsTrigger value="vue-ensemble">{t("onglets.vueEnsemble")}</TabsTrigger>
          <TabsTrigger value="bpu">{t("onglets.bpu")}</TabsTrigger>
        </TabsList>

        <TabsContent value="vue-ensemble" className="flex flex-col gap-6">
          <form action={onSubmit} className="flex flex-col gap-4">
```

... (contenu interne du `<form>`, inchangé) ...

```tsx
          </form>

          <GoNoGo appelOffresId={appelOffres.id} evaluation={evaluationGoNoGo} />

          <Retroplanning
            appelOffresId={appelOffres.id}
            dateLimiteConnue={dateLimiteConnue}
            jalonsInitiaux={jalons}
          />

          {pret && (
            <>
```

... (contenu interne du bloc `pret`, inchangé — attention à
l'indentation supplémentaire de 2 espaces puisque ce bloc entre
maintenant dans `<TabsContent>`) ...

```tsx
            </>
          )}
        </TabsContent>

        <TabsContent value="bpu">
          <Bpu
            appelOffresId={appelOffres.id}
            sectionsInitiales={bpu.sections}
            lignesParSectionInitiales={bpu.lignesParSection}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

Le bandeau de statut (`StatutTraitementBadge` + bouton télécharger, tout
en haut du composant) et le message `{!pret && (...)}` juste après
restent **au-dessus** des `<Tabs>`, à leur emplacement actuel, inchangés.

- [ ] **Step 9: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 10: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`
Expected: tous les tests passent (les 8 tests de la Task 2 + tous les
tests existants, aucune régression).

- [ ] **Step 11: Vérifier le build de production**

Run: `npx next build`
Expected: build réussi, aucune erreur.

- [ ] **Step 12: Commit**

```bash
git add "app/(app)/appels-offres/[id]/bpu.tsx" "app/(app)/appels-offres/[id]/bpu-section.tsx" "app/(app)/appels-offres/[id]/bpu-ligne-row.tsx" "app/(app)/appels-offres/[id]/page.tsx" "app/(app)/appels-offres/[id]/appel-offres-detail.tsx" messages/fr.json messages/en.json
git commit -m "feat: interface BPU détaillé (onglets Vue d'ensemble / BPU)"
```

---

## Self-Review Notes

- **Couverture du spec** : modèle de données + types (Task 1), calculs
  purs en TDD (Task 2), lecture + actions de section (Task 3), actions
  de ligne (Task 4), interface + onglets + i18n (Task 5) — chaque
  section du spec `2026-09-16-bpu-detaille-design.md` a une tâche
  correspondante.
- **Cohérence des types** : `SectionBpu`/`LigneBpu` définis une seule
  fois (Task 1), réutilisés sans redéfinition dans `queries.ts`/
  `schema.ts`/`actions.ts` (Tasks 3-4) et les 3 composants + `page.tsx`/
  `appel-offres-detail.tsx` (Task 5). Signatures des 8 Server Actions
  identiques entre leur définition (Tasks 3-4) et leurs sites d'appel
  dans les composants (Task 5) — vérifié champ par champ : `creerLigneBpu`/
  `modifierLigneBpu` prennent tous deux le même objet `{ codeArticle,
  designation, unite, quantite, prixUnitaire }`, `deplacerSectionBpu`
  prend `(appelOffresId, sectionId, sens)`, `deplacerLigneBpu` prend
  `(appelOffresId, sectionId, ligneId, sens)`.
- **`onLignesModifiees` threadé sans rupture** : `Bpu` (Task 5, Step 6)
  définit le handler qui applique l'updater à `lignesParSection` ;
  `BpuSection` (Step 5) et `BpuLigneRow` (Step 4) le reçoivent tel quel
  en prop et l'appellent avec un updater fonctionnel dans chacun de
  leurs handlers (`ajouterLigne`, `enregistrer`, `supprimer`) — jamais
  un tableau déjà calculé, conforme à la leçon du Module 7.
- **`prix_unitaire` à `0`** : testé explicitement à 3 niveaux — Task 2
  (3 tests dédiés dans `bpu.test.ts`), et le commentaire de garde-fou
  est répété dans `bpu.ts` lui-même pour qu'un futur lecteur du code
  (pas seulement des tests) comprenne pourquoi `=== null` est utilisé
  plutôt qu'une vérification de véracité.
- **Task 3 et Task 4 découpées comme lecture+actions vs actions pures**,
  à l'image de la Task 3/Task 4 du plan rétroplanning (lecture+génération
  vs CRUD manuel) — chaque tâche reste testable indépendamment
  (`tsc`/`vitest`) sans dépendre de l'autre au-delà des imports partagés.
- **Task 5 reste une seule tâche malgré 3 nouveaux composants** : `Bpu`,
  `BpuSection` et `BpuLigneRow` sont mutuellement dépendants dès leur
  premier rendu (on ne peut pas approuver `bpu.tsx` sans que
  `bpu-section.tsx` existe) — les séparer en tâches distinctes créerait
  des étapes intermédiaires non testables de bout en bout.
- **Aucun placeholder** : chaque étape contient le code exact à écrire
  ou le texte exact à remplacer, y compris les 8 tests complets de la
  Task 2.
- **Vérification manuelle en conditions réelles** : ce plan est
  entièrement testable une fois la migration appliquée (par le
  contrôleur, hors de ce plan) sur un AO existant — créer une section,
  ajouter 2-3 lignes (dont une avec `prix_unitaire` à `0` et une sans
  prix), vérifier les totaux et l'indicateur « lignes à chiffrer »,
  tester le déplacement d'une ligne et d'une section, à faire une fois
  les 5 tâches exécutées, avant de proposer le merge.
