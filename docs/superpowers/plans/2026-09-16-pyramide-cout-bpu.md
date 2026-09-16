# Pyramide de coût par ligne (BPU) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Documenter a posteriori le prix unitaire de chaque ligne du BPU avec une pyramide de coût (déboursé sec saisi, taux de frais de structure saisi, marge calculée automatiquement), sans jamais remplacer la saisie directe du prix unitaire.

**Architecture:** Deux colonnes nullables sur `ligne_bpu` (`debourse_sec`, `taux_frais_structure`) et une colonne `taux_frais_structure_defaut` sur `entreprise` (réglage par défaut). Une fonction pure `calculerPyramideCout` dérive frais de structure/marge, jamais stockée. L'UI ajoute une ligne dépliable sur chaque ligne du BPU (pas de colonnes supplémentaires dans la table déjà dense) et une nouvelle carte de réglages entreprise.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase Postgres/RLS, Zod, next-intl, Vitest, shadcn/ui (`Card`, `Input`, `Button`), lucide-react.

## Global Constraints

- Le prix unitaire reste toujours saisi directement — la pyramide ne le remplace jamais, elle le documente.
- `debourse_sec` nullable, comme `prix_unitaire` — jamais bloquant. `calculerPyramideCout` retourne `null` si `prix_unitaire === null` **ou** `debourse_sec === null`.
- `taux_frais_structure === null` est traité comme `0` dans le calcul (frais de structure nuls), jamais confondu avec une erreur — `0` explicite et `null` produisent le même résultat numérique mais restent deux valeurs distinctes en base.
- Le taux de frais de structure s'applique au **déboursé sec**, pas au prix de vente : `fraisDeStructure = debourse_sec × (taux_frais_structure ?? 0) / 100`.
- `margePourcentage` se garde explicitement contre la division par zéro quand `prix_unitaire === 0` (retourne `0`, jamais `NaN`/`Infinity`).
- Marge négative = valeur normale du domaine, jamais rejetée par la validation, affichée en rouge côté UI, jamais un état d'erreur.
- **Pas de colonnes supplémentaires dans la table du BPU** — la pyramide vit dans une ligne dépliable (bouton chevron), repliée par défaut, aucun changement visuel pour qui ne l'utilise pas.
- **Le formulaire d'ajout de ligne (`bpu-section.tsx`) ne change pas** — il garde ses 5 champs actuels (code, désignation, unité, quantité, prix unitaire). Le préremplissage du taux par défaut se fait dans `BpuLigneRow`, au moment où on déplie une ligne pour la première fois, pas à la création de la ligne. (Résolution d'une ambiguïté du spec original : la section « Intégration dans la lecture existante » suggérait un préremplissage dans le formulaire d'ajout, incohérent avec la décision UI « ligne dépliable, pas de champs supplémentaires visibles par défaut » — cette dernière prévaut.)
- **`tauxFraisStructure` borné à `[0, 100]`** côté Zod — contrairement à `prixUnitaire`/`debourseSec`, sans borne haute.
- Aucun `disabled` sur les nouveaux `Input` (déboursé sec, taux) pendant leur propre sauvegarde — même contrainte que les champs existants du sous-projet A.
- Migration SQL créée mais **jamais poussée par l'implémenteur** (`supabase db push` interdit) — relue et appliquée séparément par le contrôleur avant le merge.
- Montants affichés via `toLocaleString("fr-FR")`, cohérent avec le reste du BPU.
- Pas de nouveau test sur les Server Actions ni les composants UI — seule `calculerPyramideCout` est testée (TDD), cohérent avec le reste du projet.

---

### Task 1: Modèle de données — migration + types

**Files:**
- Create: `supabase/migrations/20260916150000_pyramide_cout_bpu.sql`
- Modify: `lib/appels-offres/types.ts`

**Interfaces:**
- Produces: `LigneBpu` enrichi de `debourse_sec: number | null` et `taux_frais_structure: number | null` — consommé par les Tasks 2-5.

- [ ] **Step 1: Écrire la migration**

Créer `supabase/migrations/20260916150000_pyramide_cout_bpu.sql` :

```sql
-- Pyramide de coût par ligne (Module 7, sous-projet 4b). Documente a
-- posteriori le prix_unitaire déjà saisi (sous-projet 4a) : déboursé sec
-- et taux de frais de structure sont saisis, la marge est calculée côté
-- application (lib/appels-offres/bpu.ts), jamais stockée. Les colonnes de
-- ligne_bpu s'ajoutent à une table déjà couverte par les policies du
-- sous-projet 4a (20260916120000_bpu.sql) : rien à faire côté RLS pour
-- elles. entreprise en revanche n'avait jusqu'ici qu'une policy select —
-- nouvelle policy update ci-dessous, nécessaire pour ce sous-projet.
alter table ligne_bpu
  add column debourse_sec numeric,
  add column taux_frais_structure numeric;

alter table entreprise
  add column taux_frais_structure_defaut numeric;

-- entreprise n'a aujourd'hui qu'une policy select (entreprise_select_membres)
-- — vérifié par lecture directe de pg_policies avant d'écrire cette spec,
-- pas supposé. Sans policy update, modifierTauxFraisStructureDefaut
-- échouerait silencieusement (0 ligne affectée). with check répété
-- explicitement (leçon déjà rencontrée sur ce projet : une policy update
-- sans with check réutilise using, voir mémoire
-- noubinao_rls_with_check_gotcha).
create policy "entreprise_update_membres" on entreprise
  for update
  using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = entreprise.id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = entreprise.id and u.id = auth.uid()
    )
  );
```

