# Modèle de données Appel d'Offres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser les fondations de données du Module 3 (Extraction de DAO) : tables `appel_offres` et `exigence_ao`, appliquées à la base Supabase, plus les types TypeScript et helpers de chemin de stockage associés — sans UI, sans upload réel, sans connexion au pipeline de normalisation.

**Architecture:** Une migration SQL Supabase (deux tables, deux enums de statut, un enum de type d'exigence, RLS scopée par entreprise, réutilisation du bucket Storage `documents` existant avec un préfixe de chemin distinct). Un nouveau dossier `lib/appels-offres/` miroir de `lib/documents/`, avec uniquement les types et le helper de chemin de stockage — `schema.ts`/`actions.ts`/`queries.ts` viennent dans les sous-projets suivants.

**Tech Stack:** Supabase (Postgres, RLS), TypeScript, Vitest.

## Global Constraints

- `exigence_ao` reste une structure plate (pas de hiérarchie critère/sous-critère) — décision validée après le spike.
- `appel_offres` porte deux colonnes de statut distinctes : `statut_pipeline` (métier) et `statut_traitement` (technique) — ne jamais les fusionner.
- Réutilisation du bucket Storage `documents` existant (Module 2) — pas de nouveau bucket, pas de nouvelle politique Storage.
- RLS scopée par appartenance de l'utilisateur à l'entreprise, même schéma que `document`/`entreprise` (`supabase/migrations/20260822124743_bibliotheque_documentaire.sql`).
- Formats bailleurs (Banque mondiale, BAD) hors périmètre — non applicable à ce sous-projet de toute façon.

## Écart par rapport au spec (à valider)

Le spec ne mentionne explicitement que des politiques RLS `select`/`insert`/`delete` (calquées sur `document`, qui n'a pas de politique `update` — ses fichiers sont créés puis supprimés, jamais modifiés). Ce plan ajoute une politique `update` sur `appel_offres` (absente de `document`), car le cycle de vie de `appel_offres` est explicitement mutable par conception : `statut_traitement` transite de `en_attente` → `normalisation` → `extraction` → `termine`/`erreur`, et les champs extraits (`titre`, `acheteur`, `dao_markdown`, etc.) sont `null` à la création puis remplis après traitement — un futur sous-projet (l'orchestration) devra pouvoir mettre à jour la ligne. Pas de politique `update` ajoutée sur `exigence_ao` (son cycle de vie n'exige pas encore de mise à jour — les lignes sont insérées une fois par l'extraction).

Si tu préfères ne pas anticiper cette politique maintenant et laisser le sous-projet suivant l'ajouter au moment où il en a réellement besoin, dis-le avant l'exécution.

---

### Task 1: Migration SQL — tables `appel_offres` et `exigence_ao`

**Files:**
- Create: `supabase/migrations/<timestamp>_appel_offres.sql`

**Interfaces:**
- Consumes: tables `entreprise`/`utilisateur` existantes (`supabase/migrations/20260822124743_bibliotheque_documentaire.sql`).
- Produces: tables `appel_offres` et `exigence_ao` en base, consommées par Task 2 (types TypeScript) et par les sous-projets suivants (upload/orchestration, UI).

- [ ] **Step 1: Créer le fichier de migration**

Run: `supabase migration new appel_offres`

Expected: un fichier `supabase/migrations/<timestamp>_appel_offres.sql` vide est créé (le timestamp est généré automatiquement par la CLI).

- [ ] **Step 2: Écrire le contenu de la migration**

Remplacer le contenu du fichier généré par :

```sql
-- Modèle de données Appel d'Offres (Module 3)

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

create index appel_offres_entreprise_id_idx on appel_offres(entreprise_id);
create index appel_offres_statut_pipeline_idx on appel_offres(statut_pipeline);

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

create index exigence_ao_appel_offres_id_idx on exigence_ao(appel_offres_id);

-- RLS

alter table appel_offres enable row level security;
alter table exigence_ao enable row level security;

create policy "appel_offres_select_membres" on appel_offres
  for select using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = appel_offres.entreprise_id and u.id = auth.uid()
    )
  );

create policy "appel_offres_insert_membres" on appel_offres
  for insert with check (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = appel_offres.entreprise_id and u.id = auth.uid()
    )
  );

create policy "appel_offres_update_membres" on appel_offres
  for update using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = appel_offres.entreprise_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = appel_offres.entreprise_id and u.id = auth.uid()
    )
  );

create policy "appel_offres_delete_membres" on appel_offres
  for delete using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = appel_offres.entreprise_id and u.id = auth.uid()
    )
  );

create policy "exigence_ao_select_membres" on exigence_ao
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = exigence_ao.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "exigence_ao_insert_membres" on exigence_ao
  for insert with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = exigence_ao.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "exigence_ao_delete_membres" on exigence_ao
  for delete using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = exigence_ao.appel_offres_id and u.id = auth.uid()
    )
  );
```

- [ ] **Step 3: Appliquer la migration à la base Supabase distante**

Run: `supabase db push`

Expected: la migration s'applique sans erreur. Si la CLI demande confirmation, accepter. Si `supabase db push` échoue avec une erreur de lien de projet (`supabase link` non fait), rapporter en `BLOCKED` plutôt que de tenter une configuration non documentée ici.

- [ ] **Step 4: Vérifier que les tables existent réellement en base**

Run: `supabase migration list`

Expected: `<timestamp>_appel_offres` apparaît dans la liste avec un statut appliqué (colonne "Remote" cochée), confirmant que la migration a bien été poussée, pas seulement écrite localement.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): créer les tables appel_offres et exigence_ao"
```

---

### Task 2: Code `lib/appels-offres/` (types + chemin de stockage)

**Files:**
- Create: `lib/appels-offres/types.ts`
- Create: `lib/appels-offres/storage-path.ts`
- Test: `lib/appels-offres/storage-path.test.ts`

**Interfaces:**
- Consumes: rien (première tâche de code du sous-projet).
- Produces:
  - `types.ts` : `export const STATUTS_PIPELINE_AO`, `export type StatutPipelineAo`, `export const STATUTS_TRAITEMENT_AO`, `export type StatutTraitementAo`, `export const TYPES_EXIGENCE_AO`, `export type TypeExigenceAo`, `export interface AppelOffres`, `export interface ExigenceAo` — consommés par les sous-projets suivants (upload/orchestration, UI).
  - `storage-path.ts` : `export function construireCheminStockageDao(entrepriseId: string, appelOffresId: string, nomFichierOriginal: string): string` — consommé par le sous-projet d'upload/orchestration.

- [ ] **Step 1: Créer `lib/appels-offres/types.ts`**

```ts
export const STATUTS_PIPELINE_AO = [
  "identifie",
  "en_preparation",
  "soumis",
  "en_attente",
  "gagne",
  "perdu",
] as const;

