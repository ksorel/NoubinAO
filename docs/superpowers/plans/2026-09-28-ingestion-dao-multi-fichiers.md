# Ingestion DAO multi-fichiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de téléverser un DAO éclaté en plusieurs fichiers (AAO/IS/DPAO/CCAG/CCAP/BPU) en un seul geste, en les classant par contenu puis en les concaténant dans l'ordre canonique attendu par le pipeline d'extraction existant — sans jamais modifier ce pipeline.

**Architecture:** Nouveau module pur de classification (mots-clés, même patron que `identifierFormulaireStandard`) + une nouvelle table additive `fichier_dao_supplementaire` pour les fichiers 2+ (le premier fichier reste sur les colonnes `appel_offres.fichier_dao_path`/`fichier_dao_nom_original` existantes, zéro changement pour les AO à un seul fichier). `traiterDao` télécharge et normalise chaque fichier, saute la classification s'il n'y en a qu'un (comportement actuel préservé au caractère près), sinon classe puis concatène en ordre canonique avant d'appeler `decouperParSection`/`extraireInformationsAo`, strictement inchangés.

**Tech Stack:** Next.js App Router (Server Actions, Route Handler QStash), Supabase Postgres/RLS, Zod, next-intl, Vitest, shadcn/ui.

## Global Constraints

