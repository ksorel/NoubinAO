# Modèle de données Dossier de réponse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser les fondations de données du Module 4 (Mapping et assemblage) : tables `dossier_reponse` et `exigence_document`, appliquées à la base Supabase, plus les types TypeScript associés et la création automatique best-effort d'un `dossier_reponse` à la fin du traitement d'un AO — sans UI, sans Server Action, sans structure de contenu ("sections").

**Architecture:** Une migration SQL Supabase (deux tables, un enum de statut, RLS scopée par entreprise suivant exactement le même schéma que `exigence_ao`, migration de rattrapage pour les AO déjà `'termine'`). Extension de `lib/appels-offres/types.ts` (types existant déjà pour `AppelOffres`/`ExigenceAo`). Une modification ciblée de `lib/appels-offres/traitement.ts` : insertion best-effort de `dossier_reponse` juste après le passage à `statut_traitement='termine'`, qui ne doit jamais faire échouer le traitement par ailleurs réussi.

**Tech Stack:** Supabase (Postgres, RLS), TypeScript, Vitest.

## Global Constraints

- Mapping exigence↔document en many-to-many via une table de liaison dédiée (`exigence_document`), pas une colonne sur `exigence_ao`.
- `dossier_reponse` est créé automatiquement (code applicatif dans `traitement.ts`), jamais par une action explicite de l'utilisateur, jamais par un trigger PostgreSQL.
- L'insertion de `dossier_reponse` est **best-effort** : une erreur ici ne doit jamais provoquer `statut_traitement='erreur'` ni relancer d'exception — l'extraction elle-même a réussi.
- Trois statuts de relecture : `brouillon` / `relu` / `exporte`.
- Aucune colonne "sections" sur `dossier_reponse` dans ce sous-projet — décidée plus tard.
- Pas de policy RLS `update` sur `dossier_reponse` dans cette migration (même pattern que `appel_offres` : ajoutée dans une migration séparée quand le besoin réel apparaît).
- Spec complet : `docs/superpowers/specs/2026-09-05-modele-donnees-dossier-reponse-design.md`.

---

### Task 1: Migration SQL — tables `dossier_reponse` et `exigence_document`

**Files:**
- Create: `supabase/migrations/<timestamp>_dossier_reponse.sql`

**Interfaces:**
- Consumes: tables `appel_offres`/`exigence_ao`/`document`/`utilisateur` existantes (`supabase/migrations/20260831140310_appel_offres.sql`, `20260822124743_bibliotheque_documentaire.sql`).
- Produces: tables `dossier_reponse` et `exigence_document` en base, consommées par Task 2 (types TypeScript), Task 3 (insertion best-effort) et le sous-projet 2 (mapping, UI).

- [ ] **Step 1: Créer le fichier de migration**

Run: `supabase migration new dossier_reponse`

Expected: un fichier `supabase/migrations/<timestamp>_dossier_reponse.sql` vide est créé (le timestamp est généré automatiquement par la CLI).

- [ ] **Step 2: Écrire le contenu de la migration**

Remplacer le contenu du fichier généré par :