export type StatutPipelineAo = (typeof STATUTS_PIPELINE_AO)[number];

export const STATUTS_TRAITEMENT_AO = [
  "en_attente",
  "normalisation",
  "extraction",
  "termine",
  "erreur",
] as const;

export type StatutTraitementAo = (typeof STATUTS_TRAITEMENT_AO)[number];

export const TYPES_EXIGENCE_AO = [
  "piece_requise",
  "critere_evaluation",
] as const;

export type TypeExigenceAo = (typeof TYPES_EXIGENCE_AO)[number];

export interface AppelOffres {
  id: string;
  entreprise_id: string;
  titre: string | null;
  acheteur: string | null;
  secteur: string | null;
  date_limite: string | null;
  montant_caution: number | null;
  statut_pipeline: StatutPipelineAo;
  statut_traitement: StatutTraitementAo;
  erreur_traitement: string | null;
  fichier_dao_path: string;
  fichier_dao_nom_original: string;
  dao_markdown: string | null;
  sommaire_attendu: string[] | null;
  created_by: string | null;
  created_at: string;
}

export interface ExigenceAo {
  id: string;
  appel_offres_id: string;
  type_exigence: TypeExigenceAo;
  libelle: string;
  description: string | null;
  ponderation: number | null;
  source_section: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Écrire le test de `construireCheminStockageDao`**

Créer `lib/appels-offres/storage-path.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { construireCheminStockageDao } from "./storage-path";

describe("construireCheminStockageDao", () => {
  it("préfixe le chemin par l'id entreprise, le segment appels-offres, puis l'id de l'appel d'offres", () => {
    const chemin = construireCheminStockageDao("ent-1", "ao-1", "dao.pdf");
    expect(chemin).toBe("ent-1/appels-offres/ao-1-dao.pdf");
  });

  it("nettoie les caractères non sûrs du nom de fichier", () => {
    const chemin = construireCheminStockageDao(
      "ent-1",
      "ao-1",
      "DAO Voirie (final).pdf",
    );
    expect(chemin).toBe("ent-1/appels-offres/ao-1-DAO_Voirie__final_.pdf");
  });
});
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run lib/appels-offres/storage-path.test.ts`

Expected: FAIL — `storage-path.ts` n'existe pas encore.

- [ ] **Step 4: Créer `lib/appels-offres/storage-path.ts`**

```ts
export function construireCheminStockageDao(
  entrepriseId: string,
  appelOffresId: string,
  nomFichierOriginal: string,
): string {
  const nomNettoye = nomFichierOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entrepriseId}/appels-offres/${appelOffresId}-${nomNettoye}`;
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run lib/appels-offres/storage-path.test.ts`

Expected: PASS, 2/2.

- [ ] **Step 6: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add lib/appels-offres/
git commit -m "feat: types et chemin de stockage pour appels-offres"
```

---