- Spec source : `docs/superpowers/specs/2026-09-28-ingestion-dao-multi-fichiers-design.md`.
- **Un seul fichier téléversé → comportement identique au code actuel, au caractère près.** La classification/concaténation ne s'active qu'à partir de 2 fichiers. Aucun risque qu'un faux négatif de classification supprime du contenu sur le cas majoritaire.
- **Classification par contenu, jamais par nom de fichier.**
- **Ordre canonique de concaténation fixe : `aao, is, dpao, ccag, ccap`.** Ne jamais réordonner par ordre d'upload — `extraireInformationsAo` suppose cet ordre (plage d'exclusion par index Instructions→DPAO).
- **`bpu`/`non_classe` : jamais concaténés dans `dao_markdown`.** Stockés et téléchargeables, mais leur contenu n'entre jamais dans l'extraction.
- **`appel_offres.fichier_dao_path`/`fichier_dao_nom_original` restent le premier fichier**, colonnes et code existants inchangés. Nouvelle table `fichier_dao_supplementaire` pour les fichiers 2+ uniquement.
- **`type_classifie` est un ENUM Postgres** (`type_fichier_dao`), pas `text` — cohérent avec `statut_traitement_ao` déjà dans ce projet.
- **Erreur sur un seul fichier parmi plusieurs = échec de tout `traiterDao`** (pas de traitement partiel best-effort) — même modèle "tout ou rien" qu'aujourd'hui.
- **Pas de zip, pas d'upload direct navigateur→Storage** pour cette brique — reste sur le flux Server Action existant (limite 21 Mo cumulée connue, non traitée).
- Migration SQL créée mais **jamais poussée par l'implémenteur** (`supabase db push` interdit) — relue et appliquée séparément par le contrôleur avant le merge.
- Aucun test sur les Server Actions (`televerserDao`), le Route Handler (`route.ts`) ni les composants UI — cohérent avec le reste du projet. Tests sur : le module de classification (pur), et `traiterDao` (déjà testé aujourd'hui, suite existante à mettre à jour).

---

### Task 1: Modèle de données + module pur de classification

**Files:**
- Create: `supabase/migrations/20260928100000_fichier_dao_supplementaire.sql`
- Create: `lib/appels-offres/normalisation/classification-fichier.ts`
- Create: `lib/appels-offres/normalisation/classification-fichier.test.ts`
- Modify: `lib/appels-offres/types.ts`

**Interfaces:**
- Produces (consommé par Tasks 4, 6) :
  - `export const TYPES_FICHIER_DAO = ["aao","is","dpao","ccag","ccap","bpu","non_classe"] as const;`
  - `export type TypeFichierDao = (typeof TYPES_FICHIER_DAO)[number];`
  - `export const ORDRE_CANONIQUE_CONCATENATION: readonly TypeFichierDao[]`
  - `export function classifierTypeFichierDao(markdown: string): TypeFichierDao`
  - `export interface FichierClasse { type: TypeFichierDao; markdown: string; }`
  - `export function assemblerDaoMarkdown(fichiersClasses: FichierClasse[]): string`
  - `export interface FichierDaoSupplementaire { id: string; appel_offres_id: string; chemin_stockage: string; nom_original: string; type_mime: string; type_classifie: TypeFichierDao | null; ordre: number; created_by: string | null; created_at: string; }` (dans `types.ts`)

- [ ] **Step 1: Écrire la migration**

Créer `supabase/migrations/20260928100000_fichier_dao_supplementaire.sql` :

```sql
-- Ingestion DAO multi-fichiers. appel_offres.fichier_dao_path reste le
-- premier fichier téléversé (inchangé, tout le code existant continue de
-- fonctionner tel quel pour un AO à un seul fichier). Cette table porte
-- les fichiers 2+ d'un même DAO éclaté. type_classifie est nullable :
-- rempli après coup par traiterDao une fois la classification par
-- contenu effectuée (best-effort, pour affichage seulement — jamais relu
-- par le traitement lui-même, qui reçoit ses chemins/mimeTypes via le
-- message QStash, pas via cette table).
--
-- ENUM plutôt que text, cohérent avec statut_traitement_ao
-- (20260831140310_appel_offres.sql) — petit ensemble de valeurs fixes,
-- même patron que STATUTS_TRAITEMENT_AO/StatutTraitementAo côté TS (voir
-- TYPES_FICHIER_DAO dans classification-fichier.ts). Type et colonne
-- créés dans la même migration : pas de risque du piège ALTER TYPE
-- (mémoire noubinao_postgres_enum_vs_ts_union), qui ne concerne que
-- l'ajout d'une valeur à un enum déjà en prod.
create type type_fichier_dao as enum (
  'aao', 'is', 'dpao', 'ccag', 'ccap', 'bpu', 'non_classe'
);

create table fichier_dao_supplementaire (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  chemin_stockage text not null,
  nom_original text not null,
  type_mime text not null,
  type_classifie type_fichier_dao,
  ordre integer not null default 0,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index fichier_dao_supplementaire_appel_offres_id_idx
  on fichier_dao_supplementaire(appel_offres_id);

alter table fichier_dao_supplementaire enable row level security;

create policy "fichier_dao_supplementaire_select_membres" on fichier_dao_supplementaire
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = fichier_dao_supplementaire.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "fichier_dao_supplementaire_insert_membres" on fichier_dao_supplementaire
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = fichier_dao_supplementaire.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "fichier_dao_supplementaire_delete_membres" on fichier_dao_supplementaire
  for delete using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = fichier_dao_supplementaire.appel_offres_id and u.id = auth.uid()
    )
  );
```

**Ne pas exécuter `npx supabase db push` ni `supabase db query` — la migration est relue et appliquée séparément par le contrôleur.**

- [ ] **Step 2: Ajouter `FichierDaoSupplementaire` dans `types.ts`**

Dans `lib/appels-offres/types.ts`, juste après la fermeture de l'interface `AppelOffres` (après la ligne `created_at: string;` suivie de `}`), ajouter :

```ts
import type { TypeFichierDao } from "./normalisation/classification-fichier";

export interface FichierDaoSupplementaire {
  id: string;
  appel_offres_id: string;
  chemin_stockage: string;
  nom_original: string;
  type_mime: string;
  type_classifie: TypeFichierDao | null;
  ordre: number;
  created_by: string | null;
  created_at: string;
}
```

(L'import se place en haut du fichier avec les autres imports existants, pas au milieu — ajouter la ligne `import type { TypeFichierDao } from "./normalisation/classification-fichier";` dans le bloc d'imports en tête de `types.ts`, puis l'interface `FichierDaoSupplementaire` au point indiqué ci-dessus.)

- [ ] **Step 3: Écrire les tests du module de classification (échouent, le module n'existe pas)**

Créer `lib/appels-offres/normalisation/classification-fichier.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
  classifierTypeFichierDao,
  assemblerDaoMarkdown,
  type FichierClasse,
} from "./classification-fichier";

describe("classifierTypeFichierDao", () => {
  it("classe un texte contenant 'Avis d'Appel d'Offres' en aao", () => {
    expect(classifierTypeFichierDao("## Avis d'Appel d'Offres\nContenu.")).toBe("aao");
  });

  it("reconnaît la variante d'apostrophe typographique", () => {
    expect(classifierTypeFichierDao("Avis d’Appel d’Offres")).toBe("aao");
  });

  it("classe un texte contenant 'Instructions aux soumissionnaires' en is", () => {
    expect(classifierTypeFichierDao("Instructions aux Soumissionnaires\nArticle 1.")).toBe("is");
  });

  it("classe un texte contenant 'Instructions aux candidats' en is", () => {
    expect(classifierTypeFichierDao("Instructions aux Candidats")).toBe("is");
  });

  it("classe un texte contenant 'Données particulières' en dpao", () => {
    expect(classifierTypeFichierDao("Données Particulières de l'Appel d'Offres")).toBe("dpao");
  });

  it("classe un texte contenant 'Cahier des clauses administratives générales' en ccag", () => {
    expect(classifierTypeFichierDao("Cahier des Clauses Administratives Générales")).toBe("ccag");
  });

  it("classe un texte contenant 'Cahier des clauses administratives particulières' en ccap", () => {
    expect(classifierTypeFichierDao("Cahier des Clauses Administratives Particulières")).toBe(
      "ccap",
    );
  });

  it("classe un texte contenant 'Bordereau des prix' en bpu", () => {
    expect(classifierTypeFichierDao("Bordereau des Prix Unitaires")).toBe("bpu");
  });

  it("classe un texte contenant 'Devis quantitatif' en bpu", () => {
    expect(classifierTypeFichierDao("Devis Quantitatif et Estimatif")).toBe("bpu");
  });

  it("classe en aao un texte contenant tous les mots-clés (cas du fichier unique)", () => {
    const texteComplet = [
      "Avis d'Appel d'Offres",
      "Instructions aux Soumissionnaires",
      "Données Particulières de l'Appel d'Offres",
      "Cahier des Clauses Administratives Générales",
      "Cahier des Clauses Administratives Particulières",
    ].join("\n\n");
    expect(classifierTypeFichierDao(texteComplet)).toBe("aao");
  });

  it("classe non_classe un texte sans aucun mot-clé connu", () => {
    expect(classifierTypeFichierDao("Ceci est un document quelconque sans titre reconnu.")).toBe(
      "non_classe",
    );
  });
});

function creerFichierClasse(type: FichierClasse["type"], markdown: string): FichierClasse {
  return { type, markdown };
}

describe("assemblerDaoMarkdown", () => {
  it("concatène dans l'ordre canonique, indépendamment de l'ordre d'entrée", () => {
    const resultat = assemblerDaoMarkdown([
      creerFichierClasse("dpao", "Contenu DPAO"),
      creerFichierClasse("aao", "Contenu AAO"),
      creerFichierClasse("is", "Contenu IS"),
    ]);
    const indexAao = resultat.indexOf("Contenu AAO");
    const indexIs = resultat.indexOf("Contenu IS");
    const indexDpao = resultat.indexOf("Contenu DPAO");
    expect(indexAao).toBeGreaterThanOrEqual(0);
    expect(indexAao).toBeLessThan(indexIs);
    expect(indexIs).toBeLessThan(indexDpao);
  });

  it("concatène deux fichiers de la même catégorie dans leur ordre d'apparition", () => {
    const resultat = assemblerDaoMarkdown([
      creerFichierClasse("dpao", "Partie 1"),
      creerFichierClasse("dpao", "Partie 2"),
    ]);
    expect(resultat.indexOf("Partie 1")).toBeLessThan(resultat.indexOf("Partie 2"));
  });

  it("exclut les fichiers classés bpu", () => {
    const resultat = assemblerDaoMarkdown([
      creerFichierClasse("aao", "Contenu AAO"),
      creerFichierClasse("bpu", "Contenu BPU"),
    ]);
    expect(resultat).not.toContain("Contenu BPU");
  });

  it("exclut les fichiers classés non_classe", () => {
    const resultat = assemblerDaoMarkdown([
      creerFichierClasse("aao", "Contenu AAO"),
      creerFichierClasse("non_classe", "Contenu inconnu"),
    ]);
    expect(resultat).not.toContain("Contenu inconnu");
  });

  it("retourne une chaîne vide si aucun fichier n'est dans une catégorie canonique", () => {
    const resultat = assemblerDaoMarkdown([creerFichierClasse("bpu", "Contenu BPU")]);
    expect(resultat).toBe("");
  });

  it("retourne une chaîne vide pour un tableau vide", () => {
    expect(assemblerDaoMarkdown([])).toBe("");
  });
});
```

- [ ] **Step 4: Lancer les tests, vérifier l'échec attendu**

Run: `npx vitest run lib/appels-offres/normalisation/classification-fichier.test.ts`
Expected: FAIL — `Cannot find module './classification-fichier'`

- [ ] **Step 5: Implémenter le module**

Créer `lib/appels-offres/normalisation/classification-fichier.ts` :

```ts
export const TYPES_FICHIER_DAO = [
  "aao",
  "is",
  "dpao",
  "ccag",
  "ccap",
  "bpu",
  "non_classe",
] as const;

export type TypeFichierDao = (typeof TYPES_FICHIER_DAO)[number];

// Ordre canonique de concaténation — extraireInformationsAo suppose cet
// ordre (plage d'exclusion par index Instructions→DPAO, voir
// normalisation/extraire.ts). "bpu" et "non_classe" en sont
// délibérément absents : jamais concaténés dans dao_markdown.
export const ORDRE_CANONIQUE_CONCATENATION: readonly TypeFichierDao[] = [
  "aao",
  "is",
  "dpao",
  "ccag",
  "ccap",
];

interface MotsClesType {
  type: TypeFichierDao;
  motsCles: string[];
}

// Premier type dont un mot-clé apparaît dans le document qui l'emporte.
// Un DAO à un seul fichier (contenant tous les mots-clés) tombe toujours
// sur "aao" en premier — comportement voulu, mais cette fonction n'est
// en pratique jamais appelée dans ce cas : traiterDao saute la
// classification entièrement quand il n'y a qu'un seul fichier (voir
// traitement.ts), pour éliminer tout risque qu'un faux négatif de
// classification supprime du contenu sur le cas majoritaire.
const REGISTRE: MotsClesType[] = [
  { type: "aao", motsCles: ["avis d'appel d'offres", "avis d'appel d'offre"] },
  {
    type: "is",
    motsCles: ["instructions aux soumissionnaires", "instructions aux candidats"],
  },
  {
    type: "dpao",
    motsCles: ["données particulières de l'appel d'offres", "données particulières"],
  },
  { type: "ccag", motsCles: ["cahier des clauses administratives générales"] },
  { type: "ccap", motsCles: ["cahier des clauses administratives particulières"] },
  {
    type: "bpu",
    motsCles: ["bordereau des prix", "devis quantitatif et estimatif", "devis quantitatif"],
  },
];

function normaliser(texte: string): string {
  return texte.toLowerCase().replace(/['’‘]/g, "'");
}

export function classifierTypeFichierDao(markdown: string): TypeFichierDao {
  const texteNormalise = normaliser(markdown);
  for (const { type, motsCles } of REGISTRE) {
    if (motsCles.some((mot) => texteNormalise.includes(normaliser(mot)))) {
      return type;
    }
  }
  return "non_classe";
}

export interface FichierClasse {
  type: TypeFichierDao;
  markdown: string;
}

// Regroupe par catégorie canonique (dans ORDRE_CANONIQUE_CONCATENATION),
// concatène les fichiers d'une même catégorie dans leur ordre d'apparition
// dans le tableau d'entrée (deux fichiers classés "dpao" restent tous
// deux inclus, l'un après l'autre — pas de déduplication, pas de
// détection de contradiction). "bpu"/"non_classe" jamais inclus.
// Séparateur double saut de ligne pour ne jamais fusionner la dernière
// ligne d'un fichier avec la première du suivant.
export function assemblerDaoMarkdown(fichiersClasses: FichierClasse[]): string {
  return ORDRE_CANONIQUE_CONCATENATION.map((type) =>
    fichiersClasses
      .filter((f) => f.type === type)
      .map((f) => f.markdown)
      .join("\n\n"),
  )
    .filter((bloc) => bloc.length > 0)
    .join("\n\n");
}
```

- [ ] **Step 6: Lancer les tests, vérifier le succès**

Run: `npx vitest run lib/appels-offres/normalisation/classification-fichier.test.ts`
Expected: PASS (18/18 tests)

- [ ] **Step 7: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur (le nouvel import dans `types.ts` doit résoudre correctement).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260928100000_fichier_dao_supplementaire.sql lib/appels-offres/normalisation/classification-fichier.ts lib/appels-offres/normalisation/classification-fichier.test.ts lib/appels-offres/types.ts
git commit -m "feat: modèle de données et classification par contenu pour l'ingestion DAO multi-fichiers"
```

---

### Task 2: Validation multi-fichiers et chemin de stockage indexé

**Files:**
- Modify: `lib/appels-offres/schema.ts`
- Modify: `lib/appels-offres/schema.test.ts`
- Modify: `lib/appels-offres/storage-path.ts`
- Modify: `lib/appels-offres/storage-path.test.ts`

**Interfaces:**
- Consumes: rien de Task 1.
- Produces (consommé par Task 5) :
  - `export const televerserDaoSchema = z.object({ fichiers: z.array(fichierDaoUnique).min(1, "Ajoutez au moins un fichier") });` — `TeleverserDaoInput` devient `{ fichiers: File[] }`.
  - `export function construireCheminStockageDao(entrepriseId: string, appelOffresId: string, nomFichierOriginal: string, index?: number): string` (nouveau paramètre optionnel, défaut `0`).

- [ ] **Step 1: Modifier `televerserDaoSchema`**

Dans `lib/appels-offres/schema.ts`, le bloc actuel :

```ts
export const televerserDaoSchema = z.object({
  fichier: z
    .instanceof(File)
    .refine((f) => f.size > 0 && f.size <= TAILLE_MAX_OCTETS, {
      message: "Le fichier doit faire moins de 20 Mo",
    })
    .refine(
      (f) => (MIME_TYPES_DAO_SUPPORTES as readonly string[]).includes(f.type),
      { message: "Type de fichier non accepté (PDF ou DOCX uniquement)" },
    ),
});
```

devient :

```ts
const fichierDaoUnique = z
  .instanceof(File)
  .refine((f) => f.size > 0 && f.size <= TAILLE_MAX_OCTETS, {
    message: "Chaque fichier doit faire moins de 20 Mo",
  })
  .refine(
    (f) => (MIME_TYPES_DAO_SUPPORTES as readonly string[]).includes(f.type),
    { message: "Type de fichier non accepté (PDF ou DOCX uniquement)" },
  );

export const televerserDaoSchema = z.object({
  fichiers: z.array(fichierDaoUnique).min(1, "Ajoutez au moins un fichier"),
});
```

`TeleverserDaoInput` (ligne `export type TeleverserDaoInput = z.infer<typeof televerserDaoSchema>;`, juste après) reste inchangée textuellement — elle reflète automatiquement `{ fichiers: File[] }` via l'inférence Zod.

- [ ] **Step 2: Mettre à jour les tests existants de `televerserDaoSchema`**

Dans `lib/appels-offres/schema.test.ts`, le bloc `describe("televerserDaoSchema", ...)` actuel (lignes 10-52) :

```ts
describe("televerserDaoSchema", () => {
  it("accepte un PDF de taille valide", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichier: creerFichier(1024, MIME_PDF),
    });
    expect(resultat.success).toBe(true);
  });

  it("accepte un DOCX de taille valide", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichier: creerFichier(1024, MIME_DOCX, "dao.docx"),
    });
    expect(resultat.success).toBe(true);
  });

  it("rejette un fichier de plus de 20 Mo", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichier: creerFichier(21 * 1024 * 1024, MIME_PDF),
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un fichier vide", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichier: creerFichier(0, MIME_PDF),
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un type MIME non supporté", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichier: creerFichier(1024, "image/png"),
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un .doc legacy (accepté pour le modèle de CV, pas pour le DAO)", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichier: creerFichier(1024, MIME_DOC_LEGACY, "dao.doc"),
    });
    expect(resultat.success).toBe(false);
  });
});
```

devient (chaque cas passe désormais par le tableau `fichiers`, plus deux nouveaux cas pour le tableau lui-même) :

```ts
describe("televerserDaoSchema", () => {
  it("accepte un PDF de taille valide", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichiers: [creerFichier(1024, MIME_PDF)],
    });
    expect(resultat.success).toBe(true);
  });

  it("accepte un DOCX de taille valide", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichiers: [creerFichier(1024, MIME_DOCX, "dao.docx")],
    });
    expect(resultat.success).toBe(true);
  });

  it("accepte plusieurs fichiers valides", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichiers: [
        creerFichier(1024, MIME_PDF, "aao.pdf"),
        creerFichier(1024, MIME_DOCX, "dpao.docx"),
      ],
    });
    expect(resultat.success).toBe(true);
  });

  it("rejette un tableau vide", () => {
    const resultat = televerserDaoSchema.safeParse({ fichiers: [] });
    expect(resultat.success).toBe(false);
  });

  it("rejette si un seul fichier parmi plusieurs dépasse 20 Mo", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichiers: [creerFichier(1024, MIME_PDF), creerFichier(21 * 1024 * 1024, MIME_PDF)],
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un fichier de plus de 20 Mo", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichiers: [creerFichier(21 * 1024 * 1024, MIME_PDF)],
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un fichier vide", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichiers: [creerFichier(0, MIME_PDF)],
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un type MIME non supporté", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichiers: [creerFichier(1024, "image/png")],
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un .doc legacy (accepté pour le modèle de CV, pas pour le DAO)", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichiers: [creerFichier(1024, MIME_DOC_LEGACY, "dao.doc")],
    });
    expect(resultat.success).toBe(false);
  });
});
```

Le reste du fichier (`describe("televerserModeleCvSchema", ...)` et au-delà) reste inchangé — ce schéma n'est pas concerné par ce sous-projet.

- [ ] **Step 3: Lancer les tests du schéma, vérifier le succès**

Run: `npx vitest run lib/appels-offres/schema.test.ts`
Expected: PASS (tous les tests du fichier, y compris `televerserModeleCvSchema`/`modifierAppelOffresSchema` inchangés).

- [ ] **Step 4: Ajouter le paramètre `index` à `construireCheminStockageDao`**

Dans `lib/appels-offres/storage-path.ts`, la fonction actuelle :

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

devient :

```ts
export function construireCheminStockageDao(
  entrepriseId: string,
  appelOffresId: string,
  nomFichierOriginal: string,
  index = 0,
): string {
  const nomNettoye = nomFichierOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entrepriseId}/appels-offres/${appelOffresId}-${index}-${nomNettoye}`;
}
```