- [ ] **Step 2: Enrichir le type `LigneBpu`**

Dans `lib/appels-offres/types.ts`, l'interface actuelle :

```ts
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

devient (deux champs insérés après `prix_unitaire`, avant `ordre`) :

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

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: NE PAS exécuter `supabase db push`**

La migration reste locale — elle sera appliquée par le contrôleur une fois
la branche entière revue, avant le merge. N'exécute aucune commande
touchant la base Supabase distante dans cette tâche.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260916150000_pyramide_cout_bpu.sql lib/appels-offres/types.ts
git commit -m "feat: colonnes debourse_sec/taux_frais_structure + taux_frais_structure_defaut, policy update entreprise"
```

---

### Task 2: Calcul pur `calculerPyramideCout` (TDD)

**Files:**
- Modify: `lib/appels-offres/bpu.ts`
- Modify: `lib/appels-offres/bpu.test.ts`

**Interfaces:**
- Consumes: `LigneBpu` depuis `./types` (Task 1) — seulement `prix_unitaire`/`debourse_sec`/`taux_frais_structure` via `Pick`.
- Produces: `interface PyramideCout { fraisDeStructure: number; marge: number; margePourcentage: number }`, `calculerPyramideCout(ligne: Pick<LigneBpu, "prix_unitaire" | "debourse_sec" | "taux_frais_structure">): PyramideCout | null` — consommé par la Task 4 (`bpu-ligne-row.tsx`).