```sql
-- Modèle de données Dossier de réponse (Module 4, sous-projet 1)

create type statut_relecture_dossier as enum ('brouillon', 'relu', 'exporte');

create table dossier_reponse (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null unique references appel_offres(id) on delete cascade,
  statut_relecture statut_relecture_dossier not null default 'brouillon',
  export_path text,
  exporte_le timestamptz,
  created_at timestamptz not null default now()
);

create table exigence_document (
  id uuid primary key default gen_random_uuid(),
  exigence_ao_id uuid not null references exigence_ao(id) on delete cascade,
  document_id uuid not null references document(id) on delete cascade,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (exigence_ao_id, document_id)
);

create index exigence_document_exigence_ao_id_idx on exigence_document(exigence_ao_id);
create index exigence_document_document_id_idx on exigence_document(document_id);

-- Migration de rattrapage : crée les dossier_reponse manquants pour les AO
-- déjà 'termine' avant l'existence de cette table (ex. DAO Mairie de Dabou).
insert into dossier_reponse (appel_offres_id)
select id from appel_offres
where statut_traitement = 'termine'
  and id not in (select appel_offres_id from dossier_reponse);

-- RLS

alter table dossier_reponse enable row level security;
alter table exigence_document enable row level security;

create policy "dossier_reponse_select_membres" on dossier_reponse
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = dossier_reponse.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "dossier_reponse_insert_membres" on dossier_reponse
  for insert with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = dossier_reponse.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "dossier_reponse_delete_membres" on dossier_reponse
  for delete using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = dossier_reponse.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "exigence_document_select_membres" on exigence_document
  for select using (
    exists (
      select 1 from exigence_ao ea
      join appel_offres ao on ao.id = ea.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ea.id = exigence_document.exigence_ao_id and u.id = auth.uid()
    )
  );

create policy "exigence_document_insert_membres" on exigence_document
  for insert with check (
    exists (
      select 1 from exigence_ao ea
      join appel_offres ao on ao.id = ea.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ea.id = exigence_document.exigence_ao_id and u.id = auth.uid()
    )
  );

create policy "exigence_document_delete_membres" on exigence_document
  for delete using (
    exists (
      select 1 from exigence_ao ea
      join appel_offres ao on ao.id = ea.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ea.id = exigence_document.exigence_ao_id and u.id = auth.uid()
    )
  );
```

- [ ] **Step 3: Appliquer la migration à la base Supabase distante**

Run: `supabase db push`

Expected: la migration s'applique sans erreur. Si la CLI demande confirmation, accepter. Si `supabase db push` échoue avec une erreur de lien de projet (`supabase link` non fait), rapporter en `BLOCKED` plutôt que de tenter une configuration non documentée ici.

- [ ] **Step 4: Vérifier que les tables existent réellement en base**

Run: `supabase migration list`

Expected: `<timestamp>_dossier_reponse` apparaît dans la liste avec un statut appliqué (colonne "Remote" cochée).

- [ ] **Step 5: Vérifier le backfill sur l'AO déjà traité**

Dans le SQL Editor de Supabase Studio (ou via `supabase db execute` si disponible), exécuter :

```sql
select ao.id, ao.titre, dr.statut_relecture
from appel_offres ao
join dossier_reponse dr on dr.appel_offres_id = ao.id
where ao.statut_traitement = 'termine';
```

Expected: au moins une ligne, correspondant à l'AO Mairie de Dabou déjà traité avant ce sous-projet, avec `statut_relecture = 'brouillon'`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): créer les tables dossier_reponse et exigence_document"
```

---

### Task 2: Types TypeScript `DossierReponse`/`ExigenceDocument`

**Files:**
- Modify: `lib/appels-offres/types.ts`

**Interfaces:**
- Consumes: rien (fichier existant, ajout de nouvelles exports).
- Produces: `export const STATUTS_RELECTURE_DOSSIER`, `export type StatutRelectureDossier`, `export interface DossierReponse`, `export interface ExigenceDocument` — consommés par Task 3 et par le sous-projet 2 (mapping).

- [ ] **Step 1: Ajouter les nouveaux types à la fin de `lib/appels-offres/types.ts`**

```ts
export const STATUTS_RELECTURE_DOSSIER = ["brouillon", "relu", "exporte"] as const;

export type StatutRelectureDossier = (typeof STATUTS_RELECTURE_DOSSIER)[number];

export interface DossierReponse {
  id: string;
  appel_offres_id: string;
  statut_relecture: StatutRelectureDossier;
  export_path: string | null;
  exporte_le: string | null;
  created_at: string;
}