Le reste du fichier (`construireCheminStockageExport`, `construireCheminStockageModeleCv`,
`construireCheminStockageCvTransforme`) reste inchangé.

- [ ] **Step 5: Mettre à jour les tests existants (le format de chemin change, même à `index` par défaut)**

`lib/appels-offres/storage-path.test.ts` actuel :

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

devient (les deux chemins attendus gagnent le segment `-0-`, plus un nouveau
cas pour un `index` explicite) :

```ts
import { describe, expect, it } from "vitest";
import { construireCheminStockageDao } from "./storage-path";

describe("construireCheminStockageDao", () => {
  it("préfixe le chemin par l'id entreprise, le segment appels-offres, l'id de l'appel d'offres et l'index (0 par défaut)", () => {
    const chemin = construireCheminStockageDao("ent-1", "ao-1", "dao.pdf");
    expect(chemin).toBe("ent-1/appels-offres/ao-1-0-dao.pdf");
  });

  it("nettoie les caractères non sûrs du nom de fichier", () => {
    const chemin = construireCheminStockageDao(
      "ent-1",
      "ao-1",
      "DAO Voirie (final).pdf",
    );
    expect(chemin).toBe("ent-1/appels-offres/ao-1-0-DAO_Voirie__final_.pdf");
  });

  it("utilise l'index fourni pour distinguer plusieurs fichiers d'un même AO", () => {
    const chemin = construireCheminStockageDao("ent-1", "ao-1", "dpao.pdf", 2);
    expect(chemin).toBe("ent-1/appels-offres/ao-1-2-dpao.pdf");
  });
});
```

- [ ] **Step 6: Lancer les tests, vérifier le succès**

Run: `npx vitest run lib/appels-offres/storage-path.test.ts`
Expected: PASS (3/3 tests)

- [ ] **Step 7: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: **aucune erreur nulle part.** `televerserDaoSchema.safeParse(...)`
prend un argument `unknown` (signature Zod) : l'appel existant dans
`actions.ts` avec la clé `fichier` (pas encore `fichiers`, Task 5) reste
syntaxiquement valide et ne casse pas la compilation — seule sa validation
échouerait à l'exécution. `construireCheminStockageDao` gagne un 4ᵉ
paramètre optionnel : tout appel existant à 3 arguments reste valide.
Rien à investiguer si `tsc` est propre à ce stade — c'est le résultat
attendu, pas une anomalie.

- [ ] **Step 8: Commit**

```bash
git add lib/appels-offres/schema.ts lib/appels-offres/schema.test.ts lib/appels-offres/storage-path.ts lib/appels-offres/storage-path.test.ts
git commit -m "feat: validation multi-fichiers et chemin de stockage indexé pour le DAO"
```

---

### Task 3: File d'attente et Route Handler — message QStash multi-fichiers

**Files:**
- Modify: `lib/appels-offres/file-attente.ts`
- Modify: `lib/appels-offres/file-attente.test.ts`
- Modify: `app/api/dao/traiter/route.ts`

**Interfaces:**
- Consumes: rien de Tasks 1-2.
- Produces (consommé par Tasks 4, 5) :
  - `export interface FichierATraiter { cheminStockage: string; mimeType: string; }`
  - `export async function mettreEnFileTraitementDao(appelOffresId: string, fichiers: FichierATraiter[]): Promise<void>`

- [ ] **Step 1: Modifier `mettreEnFileTraitementDao`**

Dans `lib/appels-offres/file-attente.ts`, le fichier actuel :

```ts
import { Client } from "@upstash/qstash";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

export function construireUrlCallback(): string {
  // ... commentaire inchangé ...
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/api/dao/traiter`;
}

export async function mettreEnFileTraitementDao(
  appelOffresId: string,
  mimeType: string,
): Promise<void> {
  await qstash.publishJSON({
    url: construireUrlCallback(),
    body: { appelOffresId, mimeType },
  });
}
```

devient (`construireUrlCallback` et son commentaire restent identiques,
seule la signature et le corps de `mettreEnFileTraitementDao` changent) :

```ts
import { Client } from "@upstash/qstash";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