- [ ] **Step 1: Écrire les tests (ils doivent tous échouer, `calculerPyramideCout` n'existe pas encore)**

À la fin de `lib/appels-offres/bpu.test.ts`, après le `describe("compterLignesNonChiffrees", ...)` existant, changer l'import en tête de fichier :

```ts
import { describe, expect, it } from "vitest";
import { calculerMontantLigne, compterLignesNonChiffrees, sommerMontants } from "./bpu";
```

devient :

```ts
import { describe, expect, it } from "vitest";
import {
  calculerMontantLigne,
  calculerPyramideCout,
  compterLignesNonChiffrees,
  sommerMontants,
} from "./bpu";
```

Puis ajouter à la fin du fichier :

```ts
describe("calculerPyramideCout", () => {
  it("calcule frais de structure et marge quand tout est renseigné", () => {
    const resultat = calculerPyramideCout({
      prix_unitaire: 10000,
      debourse_sec: 6000,
      taux_frais_structure: 15,
    });
    expect(resultat).toEqual({
      fraisDeStructure: 900,
      marge: 3100,
      margePourcentage: 31,
    });
  });

  it("retourne null quand debourse_sec est null", () => {
    expect(
      calculerPyramideCout({ prix_unitaire: 10000, debourse_sec: null, taux_frais_structure: 15 }),
    ).toBeNull();
  });

  it("retourne null quand prix_unitaire est null", () => {
    expect(
      calculerPyramideCout({ prix_unitaire: null, debourse_sec: 6000, taux_frais_structure: 15 }),
    ).toBeNull();
  });

  it("traite taux_frais_structure null comme 0", () => {
    const resultat = calculerPyramideCout({
      prix_unitaire: 10000,
      debourse_sec: 6000,
      taux_frais_structure: null,
    });
    expect(resultat).toEqual({
      fraisDeStructure: 0,
      marge: 4000,
      margePourcentage: 40,
    });
  });

  it("traite taux_frais_structure à 0 explicite comme null (même résultat)", () => {
    const resultat = calculerPyramideCout({
      prix_unitaire: 10000,
      debourse_sec: 6000,
      taux_frais_structure: 0,
    });
    expect(resultat).toEqual({
      fraisDeStructure: 0,
      marge: 4000,
      margePourcentage: 40,
    });
  });

  it("accepte une marge négative sans lever d'erreur", () => {
    const resultat = calculerPyramideCout({
      prix_unitaire: 5000,
      debourse_sec: 6000,
      taux_frais_structure: 10,
    });
    expect(resultat).toEqual({
      fraisDeStructure: 600,
      marge: -1600,
      margePourcentage: -32,
    });
  });

  it("retourne margePourcentage à 0 (pas NaN) quand prix_unitaire vaut 0", () => {
    const resultat = calculerPyramideCout({
      prix_unitaire: 0,
      debourse_sec: 500,
      taux_frais_structure: 10,
    });
    expect(resultat?.margePourcentage).toBe(0);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/appels-offres/bpu.test.ts`
Expected: FAIL — `calculerPyramideCout` n'est pas exporté par `./bpu`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `lib/appels-offres/bpu.ts`, le fichier actuel :

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

devient (ajout à la fin du fichier) :

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

type LigneAvecPyramide = Pick<LigneBpu, "prix_unitaire" | "debourse_sec" | "taux_frais_structure">;

export interface PyramideCout {
  fraisDeStructure: number;
  marge: number;
  margePourcentage: number;
}

// taux_frais_structure s'applique au déboursé sec (convention BTP), pas au
// prix de vente. null traité comme 0 (pas de frais documentés), distinct
// de 0 explicite en base mais produisant le même résultat numérique.
export function calculerPyramideCout(ligne: LigneAvecPyramide): PyramideCout | null {
  if (ligne.prix_unitaire === null || ligne.debourse_sec === null) {
    return null;
  }
  const taux = ligne.taux_frais_structure ?? 0;
  const fraisDeStructure = ligne.debourse_sec * (taux / 100);
  const marge = ligne.prix_unitaire - ligne.debourse_sec - fraisDeStructure;
  const margePourcentage =
    ligne.prix_unitaire === 0 ? 0 : (marge / ligne.prix_unitaire) * 100;
  return { fraisDeStructure, marge, margePourcentage };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run lib/appels-offres/bpu.test.ts`
Expected: PASS, 16/16 tests verts (9 existants + 7 nouveaux).

- [ ] **Step 5: Vérifier que le projet compile toujours**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/bpu.ts lib/appels-offres/bpu.test.ts
git commit -m "feat: calculerPyramideCout (TDD)"
```

---

### Task 3: Validation, Server Actions et requête entreprise

**Files:**
- Modify: `lib/appels-offres/schema.ts`
- Modify: `lib/appels-offres/actions.ts`
- Modify: `lib/utilisateur/queries.ts`

**Interfaces:**
- Consumes: `LigneBpu` depuis `./types` (Task 1).
- Produces: `ligneBpuSchema` enrichi, `tauxFraisStructureDefautSchema` (Zod), `creerLigneBpu`/`modifierLigneBpu` enrichis (même signature `input`, deux champs de plus), `modifierTauxFraisStructureDefaut(taux: string | null): Promise<{ erreur: string } | { succes: true }>`, `obtenirTauxFraisStructureDefaut(entrepriseId: string): Promise<number | null>` — consommés par les Tasks 4 et 5.

- [ ] **Step 1: Enrichir `ligneBpuSchema` et ajouter `tauxFraisStructureDefautSchema`**

Dans `lib/appels-offres/schema.ts`, le schéma actuel :

```ts
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

devient :

```ts
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
  debourseSec: z
    .string()
    .nullable()
    .refine((v) => v === null || v.trim().length === 0 || /^\d+(\.\d+)?$/.test(v.trim()), {
      message: "Déboursé sec invalide",
    })
    .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null))
    .refine((v) => v === null || Number.isFinite(v), {
      message: "Déboursé sec invalide",
    }),
  // Borné à [0, 100], contrairement à prixUnitaire/debourseSec : un taux
  // au-delà de 100% du déboursé sec n'a pas de sens dans ce modèle additif.
  tauxFraisStructure: z
    .string()
    .nullable()
    .refine((v) => v === null || v.trim().length === 0 || /^\d+(\.\d+)?$/.test(v.trim()), {
      message: "Taux de frais de structure invalide",
    })
    .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100), {
      message: "Le taux doit être compris entre 0 et 100",
    }),
});

export type LigneBpuInput = z.infer<typeof ligneBpuSchema>;

export const tauxFraisStructureDefautSchema = z.object({
  taux: z
    .string()
    .nullable()
    .refine((v) => v === null || v.trim().length === 0 || /^\d+(\.\d+)?$/.test(v.trim()), {
      message: "Taux invalide",
    })
    .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100), {
      message: "Le taux doit être compris entre 0 et 100",
    }),
});
```

- [ ] **Step 2: Enrichir `creerLigneBpu`/`modifierLigneBpu` et ajouter `modifierTauxFraisStructureDefaut`**

L'import du schéma actuel dans `lib/appels-offres/actions.ts` :

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
} from "./schema";
```

La signature de `creerLigneBpu` actuelle :

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
```

devient :

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
    debourseSec: string | null;
    tauxFraisStructure: string | null;
  },
): Promise<{ erreur: string } | { succes: true; ligne: LigneBpu }> {
```

(le corps de la fonction ne change pas jusqu'à l'`insert`). L'`insert` actuel :

```ts
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
```

devient :

```ts
  const { data, error } = await supabase
    .from("ligne_bpu")
    .insert({
      section_bpu_id: sectionId,
      code_article: parsed.data.codeArticle,
      designation: parsed.data.designation,
      unite: parsed.data.unite,
      quantite: parsed.data.quantite,
      prix_unitaire: parsed.data.prixUnitaire,
      debourse_sec: parsed.data.debourseSec,
      taux_frais_structure: parsed.data.tauxFraisStructure,
      ordre: prochainOrdre,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();
```

La signature de `modifierLigneBpu` actuelle :

```ts
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
```

devient :

```ts
export async function modifierLigneBpu(
  appelOffresId: string,
  ligneId: string,
  input: {
    codeArticle: string | null;
    designation: string;
    unite: string;
    quantite: string;
    prixUnitaire: string | null;
    debourseSec: string | null;
    tauxFraisStructure: string | null;
  },
): Promise<{ erreur: string } | { succes: true }> {
```