export interface ExigenceDocument {
  id: string;
  exigence_ao_id: string;
  document_id: string;
  created_by: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add lib/appels-offres/types.ts
git commit -m "feat: types DossierReponse et ExigenceDocument"
```

---

### Task 3: Insertion best-effort de `dossier_reponse` dans `traiterDao`

**Files:**
- Modify: `lib/appels-offres/traitement.ts`
- Modify: `lib/appels-offres/traitement.test.ts`

**Interfaces:**
- Consumes: table `dossier_reponse` (Task 1), aucune fonction exportée nouvelle — modification interne de `traiterDao`.
- Produces: `traiterDao` insère une ligne `dossier_reponse` après avoir marqué l'AO `'termine'`, sans jamais faire échouer le traitement si cette insertion échoue.

- [ ] **Step 1: Étendre le fake Supabase du test existant pour dispatcher la table `dossier_reponse`**

Dans `lib/appels-offres/traitement.test.ts`, la fonction `creerSupabaseFake` ne gère actuellement que deux tables (`appel_offres` et, par défaut, `exigence_ao`). Remplacer entièrement cette fonction (de `function creerSupabaseFake(` jusqu'à l'accolade fermante correspondante, juste avant `describe("traiterDao", ...)`) par :

```ts
function creerSupabaseFake(
  appelOffres: AppelOffres,
  options: {
    echouerMiseAJourFinale?: boolean;
    echouerInsertionDossierReponse?: boolean;
  } = {},
) {
  const misAJour: Record<string, unknown>[] = [];
  const exigencesInserees: Record<string, unknown>[][] = [];
  const dossierReponseInsere: Record<string, unknown>[] = [];

  const appelOffresTable = {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { ...appelOffres }, error: null }),
      }),
    }),
    update: (valeurs: Record<string, unknown>) => ({
      eq: async () => {
        misAJour.push(valeurs);

        if (options.echouerMiseAJourFinale && valeurs.statut_traitement === "termine") {
          return { error: { message: "échec simulé de la mise à jour finale" } };
        }

        Object.assign(appelOffres, valeurs);
        return { error: null };
      },
    }),
  };

  const exigenceTable = {
    delete: () => ({
      eq: async () => ({ error: null }),
    }),
    insert: async (lignes: Record<string, unknown>[]) => {
      exigencesInserees.push(lignes);
      return { error: null };
    },
  };

  const dossierReponseTable = {
    insert: async (valeurs: Record<string, unknown>) => {
      if (options.echouerInsertionDossierReponse) {
        return { error: { message: "échec simulé de l'insertion dossier_reponse" } };
      }
      dossierReponseInsere.push(valeurs);
      return { error: null };
    },
  };

  const fake = {
    from: (table: string) => {
      if (table === "appel_offres") return appelOffresTable;
      if (table === "dossier_reponse") return dossierReponseTable;
      return exigenceTable;
    },
    storage: {
      from: () => ({
        download: async () => ({
          data: { arrayBuffer: async () => new TextEncoder().encode("contenu-pdf").buffer },
          error: null,
        }),
      }),
    },
  };

  return {
    supabase: fake as unknown as SupabaseClient,
    misAJour,
    exigencesInserees,
    dossierReponseInsere,
  };
}
```

Seuls deux changements par rapport à l'original : (1) l'ajout de `dossierReponseInsere` et de l'option `echouerInsertionDossierReponse`, (2) `from(table)` devient une fonction à corps explicite avec une branche dédiée pour `"dossier_reponse"`, au lieu du ternaire `table === "appel_offres" ? appelOffresTable : exigenceTable`. Les 5 tests existants, qui déstructurent `{ supabase, misAJour }` ou `{ supabase, misAJour, exigencesInserees }`, continuent de fonctionner sans aucune modification.

- [ ] **Step 2: Écrire les deux nouveaux tests (ils doivent échouer avant Step 3)**

Ajouter à la fin du `describe("traiterDao", ...)` dans `lib/appels-offres/traitement.test.ts` :

```ts
  it("crée un dossier_reponse une fois le traitement terminé", async () => {
    const appelOffres = creerAppelOffresBase();
    const { supabase, dossierReponseInsere } = creerSupabaseFake(appelOffres);

    vi.mocked(normaliserDao).mockResolvedValue({
      markdown: "## AVIS D'APPEL D'OFFRES\nContenu.",
      sections: [{ titre: "AVIS D'APPEL D'OFFRES", contenu: "Contenu." }],
    });
    vi.mocked(extraireInformationsAo).mockResolvedValue({
      titre: "Construction d'un pont",
      acheteur: "Ministère X",
      secteur: "BTP",
      date_limite: "2026-11-03T12:00:00Z",
      montant_caution: 5000000,
      sommaire_attendu: [],
      exigences: [],
    });

    await traiterDao(supabase, "ao-1", "application/pdf");

    expect(dossierReponseInsere).toHaveLength(1);
    expect(dossierReponseInsere[0]).toEqual({ appel_offres_id: "ao-1" });
  });

  it("ne fait pas échouer le traitement si l'insertion du dossier_reponse échoue", async () => {
    // Best-effort : voir spec docs/superpowers/specs/2026-09-05-modele-donnees-dossier-reponse-design.md.
    // L'extraction a réussi, une erreur sur cette table annexe ne doit ni
    // relancer d'exception, ni faire basculer statut_traitement à 'erreur'.
    const appelOffres = creerAppelOffresBase();
    const { supabase, misAJour } = creerSupabaseFake(appelOffres, {
      echouerInsertionDossierReponse: true,
    });

    vi.mocked(normaliserDao).mockResolvedValue({
      markdown: "## AVIS D'APPEL D'OFFRES\nContenu.",
      sections: [{ titre: "AVIS D'APPEL D'OFFRES", contenu: "Contenu." }],
    });
    vi.mocked(extraireInformationsAo).mockResolvedValue({
      titre: "Construction d'un pont",
      acheteur: "Ministère X",
      secteur: "BTP",
      date_limite: "2026-11-03T12:00:00Z",
      montant_caution: 5000000,
      sommaire_attendu: [],
      exigences: [],
    });

    await expect(
      traiterDao(supabase, "ao-1", "application/pdf"),
    ).resolves.toBeUndefined();

    expect(misAJour.at(-1)?.statut_traitement).toBe("termine");
  });
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/appels-offres/traitement.test.ts`

Expected: FAIL sur les deux nouveaux tests — `traiterDao` n'insère pas encore de `dossier_reponse`.

- [ ] **Step 4: Ajouter l'insertion best-effort dans `lib/appels-offres/traitement.ts`**

Dans la fonction `traiterDao`, juste après le bloc qui écrit `statut_traitement: "termine"` (donc juste après le `if (erreurMiseAJourFinale) { throw ... }` correspondant, toujours à l'intérieur du `try` englobant mais dans son propre `try/catch` local pour ne jamais propager) :

```ts
    if (erreurMiseAJourFinale) {
      throw new Error("Échec de la mise à jour finale de l'appel d'offres.");
    }

    // Best-effort : une erreur ici ne doit jamais faire échouer un
    // traitement par ailleurs réussi. Filet de sécurité si l'insertion
    // échoue malgré tout : le sous-projet 2 fait un get-or-create à la
    // lecture (voir spec).
    try {
      const { error: erreurDossierReponse } = await supabase
        .from("dossier_reponse")
        .insert({ appel_offres_id: appelOffresId });

      if (erreurDossierReponse) {
        console.error(
          "Échec de la création du dossier_reponse (best-effort) :",
          erreurDossierReponse.message,
        );
      }
    } catch (erreurInattendue) {
      console.error(
        "Échec inattendu de la création du dossier_reponse (best-effort) :",
        erreurInattendue,
      );
    }
  } catch (erreur) {
```

(Le `} catch (erreur) {` existant reste inchangé — seul le nouveau bloc `try/catch` local est inséré avant lui, à l'intérieur du `try` externe.)

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run lib/appels-offres/traitement.test.ts`

Expected: PASS, 7/7 (5 tests existants + 2 nouveaux).

- [ ] **Step 6: Lancer toute la suite et le typecheck**

Run: `npx vitest run && npx tsc --noEmit`

Expected: tous les tests passent, aucune erreur de type.

- [ ] **Step 7: Commit**

```bash
git add lib/appels-offres/traitement.ts lib/appels-offres/traitement.test.ts
git commit -m "feat: création best-effort du dossier_reponse en fin de traitement"
```

---

## Self-Review Notes

- **Couverture du spec** : les trois décisions structurantes du spec (many-to-many, création automatique en code applicatif, best-effort non bloquant) sont chacune couvertes par une tâche. La structure de "sections" et le mapping UI sont explicitement hors périmètre du spec — aucune tâche ne les couvre, conforme.
- **Cohérence des types** : `DossierReponse.appel_offres_id`, `ExigenceDocument.exigence_ao_id`/`document_id` correspondent exactement aux colonnes SQL de Task 1.
- **Aucun placeholder** : chaque étape contient le code exact à écrire, pas de description vague.