export function construireUrlCallback(): string {
  // VERCEL_URL pointe vers l'URL unique du déploiement en cours
  // (ex. noubinao-<hash>-k-nowledge.vercel.app), pas le domaine de
  // production — Vercel protège ces URLs par déploiement même quand
  // "Vercel Authentication" est désactivée pour le domaine principal,
  // ce qui faisait échouer tout callback QStash avec 401 "Protected
  // deployment". APP_URL est un domaine stable et explicite, à définir
  // dans les variables d'environnement Vercel (production) — voir
  // CLAUDE.md.
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/api/dao/traiter`;
}

export interface FichierATraiter {
  cheminStockage: string;
  mimeType: string;
}

export async function mettreEnFileTraitementDao(
  appelOffresId: string,
  fichiers: FichierATraiter[],
): Promise<void> {
  await qstash.publishJSON({
    url: construireUrlCallback(),
    body: { appelOffresId, fichiers },
  });
}
```

- [ ] **Step 2: Mettre à jour les tests existants**

`lib/appels-offres/file-attente.test.ts` actuel — les 3 appels à
`mettreEnFileTraitementDao("ao-1", "application/pdf")` et l'assertion sur
`body: { appelOffresId: "ao-1", mimeType: "application/pdf" }` (test 1)
utilisent l'ancienne signature. Fichier complet mis à jour :

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const publishJSONMock = vi.fn();

// Pattern identique à celui validé au sous-projet 2 (ocr.test.ts,
// extraire.test.ts) pour contourner le hoisting de vi.mock : une classe
// avec un getter, plutôt que vi.fn().mockImplementation() qui lirait
// publishJSONMock avant son initialisation.
vi.mock("@upstash/qstash", () => ({
  Client: class {
    get publishJSON() {
      return publishJSONMock;
    }
  },
}));

import { mettreEnFileTraitementDao } from "./file-attente";

describe("mettreEnFileTraitementDao", () => {
  const urlOriginale = process.env.APP_URL;
  const fichiers = [{ cheminStockage: "ent-1/appels-offres/ao-1-0-dao.pdf", mimeType: "application/pdf" }];

  beforeEach(() => {
    publishJSONMock.mockReset();
    publishJSONMock.mockResolvedValue({ messageId: "msg-1" });
  });

  afterEach(() => {
    if (urlOriginale === undefined) {
      delete process.env.APP_URL;
    } else {
      process.env.APP_URL = urlOriginale;
    }
  });

  it("publie un message QStash avec l'id de l'AO et la liste des fichiers", async () => {
    await mettreEnFileTraitementDao("ao-1", fichiers);

    expect(publishJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { appelOffresId: "ao-1", fichiers },
      }),
    );
  });

  it("publie plusieurs fichiers dans l'ordre fourni", async () => {
    const plusieursFichiers = [
      { cheminStockage: "ent-1/appels-offres/ao-1-0-aao.pdf", mimeType: "application/pdf" },
      { cheminStockage: "ent-1/appels-offres/ao-1-1-dpao.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    ];

    await mettreEnFileTraitementDao("ao-1", plusieursFichiers);

    expect(publishJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { appelOffresId: "ao-1", fichiers: plusieursFichiers },
      }),
    );
  });

  it("cible /api/dao/traiter sur APP_URL quand elle est définie", async () => {
    process.env.APP_URL = "https://ao-pilot-nine.vercel.app";

    await mettreEnFileTraitementDao("ao-1", fichiers);

    expect(publishJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://ao-pilot-nine.vercel.app/api/dao/traiter",
      }),
    );
  });

  it("retombe sur localhost:3000 quand APP_URL est absente", async () => {
    delete process.env.APP_URL;

    await mettreEnFileTraitementDao("ao-1", fichiers);

    expect(publishJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://localhost:3000/api/dao/traiter",
      }),
    );
  });
});
```

- [ ] **Step 3: Lancer les tests, vérifier le succès**

Run: `npx vitest run lib/appels-offres/file-attente.test.ts`
Expected: PASS (4/4 tests)

- [ ] **Step 4: Mettre à jour le parsing du corps de la requête dans `route.ts`**

Dans `app/api/dao/traiter/route.ts`, le bloc actuel :

```ts
  let appelOffresId: string;
  let mimeType: string;
  try {
    ({ appelOffresId, mimeType } = JSON.parse(corpsBrut) as {
      appelOffresId: string;
      mimeType: string;
    });
  } catch {
    return new Response("Corps de requête invalide", { status: 400 });
  }

  const supabase = createServiceRoleClient();

  try {
    await traiterDao(supabase, appelOffresId, mimeType);
  } catch (erreur) {
```

devient :

```ts
  let appelOffresId: string;
  let fichiers: { cheminStockage: string; mimeType: string }[];
  try {
    ({ appelOffresId, fichiers } = JSON.parse(corpsBrut) as {
      appelOffresId: string;
      fichiers: { cheminStockage: string; mimeType: string }[];
    });
  } catch {
    return new Response("Corps de requête invalide", { status: 400 });
  }

  const supabase = createServiceRoleClient();

  try {
    await traiterDao(supabase, appelOffresId, fichiers);
  } catch (erreur) {
```

Le reste du fichier (vérification de signature QStash, `maxDuration`,
gestion d'erreur, réponse finale) reste inchangé.

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: deux erreurs attendues à ce stade, toutes deux résolues par des
tasks ultérieures — pas dans `file-attente.ts`/`file-attente.test.ts`
eux-mêmes, qui doivent rester propres :
- `app/api/dao/traiter/route.ts:62` — l'appel `traiterDao(supabase, appelOffresId, fichiers)`
  passe désormais un tableau, mais `traiterDao` (encore inchangée)
  attend toujours un `mimeType: string` en 3ᵉ paramètre. Résolu par
  Task 4 (qui change la signature de `traiterDao` pour accepter ce
  tableau).
- `lib/appels-offres/actions.ts` — l'appel
  `mettreEnFileTraitementDao(appelOffresId, fichier.type)` passe encore
  une chaîne, mais `mettreEnFileTraitementDao` attend désormais un
  tableau `FichierATraiter[]`. Résolu par Task 5.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/file-attente.ts lib/appels-offres/file-attente.test.ts "app/api/dao/traiter/route.ts"
git commit -m "feat: message QStash multi-fichiers pour le traitement DAO"
```

---

### Task 4: `traiterDao` — classification, concaténation, orchestration

**Files:**
- Modify: `lib/appels-offres/traitement.ts`
- Modify: `lib/appels-offres/traitement.test.ts`

**Interfaces:**
- Consumes:
  - `classifierTypeFichierDao(markdown: string): TypeFichierDao`, `assemblerDaoMarkdown(fichiersClasses: FichierClasse[]): string` depuis `./normalisation/classification-fichier` (Task 1).
  - `type FichierATraiter` depuis `./file-attente` (Task 3).
- Produces (consommé par Task 5) :
  - `export async function traiterDao(supabase: SupabaseClient, appelOffresId: string, fichiers: FichierATraiter[]): Promise<void>` (signature changée : le 3ᵉ paramètre était `mimeType: string`, devient `fichiers: FichierATraiter[]`).

- [ ] **Step 1: Réécrire `traiterDao`**

Remplacer l'intégralité de `lib/appels-offres/traitement.ts` par :

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliserDao } from "./normalisation/normaliser";
import { decouperParSection } from "./normalisation/markdown";
import { extraireInformationsAo } from "./normalisation/extraire";
import { classifierTypeFichierDao, assemblerDaoMarkdown } from "./normalisation/classification-fichier";
import type { AppelOffres } from "./types";
import type { FichierATraiter } from "./file-attente";

export async function traiterDao(
  supabase: SupabaseClient,
  appelOffresId: string,
  fichiers: FichierATraiter[],
): Promise<void> {
  const { data, error: erreurLecture } = await supabase
    .from("appel_offres")
    .select("*")
    .eq("id", appelOffresId)
    .maybeSingle();

  if (erreurLecture || !data) {
    throw new Error(`Appel d'offres introuvable : ${appelOffresId}`);
  }

  const appelOffres = data as AppelOffres;

  if (appelOffres.statut_traitement === "termine") {
    return;
  }

  try {
    let markdown = appelOffres.dao_markdown;

    if (!markdown) {
      if (fichiers.length === 0) {
        throw new Error("Aucun fichier DAO associé à cet appel d'offres.");
      }

      const { error: erreurStatutNormalisation } = await supabase
        .from("appel_offres")
        .update({ statut_traitement: "normalisation" })
        .eq("id", appelOffresId);

      if (erreurStatutNormalisation) {
        throw new Error("Échec de la mise à jour du statut 'normalisation'.");
      }

      const fichiersNormalises: { fichier: FichierATraiter; markdown: string }[] = [];

      for (const fichier of fichiers) {
        const { data: fichierData, error: erreurTelechargement } = await supabase.storage
          .from("documents")
          .download(fichier.cheminStockage);

        if (erreurTelechargement || !fichierData) {
          throw new Error(
            `Échec du téléchargement du fichier DAO depuis le stockage : ${fichier.cheminStockage}.`,
          );
        }

        const buffer = Buffer.from(await fichierData.arrayBuffer());
        const resultat = await normaliserDao(buffer, fichier.mimeType);
        fichiersNormalises.push({ fichier, markdown: resultat.markdown });
      }

      // Un seul fichier : comportement identique à avant l'introduction du
      // multi-fichiers, aucune classification — élimine tout risque qu'un
      // faux négatif de classification supprime du contenu sur le cas
      // majoritaire.
      if (fichiersNormalises.length === 1) {
        markdown = fichiersNormalises[0].markdown;
      } else {
        const fichiersClasses = fichiersNormalises.map(({ markdown: md }) => ({
          type: classifierTypeFichierDao(md),
          markdown: md,
        }));
        markdown = assemblerDaoMarkdown(fichiersClasses);

        // Best-effort : affichage seulement, ne doit jamais faire échouer
        // un traitement par ailleurs réussi. Le fichier d'indice 0
        // correspond à appel_offres.fichier_dao_path, jamais à une ligne
        // de fichier_dao_supplementaire — on ne met à jour que les
        // fichiers 2+.
        for (let i = 1; i < fichiersClasses.length; i++) {
          const { error: erreurClassification } = await supabase
            .from("fichier_dao_supplementaire")
            .update({ type_classifie: fichiersClasses[i].type })
            .eq("appel_offres_id", appelOffresId)
            .eq("chemin_stockage", fichiers[i].cheminStockage);

          if (erreurClassification) {
            console.error(
              "Échec de l'enregistrement du type classifié (best-effort) :",
              erreurClassification.message,
            );
          }
        }
      }

      const { error: erreurEnregistrementMarkdown } = await supabase
        .from("appel_offres")
        .update({ dao_markdown: markdown })
        .eq("id", appelOffresId);

      if (erreurEnregistrementMarkdown) {
        throw new Error("Échec de l'enregistrement du markdown normalisé.");
      }
    }

    const { error: erreurStatutExtraction } = await supabase
      .from("appel_offres")
      .update({ statut_traitement: "extraction" })
      .eq("id", appelOffresId);

    if (erreurStatutExtraction) {
      throw new Error("Échec de la mise à jour du statut 'extraction'.");
    }

    const sections = decouperParSection(markdown);
    const extraction = await extraireInformationsAo(sections);

    const { error: erreurSuppressionExigences } = await supabase
      .from("exigence_ao")
      .delete()
      .eq("appel_offres_id", appelOffresId);

    if (erreurSuppressionExigences) {
      throw new Error("Échec de la suppression des exigences existantes.");
    }

    if (extraction.exigences.length > 0) {
      const { error: erreurInsertion } = await supabase.from("exigence_ao").insert(
        extraction.exigences.map((exigence) => ({
          appel_offres_id: appelOffresId,
          type_exigence: exigence.type_exigence,
          libelle: exigence.libelle,
          description: exigence.description,
          ponderation: exigence.ponderation,
          source_section: exigence.source_section,
        })),
      );

      if (erreurInsertion) {
        throw new Error(`Échec de l'insertion des exigences : ${erreurInsertion.message}`);
      }
    }

    const { error: erreurMiseAJourFinale } = await supabase
      .from("appel_offres")
      .update({
        titre: extraction.titre,
        acheteur: extraction.acheteur,
        secteur: extraction.secteur,
        date_limite: extraction.date_limite,
        montant_caution: extraction.montant_caution,
        sommaire_attendu: extraction.sommaire_attendu,
        statut_traitement: "termine",
      })
      .eq("id", appelOffresId);

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
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    await supabase
      .from("appel_offres")
      .update({ statut_traitement: "erreur", erreur_traitement: message })
      .eq("id", appelOffresId);
    throw erreur;
  }
}
```

- [ ] **Step 2: Mettre à jour la suite de tests existante — fake Supabase et
  tous les appels à `traiterDao`**

`lib/appels-offres/traitement.test.ts` : `creerSupabaseFake` doit gérer la
nouvelle table `fichier_dao_supplementaire` (méthode `update` requise par
le bloc de classification best-effort ci-dessus), et **tous** les 7
appels existants à `traiterDao(supabase, "ao-1", "application/pdf")`
doivent passer un tableau `FichierATraiter[]` d'un seul élément au lieu
d'une chaîne `mimeType`. Fichier complet mis à jour :

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./normalisation/normaliser", () => ({
  normaliserDao: vi.fn(),
}));
vi.mock("./normalisation/extraire", () => ({
  extraireInformationsAo: vi.fn(),
}));

import { traiterDao } from "./traitement";
import { normaliserDao } from "./normalisation/normaliser";
import { extraireInformationsAo } from "./normalisation/extraire";
import type { AppelOffres } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

const UN_SEUL_FICHIER = [
  { cheminStockage: "ent-1/appels-offres/ao-1-0-dao.pdf", mimeType: "application/pdf" },
];

function creerAppelOffresBase(overrides: Partial<AppelOffres> = {}): AppelOffres {
  return {
    id: "ao-1",
    entreprise_id: "ent-1",
    titre: null,
    acheteur: null,
    secteur: null,
    date_limite: null,
    montant_caution: null,
    contact_retrait: null,
    statut_pipeline: "identifie",
    statut_traitement: "en_attente",
    erreur_traitement: null,
    fichier_dao_path: "ent-1/appels-offres/ao-1-0-dao.pdf",
    fichier_dao_nom_original: "dao.pdf",
    modele_cv_path: null,
    modele_cv_nom_original: null,
    modele_cv_markdown: null,
    dao_markdown: null,
    sommaire_attendu: null,
    assigne_a: null,
    created_by: "user-1",
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

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
  const fichiersClassifies: { appelOffresId: string; cheminStockage: string; type: unknown }[] = [];

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

  const fichierDaoSupplementaireTable = {
    update: (valeurs: Record<string, unknown>) => ({
      eq: (_colonne1: string, appelOffresId: string) => ({
        eq: async (_colonne2: string, cheminStockage: string) => {
          fichiersClassifies.push({
            appelOffresId,
            cheminStockage,
            type: valeurs.type_classifie,
          });
          return { error: null };
        },
      }),
    }),
  };

  const fake = {
    from: (table: string) => {
      if (table === "appel_offres") return appelOffresTable;
      if (table === "dossier_reponse") return dossierReponseTable;
      if (table === "fichier_dao_supplementaire") return fichierDaoSupplementaireTable;
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
    fichiersClassifies,
  };
}

describe("traiterDao", () => {
  beforeEach(() => {
    vi.mocked(normaliserDao).mockReset();
    vi.mocked(extraireInformationsAo).mockReset();
  });

  it("exécute normalisation puis extraction pour un AO en attente, et marque terminé", async () => {
    const appelOffres = creerAppelOffresBase();
    const { supabase, misAJour, exigencesInserees } = creerSupabaseFake(appelOffres);

    vi.mocked(normaliserDao).mockResolvedValue({
      markdown: "## AVIS D'APPEL D'OFFRES\nContenu.",
      sections: [{ titre: "AVIS D'APPEL D'OFFRES", contenu: "Contenu." }],
      sourceOcr: false,
    });
    vi.mocked(extraireInformationsAo).mockResolvedValue({
      titre: "Construction d'un pont",
      acheteur: "Ministère X",
      secteur: "BTP",
      date_limite: "2026-11-03T12:00:00Z",
      montant_caution: 5000000,
      sommaire_attendu: ["Méthodologie"],
      exigences: [
        {
          type_exigence: "piece_requise",
          libelle: "RCCM",
          description: null,
          ponderation: null,
          source_section: "DPAO",
        },
      ],
    });

    await traiterDao(supabase, "ao-1", UN_SEUL_FICHIER);

    expect(normaliserDao).toHaveBeenCalledTimes(1);
    expect(extraireInformationsAo).toHaveBeenCalledTimes(1);
    expect(exigencesInserees).toHaveLength(1);
    expect(exigencesInserees[0]).toHaveLength(1);
    expect(misAJour.some((m) => m.statut_traitement === "normalisation")).toBe(true);
    expect(misAJour.some((m) => m.statut_traitement === "extraction")).toBe(true);
    expect(misAJour.at(-1)?.statut_traitement).toBe("termine");
  });

  it("reprend directement à l'extraction si dao_markdown est déjà rempli", async () => {
    const appelOffres = creerAppelOffresBase({
      statut_traitement: "extraction",
      dao_markdown: "## AVIS D'APPEL D'OFFRES\nContenu déjà normalisé.",
    });
    const { supabase } = creerSupabaseFake(appelOffres);

    vi.mocked(extraireInformationsAo).mockResolvedValue({
      titre: null,
      acheteur: null,
      secteur: null,
      date_limite: null,
      montant_caution: null,
      sommaire_attendu: [],
      exigences: [],
    });

    await traiterDao(supabase, "ao-1", UN_SEUL_FICHIER);

    expect(normaliserDao).not.toHaveBeenCalled();
    expect(extraireInformationsAo).toHaveBeenCalledTimes(1);
  });

  it("ne fait rien si le statut est déjà 'termine' (idempotence)", async () => {
    const appelOffres = creerAppelOffresBase({ statut_traitement: "termine" });
    const { supabase } = creerSupabaseFake(appelOffres);

    await traiterDao(supabase, "ao-1", UN_SEUL_FICHIER);

    expect(normaliserDao).not.toHaveBeenCalled();
    expect(extraireInformationsAo).not.toHaveBeenCalled();
  });

  it("écrit statut_traitement='erreur' et relance l'exception en cas d'échec", async () => {
    const appelOffres = creerAppelOffresBase();
    const { supabase, misAJour } = creerSupabaseFake(appelOffres);

    vi.mocked(normaliserDao).mockRejectedValue(new Error("échec normalisation"));

    await expect(traiterDao(supabase, "ao-1", UN_SEUL_FICHIER)).rejects.toThrow(
      "échec normalisation",
    );

    const derniereMiseAJour = misAJour.at(-1);
    expect(derniereMiseAJour?.statut_traitement).toBe("erreur");
    expect(derniereMiseAJour?.erreur_traitement).toBe("échec normalisation");
  });

  it("écrit statut_traitement='erreur' et relance l'exception si la mise à jour finale échoue en base", async () => {
    const appelOffres = creerAppelOffresBase();
    const { supabase, misAJour } = creerSupabaseFake(appelOffres, {
      echouerMiseAJourFinale: true,
    });

    vi.mocked(normaliserDao).mockResolvedValue({
      markdown: "## AVIS D'APPEL D'OFFRES\nContenu.",
      sections: [{ titre: "AVIS D'APPEL D'OFFRES", contenu: "Contenu." }],
      sourceOcr: false,
    });
    vi.mocked(extraireInformationsAo).mockResolvedValue({
      titre: "Construction d'un pont",
      acheteur: "Ministère X",
      secteur: "BTP",
      date_limite: "2026-11-03T12:00:00Z",
      montant_caution: 5000000,
      sommaire_attendu: ["Méthodologie"],
      exigences: [],
    });

    await expect(traiterDao(supabase, "ao-1", UN_SEUL_FICHIER)).rejects.toThrow(
      "Échec de la mise à jour finale de l'appel d'offres.",
    );

    const derniereMiseAJour = misAJour.at(-1);
    expect(derniereMiseAJour?.statut_traitement).toBe("erreur");
    expect(derniereMiseAJour?.erreur_traitement).toBe(
      "Échec de la mise à jour finale de l'appel d'offres.",
    );
  });

  it("crée un dossier_reponse une fois le traitement terminé", async () => {
    const appelOffres = creerAppelOffresBase();
    const { supabase, dossierReponseInsere } = creerSupabaseFake(appelOffres);

    vi.mocked(normaliserDao).mockResolvedValue({
      markdown: "## AVIS D'APPEL D'OFFRES\nContenu.",
      sections: [{ titre: "AVIS D'APPEL D'OFFRES", contenu: "Contenu." }],
      sourceOcr: false,
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

    await traiterDao(supabase, "ao-1", UN_SEUL_FICHIER);

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
      sourceOcr: false,
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
      traiterDao(supabase, "ao-1", UN_SEUL_FICHIER),
    ).resolves.toBeUndefined();

    expect(misAJour.at(-1)?.statut_traitement).toBe("termine");
  });

  it("classe et concatène plusieurs fichiers en ordre canonique avant l'extraction", async () => {
    const appelOffres = creerAppelOffresBase();
    const { supabase, misAJour, fichiersClassifies } = creerSupabaseFake(appelOffres);

    // Le premier appel normaliserDao correspond au fichier DPAO (uploadé
    // en premier dans le tableau `fichiers` ci-dessous), le second à
    // l'AAO — l'ordre de sortie doit malgré tout suivre l'ordre
    // canonique (AAO avant DPAO), pas l'ordre d'upload.
    vi.mocked(normaliserDao)
      .mockResolvedValueOnce({
        markdown: "## Données Particulières de l'Appel d'Offres\nContenu DPAO.",
        sections: [],
        sourceOcr: false,
      })
      .mockResolvedValueOnce({
        markdown: "## Avis d'Appel d'Offres\nContenu AAO.",
        sections: [],
        sourceOcr: false,
      });
    vi.mocked(extraireInformationsAo).mockResolvedValue({
      titre: null,
      acheteur: null,
      secteur: null,
      date_limite: null,
      montant_caution: null,
      sommaire_attendu: [],
      exigences: [],
    });

    await traiterDao(supabase, "ao-1", [
      { cheminStockage: "ent-1/appels-offres/ao-1-0-dpao.pdf", mimeType: "application/pdf" },
      { cheminStockage: "ent-1/appels-offres/ao-1-1-aao.pdf", mimeType: "application/pdf" },
    ]);

    expect(normaliserDao).toHaveBeenCalledTimes(2);

    const miseAJourMarkdown = misAJour.find((m) => "dao_markdown" in m);
    const markdownEnregistre = miseAJourMarkdown?.dao_markdown as string;
    expect(markdownEnregistre.indexOf("Contenu AAO")).toBeLessThan(
      markdownEnregistre.indexOf("Contenu DPAO"),
    );

    // Seul le fichier d'indice 1 (le second) est un fichier "supplémentaire" —
    // celui d'indice 0 correspond à appel_offres.fichier_dao_path, jamais
    // mis à jour dans fichier_dao_supplementaire.
    expect(fichiersClassifies).toHaveLength(1);
    expect(fichiersClassifies[0]).toEqual({
      appelOffresId: "ao-1",
      cheminStockage: "ent-1/appels-offres/ao-1-1-aao.pdf",
      type: "aao",
    });
  });

  it("exclut un fichier classé bpu de dao_markdown", async () => {
    const appelOffres = creerAppelOffresBase();
    const { supabase, misAJour } = creerSupabaseFake(appelOffres);

    vi.mocked(normaliserDao)
      .mockResolvedValueOnce({
        markdown: "## Avis d'Appel d'Offres\nContenu AAO.",
        sections: [],
        sourceOcr: false,
      })
      .mockResolvedValueOnce({
        markdown: "## Bordereau des Prix Unitaires\nContenu BPU.",
        sections: [],
        sourceOcr: false,
      });
    vi.mocked(extraireInformationsAo).mockResolvedValue({
      titre: null,
      acheteur: null,
      secteur: null,
      date_limite: null,
      montant_caution: null,
      sommaire_attendu: [],
      exigences: [],
    });

    await traiterDao(supabase, "ao-1", [
      { cheminStockage: "ent-1/appels-offres/ao-1-0-aao.pdf", mimeType: "application/pdf" },
      { cheminStockage: "ent-1/appels-offres/ao-1-1-bpu.pdf", mimeType: "application/pdf" },
    ]);

    const miseAJourMarkdown = misAJour.find((m) => "dao_markdown" in m);
    expect(miseAJourMarkdown?.dao_markdown).not.toContain("Contenu BPU");
  });
});
```

- [ ] **Step 3: Lancer les tests, vérifier le succès**

Run: `npx vitest run lib/appels-offres/traitement.test.ts`
Expected: PASS (9/9 tests)

- [ ] **Step 4: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: une seule erreur restante, dans `lib/appels-offres/actions.ts`
(`mettreEnFileTraitementDao(appelOffresId, fichier.type)` — non résolue
avant Task 5). L'erreur précédente sur `app/api/dao/traiter/route.ts`
(Task 3) doit avoir disparu : `traiterDao` accepte maintenant un tableau,
et route.ts lui en passait déjà un. Aucune nouvelle erreur ne doit
apparaître dans `traitement.ts`/`traitement.test.ts` eux-mêmes.

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/traitement.ts lib/appels-offres/traitement.test.ts
git commit -m "feat: classification et concaténation en ordre canonique dans traiterDao"
```

---

### Task 5: `televerserDao` — upload multi-fichiers

**Files:**
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes:
  - `televerserDaoSchema` (Task 2) — `{ fichiers: File[] }`.
  - `construireCheminStockageDao(entrepriseId, appelOffresId, nomFichierOriginal, index?)` (Task 2).
  - `mettreEnFileTraitementDao(appelOffresId, fichiers: FichierATraiter[])`, `type FichierATraiter` (Task 3).
- Produces: aucune nouvelle interface exportée — `televerserDao` garde
  exactement sa signature actuelle
  (`(formData: FormData) => Promise<{ erreur: string } | { succes: true; appelOffresId: string }>`),
  consommée sans changement par `televerser-dao-dialog.tsx` (Task 7).

- [ ] **Step 1: Ajouter l'import du type `FichierATraiter`**

Dans `lib/appels-offres/actions.ts`, la ligne d'import existante
`import { mettreEnFileTraitementDao } from "./file-attente";` devient :

```ts
import { mettreEnFileTraitementDao, type FichierATraiter } from "./file-attente";
```

- [ ] **Step 2: Réécrire `televerserDao`**

La fonction actuelle (lignes 61-150 de `actions.ts`) :

```ts
export async function televerserDao(
  formData: FormData,
): Promise<{ erreur: string } | { succes: true; appelOffresId: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = televerserDaoSchema.safeParse({
    fichier: formData.get("fichier"),
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Fichier invalide" };
  }

  const { fichier } = parsed.data;
  const appelOffresId = randomUUID();
  const cheminStockage = construireCheminStockageDao(
    utilisateur.entreprise_id,
    appelOffresId,
    fichier.name,
  );

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, fichier, { contentType: fichier.type });

  if (erreurUpload) {
    return { erreur: "Échec de l'envoi du fichier. Réessayez." };
  }

  const { error: erreurInsertion } = await supabase.from("appel_offres").insert({
    id: appelOffresId,
    entreprise_id: utilisateur.entreprise_id,
    fichier_dao_path: cheminStockage,
    fichier_dao_nom_original: fichier.name,
    created_by: utilisateur.id,
  });

  if (erreurInsertion) {
    const { error: erreurSuppressionFichier } = await supabase.storage
      .from("documents")
      .remove([cheminStockage]);

    if (erreurSuppressionFichier) {
      console.error(
        "Échec de la suppression du fichier DAO après échec d'insertion appel_offres. " +
          "Fichier orphelin dans le stockage.",
        { cheminStockage, erreur: erreurSuppressionFichier.message },
      );
    }

    return { erreur: "Échec de l'enregistrement de l'appel d'offres. Réessayez." };
  }

  try {
    await mettreEnFileTraitementDao(appelOffresId, fichier.type);
  } catch {
    const { error: erreurSuppression } = await supabase
      .from("appel_offres")
      .delete()
      .eq("id", appelOffresId);

    if (erreurSuppression) {
      console.error(
        "Échec du rollback appel_offres après échec de mise en file. " +
          "Ligne orpheline à nettoyer manuellement.",
        { appelOffresId, erreur: erreurSuppression.message },
      );
    } else {
      const { error: erreurSuppressionFichier } = await supabase.storage
        .from("documents")
        .remove([cheminStockage]);

      if (erreurSuppressionFichier) {
        console.error(
          "Échec de la suppression du fichier DAO après rollback appel_offres. " +
            "Fichier orphelin dans le stockage.",
          { cheminStockage, erreur: erreurSuppressionFichier.message },
        );
      }
    }

    return { erreur: "Échec de la mise en file du traitement. Réessayez." };
  }

  revalidatePath("/appels-offres");
  return { succes: true as const, appelOffresId };
}
```

devient :

```ts
export async function televerserDao(
  formData: FormData,
): Promise<{ erreur: string } | { succes: true; appelOffresId: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = televerserDaoSchema.safeParse({
    fichiers: formData.getAll("fichier"),
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Fichier invalide" };
  }

  const { fichiers } = parsed.data;
  const appelOffresId = randomUUID();
  const supabase = await createClient();

  const cheminsFichiers = fichiers.map((fichier, index) =>
    construireCheminStockageDao(utilisateur.entreprise_id, appelOffresId, fichier.name, index),
  );

  const cheminsUploades: string[] = [];

  for (let i = 0; i < fichiers.length; i++) {
    const { error: erreurUpload } = await supabase.storage
      .from("documents")
      .upload(cheminsFichiers[i], fichiers[i], { contentType: fichiers[i].type });

    if (erreurUpload) {
      if (cheminsUploades.length > 0) {
        await supabase.storage.from("documents").remove(cheminsUploades);
      }
      return { erreur: "Échec de l'envoi du fichier. Réessayez." };
    }
    cheminsUploades.push(cheminsFichiers[i]);
  }

  const { error: erreurInsertion } = await supabase.from("appel_offres").insert({
    id: appelOffresId,
    entreprise_id: utilisateur.entreprise_id,
    fichier_dao_path: cheminsFichiers[0],
    fichier_dao_nom_original: fichiers[0].name,
    created_by: utilisateur.id,
  });

  if (erreurInsertion) {
    const { error: erreurSuppressionFichiers } = await supabase.storage
      .from("documents")
      .remove(cheminsUploades);

    if (erreurSuppressionFichiers) {
      console.error(
        "Échec de la suppression des fichiers DAO après échec d'insertion appel_offres. " +
          "Fichiers orphelins dans le stockage.",
        { cheminsUploades, erreur: erreurSuppressionFichiers.message },
      );
    }

    return { erreur: "Échec de l'enregistrement de l'appel d'offres. Réessayez." };
  }

  if (fichiers.length > 1) {
    const { error: erreurFichiersSupplementaires } = await supabase
      .from("fichier_dao_supplementaire")
      .insert(
        fichiers.slice(1).map((fichier, index) => ({
          appel_offres_id: appelOffresId,
          chemin_stockage: cheminsFichiers[index + 1],
          nom_original: fichier.name,
          type_mime: fichier.type,
          ordre: index + 1,
          created_by: utilisateur.id,
        })),
      );

    if (erreurFichiersSupplementaires) {
      await supabase.from("appel_offres").delete().eq("id", appelOffresId);
      const { error: erreurSuppressionFichiers } = await supabase.storage
        .from("documents")
        .remove(cheminsUploades);

      if (erreurSuppressionFichiers) {
        console.error(
          "Échec de la suppression des fichiers DAO après échec d'insertion fichier_dao_supplementaire. " +
            "Fichiers orphelins dans le stockage.",
          { cheminsUploades, erreur: erreurSuppressionFichiers.message },
        );
      }

      return { erreur: "Échec de l'enregistrement des fichiers du DAO. Réessayez." };
    }
  }

  try {
    const fichiersATraiter: FichierATraiter[] = fichiers.map((fichier, index) => ({
      cheminStockage: cheminsFichiers[index],
      mimeType: fichier.type,
    }));
    await mettreEnFileTraitementDao(appelOffresId, fichiersATraiter);
  } catch {
    const { error: erreurSuppression } = await supabase
      .from("appel_offres")
      .delete()
      .eq("id", appelOffresId);

    if (erreurSuppression) {
      console.error(
        "Échec du rollback appel_offres après échec de mise en file. " +
          "Ligne orpheline à nettoyer manuellement.",
        { appelOffresId, erreur: erreurSuppression.message },
      );
    } else {
      const { error: erreurSuppressionFichiers } = await supabase.storage
        .from("documents")
        .remove(cheminsUploades);

      if (erreurSuppressionFichiers) {
        console.error(
          "Échec de la suppression des fichiers DAO après rollback appel_offres. " +
            "Fichiers orphelins dans le stockage.",
          { cheminsUploades, erreur: erreurSuppressionFichiers.message },
        );
      }
    }

    return { erreur: "Échec de la mise en file du traitement. Réessayez." };
  }

  revalidatePath("/appels-offres");
  return { succes: true as const, appelOffresId };
}
```

(La table `fichier_dao_supplementaire` n'a pas de `on delete cascade` à
déclencher ici : au moment où `erreurFichiersSupplementaires` survient,
l'insertion elle-même a échoué, donc `delete().eq("id", appelOffresId)`
sur `appel_offres` suffit — aucune ligne `fichier_dao_supplementaire`
n'a été créée pour ce lot, `on delete cascade` n'a rien à nettoyer.)

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur dans `lib/appels-offres/actions.ts`. Si une
erreur apparaît ailleurs dans ce fichier (fonctions non liées à ce
sous-projet), s'assurer qu'elle préexistait avant ce changement — sinon,
corriger.

- [ ] **Step 4: Lancer la suite de tests complète (non-régression)**

Run: `npx vitest run`
Expected: tous les tests passent (aucun test direct sur `televerserDao`
dans ce projet — cette étape vérifie qu'aucun autre fichier n'a régressé).

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/actions.ts
git commit -m "feat: upload multi-fichiers dans televerserDao"
```

---

### Task 6: Lecture des fichiers supplémentaires d'un AO

**Files:**
- Modify: `lib/appels-offres/queries.ts`

**Interfaces:**
- Consumes: `type FichierDaoSupplementaire` depuis `./types` (Task 1).
- Produces (consommé par Task 8) : `obtenirAppelOffres` retourne
  désormais aussi `fichiersSupplementaires: FichierDaoSupplementaire[]`
  dans son objet résultat.

- [ ] **Step 1: Étendre le type de retour et ajouter la requête**

Dans `lib/appels-offres/queries.ts`, la signature actuelle de
`obtenirAppelOffres` :

```ts
export async function obtenirAppelOffres(
  id: string,
  entrepriseId: string,
): Promise<{
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  dossierReponse: DossierReponse;
  documentsParExigence: Record<string, Document[]>;
  sections: SectionDossier[];
  documentsParSection: Record<string, Document[]>;
} | null> {
  const supabase = await createClient();

  const { data: appelOffres, error: erreurAppelOffres } = await supabase
    .from("appel_offres")
    .select("*")
    .eq("id", id)
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (erreurAppelOffres || !appelOffres) return null;
```

devient :

```ts
export async function obtenirAppelOffres(
  id: string,
  entrepriseId: string,
): Promise<{
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  dossierReponse: DossierReponse;
  documentsParExigence: Record<string, Document[]>;
  sections: SectionDossier[];
  documentsParSection: Record<string, Document[]>;
  fichiersSupplementaires: FichierDaoSupplementaire[];
} | null> {
  const supabase = await createClient();

  const { data: appelOffres, error: erreurAppelOffres } = await supabase
    .from("appel_offres")
    .select("*")
    .eq("id", id)
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (erreurAppelOffres || !appelOffres) return null;

  const { data: fichiersSupplementaires, error: erreurFichiers } = await supabase
    .from("fichier_dao_supplementaire")
    .select("*")
    .eq("appel_offres_id", id)
    .order("ordre", { ascending: true });

  if (erreurFichiers) throw erreurFichiers;
```

Ajouter `FichierDaoSupplementaire` à l'import de types déjà présent en
tête du fichier (`import type { ..., } from "./types";` — ajouter
`FichierDaoSupplementaire` à la liste des types importés).

- [ ] **Step 2: Ajouter le champ à l'objet retourné**

Trouver la fin de la fonction (le `return { ... }` final de
`obtenirAppelOffres`, après le calcul de `documentsParSection`) et
ajouter `fichiersSupplementaires: (fichiersSupplementaires ?? []) as FichierDaoSupplementaire[],`
à l'objet retourné, aux côtés des champs déjà présents
(`appelOffres`, `exigences`, `dossierReponse`, `documentsParExigence`,
`sections`, `documentsParSection`).

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: **aucune erreur nulle part.** `AppelOffresDetail` ne connaît pas
encore de prop `fichiersSupplementaires` (elle n'est ajoutée à son
interface qu'en Task 8) — `resultat.fichiersSupplementaires` existe
simplement sans être consommé par personne pour l'instant, ce qui ne
casse rien. `page.tsx` n'est pas modifié par cette task.

- [ ] **Step 4: Commit**

```bash
git add lib/appels-offres/queries.ts
git commit -m "feat: lecture des fichiers DAO supplémentaires dans obtenirAppelOffres"
```

---

### Task 7: Interface — sélection multiple à l'upload

**Files:**
- Modify: `app/(app)/appels-offres/televerser-dao-dialog.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `televerserDao(formData: FormData)` (signature inchangée,
  déjà mise à jour côté serveur en Task 5 — ce composant n'a besoin
  d'aucune connaissance du changement de schéma, `FormData` porte déjà
  tous les fichiers sous la même clé `"fichier"`).
- Produces: aucune nouvelle interface — composant terminal de l'arbre UI.

- [ ] **Step 1: Ajouter l'attribut `multiple` au champ fichier**

Dans `app/(app)/appels-offres/televerser-dao-dialog.tsx`, le champ
actuel :

```tsx
            <Input
              id="fichier"
              name="fichier"
              type="file"
              accept=".pdf,.docx"
              required
              disabled={envoi}
            />
```

devient :

```tsx
            <Input
              id="fichier"
              name="fichier"
              type="file"
              accept=".pdf,.docx"
              multiple
              required
              disabled={envoi}
            />
```

Rien d'autre ne change dans ce fichier : `new FormData(event.currentTarget)`
capture déjà tous les fichiers sélectionnés sous la clé `"fichier"`
(le navigateur associe automatiquement chaque fichier choisi au même
champ `name`), et `televerserDao(formData)` (Task 5) lit désormais
`formData.getAll("fichier")` côté serveur.

- [ ] **Step 2: Mettre à jour le libellé du champ (FR)**

Dans `messages/fr.json`, dans le bloc `"AppelsOffres" → "dialog"` (ligne
184), la clé :

```json
      "champFichier": "Fichier (PDF ou DOCX)",
```

devient :

```json
      "champFichier": "Fichier(s) (PDF ou DOCX)",
```

- [ ] **Step 3: Mettre à jour le libellé du champ (EN)**

Dans `messages/en.json`, même bloc (ligne 184), la clé :

```json
      "champFichier": "File (PDF or DOCX)",
```

devient :

```json
      "champFichier": "File(s) (PDF or DOCX)",
```

- [ ] **Step 4: Vérifier que les deux fichiers JSON restent valides**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur dans
`televerser-dao-dialog.tsx`.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/appels-offres/televerser-dao-dialog.tsx" messages/fr.json messages/en.json
git commit -m "feat: sélection multiple à l'upload du DAO"
```

---

### Task 8: Interface — liste de téléchargement multi-fichiers

**Files:**
- Modify: `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`
- Modify: `app/(app)/appels-offres/[id]/page.tsx`

**Interfaces:**
- Consumes:
  - `fichiersSupplementaires: FichierDaoSupplementaire[]` sur le résultat
    de `obtenirAppelOffres` (Task 6).
  - `genererUrlTelechargementDao(cheminStockage: string)` (Server Action
    déjà existante, inchangée — déjà importée dans
    `appel-offres-detail.tsx`).
- Produces: aucune nouvelle interface — dernier maillon de la chaîne.

- [ ] **Step 1: Transmettre `fichiersSupplementaires` depuis `page.tsx`**

Dans `app/(app)/appels-offres/[id]/page.tsx`, l'appel à
`<AppelOffresDetail ... />` (lignes 87-107) reçoit une nouvelle prop.
Le bloc actuel se termine par :

```tsx
        nomEntreprise={nomEntreprise}
        cvTransformeParDocument={cvTransformeParDocument}
      />
```

devient :

```tsx
        nomEntreprise={nomEntreprise}
        cvTransformeParDocument={cvTransformeParDocument}
        fichiersSupplementaires={resultat.fichiersSupplementaires}
      />
```

Rien d'autre ne change dans ce fichier : `resultat` (déjà déstructuré
plus haut via `obtenirAppelOffres`) porte désormais aussi
`fichiersSupplementaires`, aucune nouvelle requête à ajouter ici.

- [ ] **Step 2: Ajouter la prop et son type à `AppelOffresDetail`**

Dans `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`, l'import de
types actuel :

```tsx
import type {
  AppelOffres,
  ClePieceGroupement,
  CleChecklistManuelle,
  CvTransforme,
  EvaluationGoNoGo,
  ExigenceAo,
  JalonRetroplanning,
  LigneBpu,
  MembreGroupement,
  SectionBpu,
} from "@/lib/appels-offres/types";
```

devient :

```tsx
import type {
  AppelOffres,
  ClePieceGroupement,
  CleChecklistManuelle,
  CvTransforme,
  EvaluationGoNoGo,
  ExigenceAo,
  FichierDaoSupplementaire,
  JalonRetroplanning,
  LigneBpu,
  MembreGroupement,
  SectionBpu,
} from "@/lib/appels-offres/types";
```

La signature du composant (déstructuration des props + interface des
props) :

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
  tauxFraisStructureDefaut,
  groupement,
  nomEntreprise,
  cvTransformeParDocument: cvTransformeParDocumentInitial,
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
  cvTransformeParDocument: Record<string, CvTransforme>;
}) {
```

devient (deux ajouts : `fichiersSupplementaires` dans la déstructuration
et dans le type des props) :

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
  tauxFraisStructureDefaut,
  groupement,
  nomEntreprise,
  cvTransformeParDocument: cvTransformeParDocumentInitial,
  fichiersSupplementaires,
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
  cvTransformeParDocument: Record<string, CvTransforme>;
  fichiersSupplementaires: FichierDaoSupplementaire[];
}) {
```

- [ ] **Step 3: Généraliser `telecharger` pour prendre un chemin en paramètre**

La fonction actuelle :

```tsx
  async function telecharger() {
    if (!appelOffres.fichier_dao_path) return;
    setTelechargement(true);
    const resultat = await genererUrlTelechargementDao(appelOffres.fichier_dao_path);
    setTelechargement(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }
```

devient :

```tsx
  async function telecharger(cheminStockage: string) {
    setTelechargement(true);
    const resultat = await genererUrlTelechargementDao(cheminStockage);
    setTelechargement(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }
```

- [ ] **Step 4: Bouton unique → liste conditionnelle**

Le JSX actuel :

```tsx
        {appelOffres.fichier_dao_path && (
          <Button variant="outline" onClick={telecharger} disabled={telechargement}>
            {t("boutonTelecharger")}
          </Button>
        )}
```

devient :

```tsx
        {appelOffres.fichier_dao_path && fichiersSupplementaires.length === 0 && (
          <Button
            variant="outline"
            onClick={() => telecharger(appelOffres.fichier_dao_path!)}
            disabled={telechargement}
          >
            {t("boutonTelecharger")}
          </Button>
        )}
        {appelOffres.fichier_dao_path && fichiersSupplementaires.length > 0 && (
          <div className="flex flex-col gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => telecharger(appelOffres.fichier_dao_path!)}
              disabled={telechargement}
            >
              {appelOffres.fichier_dao_nom_original ?? t("boutonTelecharger")}
            </Button>
            {fichiersSupplementaires.map((f) => (
              <Button
                key={f.id}
                variant="outline"
                size="sm"
                onClick={() => telecharger(f.chemin_stockage)}
                disabled={telechargement}
              >
                {f.nom_original}
              </Button>
            ))}
          </div>
        )}
```

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur dans tout le projet (dernière task — tous les
fils sont désormais reconnectés).

- [ ] **Step 6: Lancer la suite de tests complète (non-régression)**

Run: `npx vitest run`
Expected: tous les tests passent.

- [ ] **Step 7: Vérification manuelle en local**

Démarrer le serveur de dev (`npm run dev`). Sur `/appels-offres`,
téléverser un DAO avec **un seul fichier** — vérifier que rien n'a
changé (bouton simple, traitement identique, `fichier_dao_path` sans
`-0-` visible côté UI puisqu'il n'est jamais affiché tel quel). Puis
téléverser un DAO avec **plusieurs fichiers** (au moins un nommé de
façon à contenir "Avis d'Appel d'Offres" en tant que titre reconnu, un
autre "Données Particulières...") : vérifier que le traitement se
termine, que `dao_markdown` (visible indirectement via les exigences
extraites) reflète bien un ordre AAO avant DPAO même si les fichiers ont
été sélectionnés dans l'ordre inverse, et que la page de détail affiche
la liste des fichiers téléchargeables (pas un bouton unique) — cliquer
sur chacun pour confirmer que le bon fichier s'ouvre.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/appels-offres/[id]/appel-offres-detail.tsx" "app/(app)/appels-offres/[id]/page.tsx"
git commit -m "feat: liste de téléchargement pour un DAO multi-fichiers"
```

---

## Self-Review (effectuée avant remise du plan)

**Couverture du spec** : sélection multiple en un geste (Task 7), classer
puis concaténer en ordre canonique (Tasks 1, 4), fichiers `bpu`/`non_classe`
exclus de `dao_markdown` (Tasks 1, 4), modèle additif avec `fichier_dao_path`
inchangé pour 1 fichier (Task 1, 5), ENUM `type_classifie` (Task 1), liste
de téléchargement dès 2+ fichiers (Task 8), garantie de non-régression au
cas à 1 fichier (Task 4, vérifiée par les tests existants de
`traitement.test.ts` conservés tels quels en comportement), erreur sur un
fichier = échec total (Task 4, tests d'échec conservés) — tout couvert.

**Cohérence des types** : `TypeFichierDao`/`TYPES_FICHIER_DAO` définis une
seule fois (Task 1), réutilisés dans `FichierDaoSupplementaire` (Task 1),
`classifierTypeFichierDao`/`assemblerDaoMarkdown` (Task 1, consommés tels
quels en Task 4). `FichierATraiter` défini une seule fois (Task 3),
consommé en Task 4 (paramètre de `traiterDao`) et Task 5 (construction du
tableau avant `mettreEnFileTraitementDao`) avec la même forme
`{ cheminStockage: string; mimeType: string }` partout — aucune divergence
de nommage de champ trouvée entre les tasks.

**Tests cassés par un changement de signature dans une task antérieure,
vérifié systématiquement** : `construireCheminStockageDao` change de
format de sortie même à `index` par défaut (Task 2 met à jour
`storage-path.test.ts`) ; `mettreEnFileTraitementDao` change de 2ᵉ
paramètre `string`→`array` (Task 3 met à jour `file-attente.test.ts`) ;
`traiterDao` change de 3ᵉ paramètre `string`→`array`, et son fake
Supabase doit gérer une nouvelle table (`fichier_dao_supplementaire`)
que le code de production appelle désormais avec `.update()` (Task 4 met
à jour `traitement.test.ts`, fake étendu, 7 tests existants adaptés + 2
nouveaux) ; `televerserDaoSchema` change de clé `fichier`→`fichiers`
(Task 2 met à jour `schema.test.ts`, 6 tests existants adaptés + 3
nouveaux). Aucun de ces quatre fichiers de test n'a été laissé dans un
état qui compilerait contre l'ancienne signature.

**Erreur trouvée et corrigée pendant la revue** : les "Expected" des
étapes `tsc --noEmit` de Tasks 2, 3, 4 et 6 affirmaient à tort des
erreurs de compilation qui n'existaient pas ou étaient mal localisées —
`z.object(...).safeParse()` prend un argument `unknown`, donc l'ancien
appel `{ fichier: ... }` contre le nouveau schéma `{ fichiers: ... }`
(Task 2) ne casse jamais la compilation, seulement la validation à
l'exécution ; `construireCheminStockageDao` gagnant un paramètre
optionnel (Task 2), tout appel à 3 arguments reste valide ; et
`fichiersSupplementaires` (Task 6) n'est consommé par aucun composant
avant Task 8, donc rien ne casse entre-temps. La seule erreur réelle
provisoire (Tasks 3-4) est `mettreEnFileTraitementDao`/`traiterDao` dont
les signatures changent de type (pas juste de forme d'objet non typé) —
localisée précisément par fichier:ligne dans les étapes corrigées.