Son `.update({...})` actuel :

```ts
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
```

devient :

```ts
  const { data, error } = await supabase
    .from("ligne_bpu")
    .update({
      code_article: parsed.data.codeArticle,
      designation: parsed.data.designation,
      unite: parsed.data.unite,
      quantite: parsed.data.quantite,
      prix_unitaire: parsed.data.prixUnitaire,
      debourse_sec: parsed.data.debourseSec,
      taux_frais_structure: parsed.data.tauxFraisStructure,
    })
    .eq("id", ligneId)
    .select("id");
```

Aucun autre changement dans ces deux fonctions (auth, `{ erreur }` sur
échec, `revalidatePath` — tout inchangé). `ligneBpuSchema.safeParse(input)`
valide désormais aussi les deux nouveaux champs automatiquement (Step 1).

Puis ajouter à la fin du fichier :

```ts
export async function modifierTauxFraisStructureDefaut(
  taux: string | null,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = tauxFraisStructureDefautSchema.safeParse({ taux });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Taux invalide" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("entreprise")
    .update({ taux_frais_structure_defaut: parsed.data.taux })
    .eq("id", utilisateur.entreprise_id);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath("/parametres");
  return { succes: true as const };
}
```

- [ ] **Step 3: Ajouter `obtenirTauxFraisStructureDefaut` à `lib/utilisateur/queries.ts`**

Le fichier actuel :

```ts
import { createClient } from "@/lib/supabase/server";

export async function obtenirUtilisateurCourant(): Promise<{
  id: string;
  entreprise_id: string;
  nom: string;
} | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub as string | undefined;

  if (!userId) return null;

  const { data: utilisateur } = await supabase
    .from("utilisateur")
    .select("id, entreprise_id, nom")
    .eq("id", userId)
    .maybeSingle();

  return utilisateur;
}

export async function listerUtilisateurs(
  entrepriseId: string,
): Promise<{ id: string; nom: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("utilisateur")
    .select("id, nom")
    .eq("entreprise_id", entrepriseId)
    .order("nom", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
```

devient (ajout à la fin du fichier) :

```ts
import { createClient } from "@/lib/supabase/server";

export async function obtenirUtilisateurCourant(): Promise<{
  id: string;
  entreprise_id: string;
  nom: string;
} | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub as string | undefined;

  if (!userId) return null;

  const { data: utilisateur } = await supabase
    .from("utilisateur")
    .select("id, entreprise_id, nom")
    .eq("id", userId)
    .maybeSingle();

  return utilisateur;
}

export async function listerUtilisateurs(
  entrepriseId: string,
): Promise<{ id: string; nom: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("utilisateur")
    .select("id, nom")
    .eq("entreprise_id", entrepriseId)
    .order("nom", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

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

- [ ] **Step 4: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 5: Vérifier que les tests passent toujours**

Run: `npx vitest run`
Expected: tous les tests verts (les 16 tests de la Task 2 + tous les tests
existants, aucune régression). Aucun nouveau test dans cette tâche.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/schema.ts lib/appels-offres/actions.ts lib/utilisateur/queries.ts
git commit -m "feat: pyramide de coût dans creerLigneBpu/modifierLigneBpu + réglage taux par défaut"
```

---

### Task 4: Interface — ligne dépliable sur le BPU

**Files:**
- Modify: `app/(app)/appels-offres/[id]/bpu-ligne-row.tsx`
- Modify: `app/(app)/appels-offres/[id]/bpu-section.tsx`
- Modify: `app/(app)/appels-offres/[id]/bpu.tsx`
- Modify: `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`
- Modify: `app/(app)/appels-offres/[id]/page.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `calculerPyramideCout` (Task 2) ; `creerLigneBpu`/`modifierLigneBpu` enrichis, `obtenirTauxFraisStructureDefaut` (Task 3) ; `LigneBpu` (Task 1).

- [ ] **Step 1: Ajouter les traductions dans `messages/fr.json`**

Dans le bloc `"AppelsOffres.detail.bpu"`, le bloc `"fleche"` actuel se
termine ainsi (suivi de `"champsRequis"` etc., ajoutés au sous-projet A) :

```json
      "fleche": {
        "haut": "↑",
        "bas": "↓"
      },
      "champsRequis": "Veuillez remplir les champs requis",
```

Remplacer par (ajout de 5 clés avant `"champsRequis"`) :

```json
      "fleche": {
        "haut": "↑",
        "bas": "↓"
      },
      "pyramideCout": "Pyramide de coût",
      "colonneDebourseSec": "Déboursé sec (FCFA)",
      "colonneTauxFraisStructure": "Frais de structure (%)",
      "fraisDeStructure": "Frais de structure",
      "marge": "Marge",
      "champsRequis": "Veuillez remplir les champs requis",
```

- [ ] **Step 2: Ajouter les mêmes traductions dans `messages/en.json`**

Même bloc, remplacer :

```json
      "fleche": {
        "haut": "↑",
        "bas": "↓"
      },
      "champsRequis": "Please fill in the required fields",
```

par :

```json
      "fleche": {
        "haut": "↑",
        "bas": "↓"
      },
      "pyramideCout": "Cost pyramid",
      "colonneDebourseSec": "Direct cost (FCFA)",
      "colonneTauxFraisStructure": "Overhead rate (%)",
      "fraisDeStructure": "Overhead",
      "marge": "Margin",
      "champsRequis": "Please fill in the required fields",
```

- [ ] **Step 3: Vérifier que les deux fichiers restent du JSON valide**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('OK')"`
Expected: `OK`.

- [ ] **Step 4: Modifier `bpu-ligne-row.tsx`**

L'import actuel :

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
```

devient :

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import {
  modifierLigneBpu,
  deplacerLigneBpu,
  supprimerLigneBpu,
} from "@/lib/appels-offres/actions";
import { calculerMontantLigne, calculerPyramideCout } from "@/lib/appels-offres/bpu";
import type { LigneBpu } from "@/lib/appels-offres/types";
```

La signature du composant actuelle :

```tsx
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
```

devient (un nouveau prop `tauxFraisStructureDefaut`, un état `deplie`, et
deux nouveaux champs d'état — `tauxFraisStructure` se préremplit avec le
défaut entreprise **seulement** si la ligne n'a encore aucun taux propre) :

```tsx
export function BpuLigneRow({
  appelOffresId,
  sectionId,
  ligne,
  estPremiere,
  estDerniere,
  tauxFraisStructureDefaut,
  onLignesModifiees,
}: {
  appelOffresId: string;
  sectionId: string;
  ligne: LigneBpu;
  estPremiere: boolean;
  estDerniere: boolean;
  tauxFraisStructureDefaut: number | null;
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
  const [deplie, setDeplie] = useState(false);
  const [debourseSec, setDebourseSec] = useState(
    ligne.debourse_sec === null ? "" : String(ligne.debourse_sec),
  );
  const [tauxFraisStructure, setTauxFraisStructure] = useState(() => {
    if (ligne.taux_frais_structure !== null) return String(ligne.taux_frais_structure);
    if (tauxFraisStructureDefaut !== null) return String(tauxFraisStructureDefaut);
    return "";
  });

  const montant = calculerMontantLigne(ligne);
  const pyramide = calculerPyramideCout(ligne);
```

La fonction `reinitialiser` actuelle :

```tsx
  function reinitialiser() {
    setCodeArticle(ligne.code_article ?? "");
    setDesignation(ligne.designation);
    setUnite(ligne.unite);
    setQuantite(String(ligne.quantite));
    setPrixUnitaire(ligne.prix_unitaire === null ? "" : String(ligne.prix_unitaire));
  }
```

devient (revert vers la valeur réellement persistée, pas vers le
préremplissage par défaut — cohérent avec les autres champs, qui revert
toujours vers `ligne`, jamais vers une valeur de confort) :

```tsx
  function reinitialiser() {
    setCodeArticle(ligne.code_article ?? "");
    setDesignation(ligne.designation);
    setUnite(ligne.unite);
    setQuantite(String(ligne.quantite));
    setPrixUnitaire(ligne.prix_unitaire === null ? "" : String(ligne.prix_unitaire));
    setDebourseSec(ligne.debourse_sec === null ? "" : String(ligne.debourse_sec));
    setTauxFraisStructure(
      ligne.taux_frais_structure === null ? "" : String(ligne.taux_frais_structure),
    );
  }
```

La fonction `enregistrer` actuelle :

```tsx
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
```

devient :

```tsx
  async function enregistrer() {
    const input = {
      codeArticle: codeArticle.trim().length > 0 ? codeArticle : null,
      designation,
      unite,
      quantite,
      prixUnitaire: prixUnitaire.trim().length > 0 ? prixUnitaire : null,
      debourseSec: debourseSec.trim().length > 0 ? debourseSec : null,
      tauxFraisStructure: tauxFraisStructure.trim().length > 0 ? tauxFraisStructure : null,
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
              debourse_sec: input.debourseSec === null ? null : Number(input.debourseSec),
              taux_frais_structure:
                input.tauxFraisStructure === null ? null : Number(input.tauxFraisStructure),
            }
          : l,
      ),
    );
  }
```

Le rendu actuel (du `return (` jusqu'à la fin du composant) :

```tsx
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

devient (ajout d'un bouton chevron en première position de la cellule
d'actions, et d'une seconde `TableRow` conditionnelle juste après —
utiliser un React Fragment `<>...</>` pour retourner les deux lignes) :

```tsx
  return (
    <>
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
              onClick={() => setDeplie((v) => !v)}
              aria-expanded={deplie}
              aria-label={t("pyramideCout")}
            >
              {deplie ? <ChevronDown /> : <ChevronRight />}
            </Button>
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
      {deplie && (
        <TableRow>
          <TableCell colSpan={7}>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {t("colonneDebourseSec")}
                </label>
                <Input
                  type="number"
                  value={debourseSec}
                  onChange={(e) => setDebourseSec(e.target.value)}
                  onBlur={enregistrer}
                  aria-label={t("colonneDebourseSec")}
                  className="w-32"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {t("colonneTauxFraisStructure")}
                </label>
                <Input
                  type="number"
                  value={tauxFraisStructure}
                  onChange={(e) => setTauxFraisStructure(e.target.value)}
                  onBlur={enregistrer}
                  aria-label={t("colonneTauxFraisStructure")}
                  className="w-24"
                />
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted-foreground">{t("fraisDeStructure")}</span>
                <span>
                  {pyramide === null
                    ? t("nonChiffree")
                    : `${pyramide.fraisDeStructure.toLocaleString("fr-FR")} FCFA`}
                </span>
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted-foreground">{t("marge")}</span>
                <span className={pyramide !== null && pyramide.marge < 0 ? "text-red-600" : ""}>
                  {pyramide === null
                    ? t("nonChiffree")
                    : `${pyramide.marge.toLocaleString("fr-FR")} FCFA (${pyramide.margePourcentage.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%)`}
                </span>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
```

- [ ] **Step 5: Modifier `bpu-section.tsx` pour relayer `tauxFraisStructureDefaut`**

La signature actuelle :

```tsx
export function BpuSection({
  appelOffresId,
  section,
  lignes,
  estPremiere,
  estDerniere,
  onSectionModifiee,
  onSectionSupprimee,
  onSectionsReordonnees,
  onLignesModifiees,
}: {
  appelOffresId: string;
  section: SectionBpu;
  lignes: LigneBpu[];
  estPremiere: boolean;
  estDerniere: boolean;
  onSectionModifiee: (section: SectionBpu) => void;
  onSectionSupprimee: (sectionId: string) => void;
  onSectionsReordonnees: (sections: SectionBpu[]) => void;
  onLignesModifiees: (
    sectionId: string,
    updater: (lignesCourantes: LigneBpu[]) => LigneBpu[],
  ) => void;
}) {
```

devient :

```tsx
export function BpuSection({
  appelOffresId,
  section,
  lignes,
  estPremiere,
  estDerniere,
  tauxFraisStructureDefaut,
  onSectionModifiee,
  onSectionSupprimee,
  onSectionsReordonnees,
  onLignesModifiees,
}: {
  appelOffresId: string;
  section: SectionBpu;
  lignes: LigneBpu[];
  estPremiere: boolean;
  estDerniere: boolean;
  tauxFraisStructureDefaut: number | null;
  onSectionModifiee: (section: SectionBpu) => void;
  onSectionSupprimee: (sectionId: string) => void;
  onSectionsReordonnees: (sections: SectionBpu[]) => void;
  onLignesModifiees: (
    sectionId: string,
    updater: (lignesCourantes: LigneBpu[]) => LigneBpu[],
  ) => void;
}) {
```

Le rendu de `<BpuLigneRow>` actuel :

```tsx
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
```

devient :

```tsx
            {lignes.map((ligne, index) => (
              <BpuLigneRow
                key={ligne.id}
                appelOffresId={appelOffresId}
                sectionId={section.id}
                ligne={ligne}
                estPremiere={index === 0}
                estDerniere={index === lignes.length - 1}
                tauxFraisStructureDefaut={tauxFraisStructureDefaut}
                onLignesModifiees={onLignesModifiees}
              />
            ))}
```

- [ ] **Step 6: Modifier `bpu.tsx` pour relayer `tauxFraisStructureDefaut`**

La signature actuelle :

```tsx
export function Bpu({
  appelOffresId,
  sectionsInitiales,
  lignesParSectionInitiales,
}: {
  appelOffresId: string;
  sectionsInitiales: SectionBpu[];
  lignesParSectionInitiales: Record<string, LigneBpu[]>;
}) {
```

devient :

```tsx
export function Bpu({
  appelOffresId,
  sectionsInitiales,
  lignesParSectionInitiales,
  tauxFraisStructureDefaut,
}: {
  appelOffresId: string;
  sectionsInitiales: SectionBpu[];
  lignesParSectionInitiales: Record<string, LigneBpu[]>;
  tauxFraisStructureDefaut: number | null;
}) {
```

Le rendu de `<BpuSection>` actuel :

```tsx
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
          onSectionsReordonnees={setSections}
          onLignesModifiees={(sectionId, updater) =>
            setLignesParSection((carte) => ({
              ...carte,
              [sectionId]: updater(carte[sectionId] ?? []),
            }))
          }
        />
      ))}
```

devient (ajout de `tauxFraisStructureDefaut={tauxFraisStructureDefaut}`) :

```tsx
      {sectionsTriees.map((section, index) => (
        <BpuSection
          key={section.id}
          appelOffresId={appelOffresId}
          section={section}
          lignes={(lignesParSection[section.id] ?? []).slice().sort((a, b) => a.ordre - b.ordre)}
          estPremiere={index === 0}
          estDerniere={index === sectionsTriees.length - 1}
          tauxFraisStructureDefaut={tauxFraisStructureDefaut}
          onSectionModifiee={(sectionModifiee) =>
            setSections((liste) =>
              liste.map((s) => (s.id === sectionModifiee.id ? sectionModifiee : s)),
            )
          }
          onSectionSupprimee={retirerSection}
          onSectionsReordonnees={setSections}
          onLignesModifiees={(sectionId, updater) =>
            setLignesParSection((carte) => ({
              ...carte,
              [sectionId]: updater(carte[sectionId] ?? []),
            }))
          }
        />
      ))}
```

- [ ] **Step 7: Modifier `appel-offres-detail.tsx` pour relayer `tauxFraisStructureDefaut`**

Dans la signature du composant, le destructuring et le bloc de types
actuels se terminent ainsi :

```tsx
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

devient :

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

Le rendu de `<Bpu>` actuel :

```tsx
        <TabsContent value="bpu" className="data-[state=inactive]:hidden" forceMount>
          <Bpu
            appelOffresId={appelOffres.id}
            sectionsInitiales={bpu.sections}
            lignesParSectionInitiales={bpu.lignesParSection}
          />
        </TabsContent>
```

devient :

```tsx
        <TabsContent value="bpu" className="data-[state=inactive]:hidden" forceMount>
          <Bpu
            appelOffresId={appelOffres.id}
            sectionsInitiales={bpu.sections}
            lignesParSectionInitiales={bpu.lignesParSection}
            tauxFraisStructureDefaut={tauxFraisStructureDefaut}
          />
        </TabsContent>
```

- [ ] **Step 8: Modifier `page.tsx` pour charger et transmettre le taux par défaut**

L'import actuel :

```tsx
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
```

devient :

```tsx
import { obtenirUtilisateurCourant, obtenirTauxFraisStructureDefaut } from "@/lib/utilisateur/queries";
```

Le chargement des données actuel :

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
        bpu={bpu}
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
        tauxFraisStructureDefaut={tauxFraisStructureDefaut}
      />
```

- [ ] **Step 9: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 10: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`
Expected: tous les tests passent, aucune régression. Aucun nouveau test
dans cette tâche.

- [ ] **Step 11: Vérifier le build de production**

Run: `npx next build`
Expected: build réussi, aucune erreur.

- [ ] **Step 12: Commit**

```bash
git add "app/(app)/appels-offres/[id]/bpu-ligne-row.tsx" "app/(app)/appels-offres/[id]/bpu-section.tsx" "app/(app)/appels-offres/[id]/bpu.tsx" "app/(app)/appels-offres/[id]/appel-offres-detail.tsx" "app/(app)/appels-offres/[id]/page.tsx" messages/fr.json messages/en.json
git commit -m "feat: ligne dépliable pyramide de coût sur le BPU"
```

---

### Task 5: Interface — réglage taux de frais de structure par défaut

**Files:**
- Create: `app/(app)/parametres/taux-frais-structure-card.tsx`
- Modify: `app/(app)/parametres/page.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `modifierTauxFraisStructureDefaut`, `obtenirTauxFraisStructureDefaut` (Task 3).

- [ ] **Step 1: Ajouter les traductions dans `messages/fr.json`**

Dans le bloc `"Parametres"`, le bloc `"page"` actuel :

```json
  "Parametres": {
    "page": {
      "titre": "Réglages",
      "filAriane": "Réglages"
    },
```

devient (nouveau bloc `"tauxFraisStructure"` ajouté juste après `"page"`) :

```json
  "Parametres": {
    "page": {
      "titre": "Réglages",
      "filAriane": "Réglages"
    },
    "tauxFraisStructure": {
      "titre": "Taux de frais de structure par défaut",
      "description": "Préremplit le taux de frais de structure de chaque nouvelle ligne dépliée dans un bordereau des prix unitaires. Modifiable ligne par ligne."
    },
```

- [ ] **Step 2: Ajouter les mêmes traductions dans `messages/en.json`**

```json
  "Parametres": {
    "page": {
      "titre": "Settings",
      "filAriane": "Settings"
    },
```

devient :

```json
  "Parametres": {
    "page": {
      "titre": "Settings",
      "filAriane": "Settings"
    },
    "tauxFraisStructure": {
      "titre": "Default overhead rate",
      "description": "Pre-fills the overhead rate the first time a bill-of-quantities line is expanded. Editable per line."
    },
```

- [ ] **Step 3: Vérifier que les deux fichiers restent du JSON valide**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('OK')"`
Expected: `OK`.

- [ ] **Step 4: Créer `app/(app)/parametres/taux-frais-structure-card.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { modifierTauxFraisStructureDefaut } from "@/lib/appels-offres/actions";

export function TauxFraisStructureCard({ tauxInitial }: { tauxInitial: number | null }) {
  const t = useTranslations("Parametres.tauxFraisStructure");
  const [taux, setTaux] = useState(tauxInitial === null ? "" : String(tauxInitial));

  async function enregistrer() {
    const resultat = await modifierTauxFraisStructureDefaut(
      taux.trim().length > 0 ? taux : null,
    );
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      setTaux(tauxInitial === null ? "" : String(tauxInitial));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titre")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={taux}
            onChange={(e) => setTaux(e.target.value)}
            onBlur={enregistrer}
            aria-label={t("titre")}
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Modifier `app/(app)/parametres/page.tsx`**

Le fichier actuel :

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { obtenirCompteEmailConnecte } from "@/lib/email/queries";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";
import { CompteEmailCard } from "./compte-email-card";
import { ToastConnexion } from "./toast-connexion";

export default async function ParametresPage({
  searchParams,
}: {
  searchParams: Promise<{ succes?: string; erreur?: string }>;
}) {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const { succes, erreur } = await searchParams;
  const compte = await obtenirCompteEmailConnecte(utilisateur.id);
  const t = await getTranslations("Parametres.page");

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: t("filAriane") }]} />
      <h1 className="text-2xl font-bold">{t("titre")}</h1>
      <ToastConnexion succes={succes ?? null} erreur={erreur ?? null} />
      <CompteEmailCard compte={compte} />
    </div>
  );
}
```

devient :

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { obtenirUtilisateurCourant, obtenirTauxFraisStructureDefaut } from "@/lib/utilisateur/queries";
import { obtenirCompteEmailConnecte } from "@/lib/email/queries";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";
import { CompteEmailCard } from "./compte-email-card";
import { TauxFraisStructureCard } from "./taux-frais-structure-card";
import { ToastConnexion } from "./toast-connexion";

export default async function ParametresPage({
  searchParams,
}: {
  searchParams: Promise<{ succes?: string; erreur?: string }>;
}) {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const { succes, erreur } = await searchParams;
  const [compte, tauxFraisStructureDefaut] = await Promise.all([
    obtenirCompteEmailConnecte(utilisateur.id),
    obtenirTauxFraisStructureDefaut(utilisateur.entreprise_id),
  ]);
  const t = await getTranslations("Parametres.page");

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: t("filAriane") }]} />
      <h1 className="text-2xl font-bold">{t("titre")}</h1>
      <ToastConnexion succes={succes ?? null} erreur={erreur ?? null} />
      <CompteEmailCard compte={compte} />
      <TauxFraisStructureCard tauxInitial={tauxFraisStructureDefaut} />
    </div>
  );
}
```

- [ ] **Step 6: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 7: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`
Expected: tous les tests passent, aucune régression.

- [ ] **Step 8: Vérifier le build de production**

Run: `npx next build`
Expected: build réussi, aucune erreur.

- [ ] **Step 9: Commit**

```bash
git add "app/(app)/parametres/taux-frais-structure-card.tsx" "app/(app)/parametres/page.tsx" messages/fr.json messages/en.json
git commit -m "feat: réglage taux de frais de structure par défaut"
```

---

## Self-Review Notes

- **Couverture du spec** : modèle de données + types (Task 1), calcul pur
  en TDD (Task 2), validation + Server Actions + requête entreprise
  (Task 3), ligne dépliable sur le BPU (Task 4), réglage entreprise
  (Task 5) — chaque section du spec `2026-09-16-pyramide-cout-bpu-design.md`
  a une tâche correspondante.
- **Incohérence du spec résolue explicitement** (voir Global Constraints) :
  le préremplissage du taux par défaut se fait à l'ouverture d'une ligne
  (Task 4), pas dans le formulaire d'ajout de ligne — cohérent avec la
  décision « pas de champs supplémentaires visibles par défaut ».
- **Cohérence des types** : `PyramideCout`/`calculerPyramideCout` définis
  une seule fois (Task 2), réutilisés sans redéfinition dans
  `bpu-ligne-row.tsx` (Task 4). Signature de `creerLigneBpu`/
  `modifierLigneBpu` identique entre leur définition (Task 3) et leur site
  d'appel dans `bpu-section.tsx`/`bpu-ligne-row.tsx` (déjà appelants
  existants, seul l'objet `input` passé change de forme, vérifié champ par
  champ dans les Steps de la Task 4).
- **`tauxFraisStructureDefaut` threadé sans rupture** : `page.tsx` → prop
  `AppelOffresDetail` → prop `Bpu` → prop `BpuSection` → prop
  `BpuLigneRow`, à chaque étape le même type `number | null`, jamais
  transformé en chemin.
- **`0` vs `null`** : testé explicitement dans Task 2 (taux à `0` explicite
  vs `null` → même résultat numérique, tous deux distincts de « non
  renseigné » pour `debourse_sec`/`prix_unitaire` qui retournent `null`
  côté fonction).
- **RLS vérifiée par lecture réelle** (`pg_policies`) avant d'écrire la
  spec et ce plan, pas supposée — `entreprise` n'avait qu'une policy
  `select`, corrigé dans la migration Task 1 plutôt que découvert en
  production.
- **Aucun placeholder** : chaque étape contient le code exact à écrire ou
  le texte exact à remplacer, y compris les 7 nouveaux tests complets de
  la Task 2.
- **Vérification manuelle en conditions réelles**, à faire une fois les 5
  tâches exécutées et la migration appliquée par le contrôleur : déplier
  une ligne existante, saisir un déboursé sec et un taux, vérifier le
  calcul de marge (positive et négative), vérifier que le taux par défaut
  entreprise préremplit une ligne jamais dépliée, modifier le réglage
  entreprise et vérifier qu'une nouvelle ligne dépliée reprend la nouvelle
  valeur par défaut.
