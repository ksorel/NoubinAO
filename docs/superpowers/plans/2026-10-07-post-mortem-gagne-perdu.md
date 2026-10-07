# Post-mortem gagné/perdu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** À chaque passage d'un AO à "Gagné" ou "Perdu" dans le pipeline, proposer de capturer une raison (liste fermée) + une note libre, non bloquant, modifiable ensuite depuis la fiche AO.

**Architecture:** Deux colonnes nullable sur `appel_offres` (`raison_resultat`, `note_resultat`). `modifierStatutPipeline` étendue avec deux paramètres optionnels ; nouvelle action `modifierResultatAo` pour l'édition a posteriori. Un composant `Dialog` partagé (`ResultatDialogue`) réutilisé par `StatutPipelineSelect` (déclenché au changement de statut) et une nouvelle `ResultatCard` sur la fiche détail de l'AO (édition a posteriori, visible seulement si le statut est gagné/perdu).

**Tech Stack:** Next.js App Router (Server Actions), Supabase Postgres (migration SQL, check constraint), zod, next-intl, shadcn/ui (Dialog, Select, Textarea), Vitest.

## Global Constraints

- Spec de référence : `docs/superpowers/specs/2026-10-07-post-mortem-gagne-perdu-design.md`.
- Capture non bloquante : bouton "Passer" toujours disponible dans la boîte de dialogue déclenchée par le changement de statut (absent de la boîte ouverte depuis la fiche AO, qui n'a rien à "passer").
- Raison optionnelle, liste fermée dépendant du statut (perdu : `prix_trop_eleve`, `delai_manque`, `criteres_techniques_non_respectes`, `concurrent_mieux_positionne`, `sans_reponse_acheteur`, `autre` — gagné : `prix_competitif`, `references_solides`, `relation_acheteur`, `qualite_technique`, `autre`). Note libre optionnelle, max 2000 caractères (même limite que les notes Go/No-Go, `lib/appels-offres/schema.ts`).
- Pas de montant final remporté, pas de dashboard d'agrégation, pas de nettoyage automatique de la raison/note si le statut change puis revient à gagné/perdu — hors scope, ne pas les ajouter.
- "Passer" (changement de statut sans raison/note) ne doit jamais écraser une raison déjà en base : `modifierStatutPipeline` n'inclut `raison_resultat`/`note_resultat` dans la requête `UPDATE` que lorsque ces paramètres sont explicitement fournis (distinction `undefined` vs `null`).
- Jamais de `disabled` sur un composant Radix (`Select`, `Dialog`) pour bloquer une double-soumission — seulement sur les `Button` natifs (piège a11y documenté de ce projet, voir `noubinao_a11y_radix_pitfalls`).
- Après chaque task : `npx tsc --noEmit` doit passer, `npx eslint` ne doit pas introduire de nouvelle erreur sur les fichiers touchés, commit avec message conventionnel (`feat(...)`/`fix(...)`).

---

## Task 1 : Migration — colonnes résultat sur `appel_offres`

**Files:**
- Create: `supabase/migrations/<timestamp>_appel_offres_resultat.sql` (timestamp généré par la CLI, voir Step 1)

**Interfaces:**
- Produces : colonnes `appel_offres.raison_resultat text` (nullable, contrainte `check`), `appel_offres.note_resultat text` (nullable). Task 2 consomme ces noms exacts.

- [ ] **Step 1 : Créer le fichier de migration**

Run: `npx supabase migration new appel_offres_resultat`

Note le chemin généré (ex. `supabase/migrations/20261008090000_appel_offres_resultat.sql`).

- [ ] **Step 2 : Écrire le contenu SQL**

```sql
-- Capture de la raison gagné/perdu (post-mortem) — voir
-- docs/superpowers/specs/2026-10-07-post-mortem-gagne-perdu-design.md

alter table appel_offres add column raison_resultat text;
alter table appel_offres add column note_resultat text;

-- La liste ci-dessous est l'union exacte de RAISONS_RESULTAT_AO
-- (lib/appels-offres/types.ts, Task 2) — garder les deux synchronisées si
-- une raison est ajoutée ou retirée un jour.
alter table appel_offres add constraint appel_offres_raison_resultat_check
  check (
    raison_resultat is null
    or raison_resultat in (
      'prix_trop_eleve',
      'delai_manque',
      'criteres_techniques_non_respectes',
      'concurrent_mieux_positionne',
      'sans_reponse_acheteur',
      'prix_competitif',
      'references_solides',
      'relation_acheteur',
      'qualite_technique',
      'autre'
    )
  );
```

Aucune nouvelle policy RLS : les policies `update` existantes sur `appel_offres` (`appel_offres_update_membres`) couvrent déjà toute colonne de la table, ces deux colonnes en bénéficient automatiquement.

- [ ] **Step 3 : Relecture manuelle du fichier**

Vérifier : les deux `alter table add column` précèdent le `alter table add constraint`, la liste de 10 valeurs dans le `check` est complète et sans doublon. **Ne pas exécuter `npx supabase db push` ou `npx supabase db query`** — appliqué séparément par le contrôleur après revue (voir `feedback_subagent_infra_actions`).

- [ ] **Step 4 : Commit**

```bash
git add supabase/migrations/
git commit -m "feat(appels-offres): migration colonnes raison/note résultat gagné-perdu"
```

**Note pour le contrôleur :** après revue, exécuter `npx supabase db push`, puis vérifier :
```bash
npx supabase db query --linked "select column_name from information_schema.columns where table_name = 'appel_offres' and column_name in ('raison_resultat', 'note_resultat');"
```
Les Tasks 2 à 6 n'ont pas besoin que la migration soit déjà appliquée (`supabase.from("appel_offres")` n'est pas typé contre un schéma généré dans ce projet) — seule la vérification manuelle finale en dépend.

---

## Task 2 : Types — raisons résultat

**Files:**
- Modify: `lib/appels-offres/types.ts`

**Interfaces:**
- Produces : `RAISONS_RESULTAT_PERDU: readonly string[]`, `RAISONS_RESULTAT_GAGNE: readonly string[]`, `RAISONS_RESULTAT_AO: readonly string[]` (union des deux, dédupliquée), type `RaisonResultatAo`. `AppelOffres` gagne `raison_resultat: RaisonResultatAo | null` et `note_resultat: string | null`. Tasks 3, 4, 5, 6 consomment ces noms exacts.

- [ ] **Step 1 : Ajouter les constantes de raisons**

Dans `lib/appels-offres/types.ts`, juste après le bloc `STATUTS_PIPELINE_AO`/`StatutPipelineAo` (après la ligne `export type StatutPipelineAo = (typeof STATUTS_PIPELINE_AO)[number];`), ajouter :

```ts
export const RAISONS_RESULTAT_PERDU = [
  "prix_trop_eleve",
  "delai_manque",
  "criteres_techniques_non_respectes",
  "concurrent_mieux_positionne",
  "sans_reponse_acheteur",
  "autre",
] as const;

export const RAISONS_RESULTAT_GAGNE = [
  "prix_competitif",
  "references_solides",
  "relation_acheteur",
  "qualite_technique",
  "autre",
] as const;

// Union dédupliquée des deux listes ci-dessus, utilisée par le schéma zod
// (une seule contrainte, le filtrage par statut gagné/perdu reste une
// responsabilité de l'UI) et par la colonne appel_offres.raison_resultat.
export const RAISONS_RESULTAT_AO = [
  "prix_trop_eleve",
  "delai_manque",
  "criteres_techniques_non_respectes",
  "concurrent_mieux_positionne",
  "sans_reponse_acheteur",
  "prix_competitif",
  "references_solides",
  "relation_acheteur",
  "qualite_technique",
  "autre",
] as const;

export type RaisonResultatAo = (typeof RAISONS_RESULTAT_AO)[number];
```

- [ ] **Step 2 : Étendre `AppelOffres`**

Dans la même fichier, dans l'interface `AppelOffres`, ajouter après `created_by: string | null;` (avant `created_at: string;`) :

```ts
  raison_resultat: RaisonResultatAo | null;
  note_resultat: string | null;
```

- [ ] **Step 3 : Typecheck**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur.

- [ ] **Step 4 : Commit**

```bash
git add lib/appels-offres/types.ts
git commit -m "feat(appels-offres): ajoute les types de raison résultat gagné-perdu"
```

---

## Task 3 : Schémas zod + Server Actions

**Files:**
- Modify: `lib/appels-offres/schema.ts`
- Modify: `lib/appels-offres/schema.test.ts`
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes : `RAISONS_RESULTAT_AO`, `RaisonResultatAo` (Task 2).
- Produces : `modifierStatutPipeline(appelOffresId: string, statutPipeline: StatutPipelineAo, raisonResultat?: string | null, noteResultat?: string | null): Promise<{ erreur: string } | { succes: true }>` (signature étendue, rétrocompatible — les deux nouveaux paramètres sont optionnels), `modifierResultatAo(appelOffresId: string, raisonResultat: string | null, noteResultat: string | null): Promise<{ erreur: string } | { succes: true }>`. Tasks 5 et 6 consomment ces deux fonctions.

- [ ] **Step 1 : Écrire les tests de schéma (échouent d'abord)**

Ajouter à `lib/appels-offres/schema.test.ts`, dans l'import existant en haut du fichier, `modifierStatutPipelineSchema` et `modifierResultatAoSchema` (ajouter ces deux noms à la liste importée de `"./schema"`), puis ajouter à la fin du fichier :

```ts
describe("modifierStatutPipelineSchema", () => {
  it("accepte un statut sans raison ni note", () => {
    const resultat = modifierStatutPipelineSchema.safeParse({
      statutPipeline: "perdu",
    });
    expect(resultat.success).toBe(true);
  });

  it("accepte une raison valide pour le statut perdu", () => {
    const resultat = modifierStatutPipelineSchema.safeParse({
      statutPipeline: "perdu",
      raisonResultat: "prix_trop_eleve",
      noteResultat: "Concurrent 15% moins cher",
    });
    expect(resultat.success).toBe(true);
  });

  it("rejette une raison hors de la liste", () => {
    const resultat = modifierStatutPipelineSchema.safeParse({
      statutPipeline: "perdu",
      raisonResultat: "raison_inexistante",
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette une note de plus de 2000 caractères", () => {
    const resultat = modifierStatutPipelineSchema.safeParse({
      statutPipeline: "gagne",
      noteResultat: "a".repeat(2001),
    });
    expect(resultat.success).toBe(false);
  });

  it("normalise une raison null explicite", () => {
    const resultat = modifierStatutPipelineSchema.safeParse({
      statutPipeline: "gagne",
      raisonResultat: null,
      noteResultat: null,
    });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.raisonResultat).toBeNull();
      expect(resultat.data.noteResultat).toBeNull();
    }
  });
});

describe("modifierResultatAoSchema", () => {
  it("accepte une raison et une note valides", () => {
    const resultat = modifierResultatAoSchema.safeParse({
      raisonResultat: "references_solides",
      noteResultat: "Trois références comparables citées",
    });
    expect(resultat.success).toBe(true);
  });

  it("accepte raison et note toutes deux null", () => {
    const resultat = modifierResultatAoSchema.safeParse({
      raisonResultat: null,
      noteResultat: null,
    });
    expect(resultat.success).toBe(true);
  });

  it("rejette une raison hors de la liste", () => {
    const resultat = modifierResultatAoSchema.safeParse({
      raisonResultat: "pas_une_vraie_raison",
      noteResultat: null,
    });
    expect(resultat.success).toBe(false);
  });
});
```

- [ ] **Step 2 : Lancer les tests, vérifier qu'ils échouent**

Run: `npx vitest run lib/appels-offres/schema.test.ts`
Expected: FAIL — `raisonResultat`/`noteResultat` non acceptés par `modifierStatutPipelineSchema` (champs inexistants dans le schéma actuel), `modifierResultatAoSchema` non exporté.

- [ ] **Step 3 : Étendre et ajouter les schémas**

Dans `lib/appels-offres/schema.ts`, ajouter `RAISONS_RESULTAT_AO` à l'import existant depuis `"./types"` (ligne 4, qui importe déjà `CRITERES_GO_NO_GO, ROLES_MEMBRE_GROUPEMENT, STATUTS_PIPELINE_AO`).

Le fichier définit actuellement, dans cet ordre : `modifierStatutPipelineSchema`, puis `noteGoNoGo`, puis `mettreAJourEvaluationGoNoGoSchema`. `modifierStatutPipelineSchema` a besoin de réutiliser `noteGoNoGo` (déjà la validation exacte requise : optionnel, trim, max 2000 caractères, null si vide) — `noteGoNoGo` doit donc être définie avant `modifierStatutPipelineSchema`. Remplacer tout ce bloc (de `export const modifierStatutPipelineSchema` jusqu'à la fin de `mettreAJourEvaluationGoNoGoSchema` inclus) :

```ts
export const modifierStatutPipelineSchema = z.object({
  statutPipeline: z.enum(STATUTS_PIPELINE_AO),
});

// Contrairement à `champOptionnel` (partagé avec modifierAppelOffresSchema,
// sans limite de longueur), les notes Go/No-Go imposent une longueur
// maximale : la Server Action mettreAJourEvaluationGoNoGo peut être
// appelée directement (hors UI), qui n'impose elle-même aucune limite de
// saisie sur le <Textarea>.
const noteGoNoGo = z
  .string()
  .nullable()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
  .refine((v) => v === null || v.length <= 2000, {
    message: "Note trop longue (2000 caractères maximum)",
  });

export const mettreAJourEvaluationGoNoGoSchema = z.object({
  critereJuridique: z.enum(CRITERES_GO_NO_GO),
  noteJuridique: noteGoNoGo,
  critereFaisabilite: z.enum(CRITERES_GO_NO_GO),
  noteFaisabilite: noteGoNoGo,
  critereRentabilite: z.enum(CRITERES_GO_NO_GO),
  noteRentabilite: noteGoNoGo,
});
```

par (même contenu, `noteGoNoGo` déplacée avant `modifierStatutPipelineSchema`, qui la réutilise, et nouvelle `modifierResultatAoSchema` ajoutée à la fin) :

```ts
// Contrairement à `champOptionnel` (partagé avec modifierAppelOffresSchema,
// sans limite de longueur), les notes Go/No-Go imposent une longueur
// maximale : la Server Action mettreAJourEvaluationGoNoGo peut être
// appelée directement (hors UI), qui n'impose elle-même aucune limite de
// saisie sur le <Textarea>. Réutilisée telle quelle par
// modifierStatutPipelineSchema/modifierResultatAoSchema ci-dessous — même
// exigence de longueur, pas de raison de la dupliquer.
const noteGoNoGo = z
  .string()
  .nullable()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
  .refine((v) => v === null || v.length <= 2000, {
    message: "Note trop longue (2000 caractères maximum)",
  });

export const modifierStatutPipelineSchema = z.object({
  statutPipeline: z.enum(STATUTS_PIPELINE_AO),
  raisonResultat: z.enum(RAISONS_RESULTAT_AO).nullable().optional(),
  noteResultat: noteGoNoGo.optional(),
});

export const mettreAJourEvaluationGoNoGoSchema = z.object({
  critereJuridique: z.enum(CRITERES_GO_NO_GO),
  noteJuridique: noteGoNoGo,
  critereFaisabilite: z.enum(CRITERES_GO_NO_GO),
  noteFaisabilite: noteGoNoGo,
  critereRentabilite: z.enum(CRITERES_GO_NO_GO),
  noteRentabilite: noteGoNoGo,
});

export const modifierResultatAoSchema = z.object({
  raisonResultat: z.enum(RAISONS_RESULTAT_AO).nullable(),
  noteResultat: noteGoNoGo,
});
```

- [ ] **Step 4 : Lancer les tests, vérifier qu'ils passent**

Run: `npx vitest run lib/appels-offres/schema.test.ts`
Expected: PASS (tous les tests, anciens et nouveaux).

- [ ] **Step 5 : Étendre `modifierStatutPipeline`**

Dans `lib/appels-offres/actions.ts`, remplacer la fonction existante (lignes 346-383) :

```ts
export async function modifierStatutPipeline(
  appelOffresId: string,
  statutPipeline: StatutPipelineAo,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = modifierStatutPipelineSchema.safeParse({ statutPipeline });

  if (!parsed.success) {
    return { erreur: "Statut invalide" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("appel_offres")
    .update({ statut_pipeline: parsed.data.statutPipeline })
    .eq("id", appelOffresId)
    .select("id");

  if (error) {
    return { erreur: "Échec de la mise à jour du statut. Réessayez." };
  }

  if (!data || data.length === 0) {
    return { erreur: "Appel d'offres introuvable." };
  }

  revalidatePath("/pipeline");
  return { succes: true as const };
}
```

par :

```ts
export async function modifierStatutPipeline(
  appelOffresId: string,
  statutPipeline: StatutPipelineAo,
  raisonResultat?: string | null,
  noteResultat?: string | null,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = modifierStatutPipelineSchema.safeParse({
    statutPipeline,
    raisonResultat,
    noteResultat,
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Statut invalide" };
  }

  const supabase = await createClient();

  // Un appel "Passer" (raisonResultat/noteResultat tous deux undefined) ne
  // doit jamais écraser une raison déjà saisie lors d'un changement de
  // statut antérieur — ces clés ne sont incluses dans l'objet `update`
  // que lorsqu'elles ont été explicitement fournies à cette fonction.
  const miseAJour: {
    statut_pipeline: StatutPipelineAo;
    raison_resultat?: string | null;
    note_resultat?: string | null;
  } = { statut_pipeline: parsed.data.statutPipeline };

  if (raisonResultat !== undefined) {
    miseAJour.raison_resultat = parsed.data.raisonResultat ?? null;
  }
  if (noteResultat !== undefined) {
    miseAJour.note_resultat = parsed.data.noteResultat ?? null;
  }

  const { data, error } = await supabase
    .from("appel_offres")
    .update(miseAJour)
    .eq("id", appelOffresId)
    .select("id");

  if (error) {
    return { erreur: "Échec de la mise à jour du statut. Réessayez." };
  }

  if (!data || data.length === 0) {
    return { erreur: "Appel d'offres introuvable." };
  }

  revalidatePath("/pipeline");
  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}
```

- [ ] **Step 6 : Ajouter `modifierResultatAo`**

Dans le même fichier, ajouter `modifierResultatAoSchema` à l'import existant depuis `"./schema"` (en haut du fichier, à côté de `modifierStatutPipelineSchema`). Puis ajouter, juste après la fonction `modifierStatutPipeline` modifiée ci-dessus :

```ts
export async function modifierResultatAo(
  appelOffresId: string,
  raisonResultat: string | null,
  noteResultat: string | null,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = modifierResultatAoSchema.safeParse({ raisonResultat, noteResultat });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("appel_offres")
    .update({
      raison_resultat: parsed.data.raisonResultat,
      note_resultat: parsed.data.noteResultat,
    })
    .eq("id", appelOffresId)
    .select("id");

  if (error) {
    return { erreur: "Échec de la mise à jour. Réessayez." };
  }

  if (!data || data.length === 0) {
    return { erreur: "Appel d'offres introuvable." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}
```

- [ ] **Step 7 : Typecheck**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur.

- [ ] **Step 8 : Commit**

```bash
git add lib/appels-offres/schema.ts lib/appels-offres/schema.test.ts lib/appels-offres/actions.ts
git commit -m "feat(appels-offres): server actions de capture du résultat gagné-perdu"
```

---

## Task 4 : Composant partagé `ResultatDialogue` + i18n

**Files:**
- Create: `components/ao/resultat-dialogue.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes : `RAISONS_RESULTAT_PERDU`, `RAISONS_RESULTAT_GAGNE` (Task 2).
- Produces : composant `ResultatDialogue({ ouvert, onOuvertChange, statutPipeline, raisonInitiale, noteInitiale, onPasser, onEnregistrer })` où `statutPipeline: "gagne" | "perdu"`, `onPasser?: () => Promise<void>` (omis → bouton "Passer" absent), `onEnregistrer: (raison: string | null, note: string | null) => Promise<void>`. Tasks 5 et 6 l'utilisent.

- [ ] **Step 1 : Ajouter les clés i18n**

Dans `messages/fr.json`, namespace `Pipeline`, ajouter la clé `postMortem` (au même niveau que `page`, `table`, `badge`, `responsable`, `error`) :

```json
"postMortem": {
  "titre": {
    "gagne": "AO gagné — pourquoi ?",
    "perdu": "AO perdu — pourquoi ?"
  },
  "description": "Optionnel — aide à repérer des tendances plus tard.",
  "champRaison": "Raison",
  "aucuneRaison": "Aucune raison",
  "raisons": {
    "prix_trop_eleve": "Prix trop élevé",
    "delai_manque": "Délai manqué",
    "criteres_techniques_non_respectes": "Critères techniques non respectés",
    "concurrent_mieux_positionne": "Concurrent mieux positionné",
    "sans_reponse_acheteur": "Sans réponse de l'acheteur",
    "prix_competitif": "Prix compétitif",
    "references_solides": "Références solides",
    "relation_acheteur": "Relation avec l'acheteur",
    "qualite_technique": "Qualité technique",
    "autre": "Autre"
  },
  "champNote": "Note",
  "notePlaceholder": "Détail (optionnel)",
  "boutonPasser": "Passer",
  "boutonEnregistrer": "Enregistrer"
}
```

Dans `messages/en.json`, même namespace :

```json
"postMortem": {
  "titre": {
    "gagne": "Bid won — why?",
    "perdu": "Bid lost — why?"
  },
  "description": "Optional — helps spot patterns later.",
  "champRaison": "Reason",
  "aucuneRaison": "No reason",
  "raisons": {
    "prix_trop_eleve": "Price too high",
    "delai_manque": "Deadline missed",
    "criteres_techniques_non_respectes": "Technical criteria not met",
    "concurrent_mieux_positionne": "Competitor better positioned",
    "sans_reponse_acheteur": "No response from buyer",
    "prix_competitif": "Competitive price",
    "references_solides": "Strong references",
    "relation_acheteur": "Relationship with buyer",
    "qualite_technique": "Technical quality",
    "autre": "Other"
  },
  "champNote": "Note",
  "notePlaceholder": "Detail (optional)",
  "boutonPasser": "Skip",
  "boutonEnregistrer": "Save"
}
```

- [ ] **Step 2 : Créer `components/ao/resultat-dialogue.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RAISONS_RESULTAT_PERDU, RAISONS_RESULTAT_GAGNE } from "@/lib/appels-offres/types";

const VALEUR_AUCUNE_RAISON = "__aucune__";

export function ResultatDialogue({
  ouvert,
  onOuvertChange,
  statutPipeline,
  raisonInitiale,
  noteInitiale,
  onPasser,
  onEnregistrer,
}: {
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
  statutPipeline: "gagne" | "perdu";
  raisonInitiale: string | null;
  noteInitiale: string | null;
  onPasser?: () => Promise<void>;
  onEnregistrer: (raison: string | null, note: string | null) => Promise<void>;
}) {
  const t = useTranslations("Pipeline.postMortem");
  const [raison, setRaison] = useState(raisonInitiale ?? VALEUR_AUCUNE_RAISON);
  const [note, setNote] = useState(noteInitiale ?? "");
  const [envoi, setEnvoi] = useState(false);

  const raisons = statutPipeline === "perdu" ? RAISONS_RESULTAT_PERDU : RAISONS_RESULTAT_GAGNE;

  async function passer() {
    if (!onPasser) return;
    setEnvoi(true);
    await onPasser();
    setEnvoi(false);
  }

  async function enregistrer() {
    setEnvoi(true);
    await onEnregistrer(
      raison === VALEUR_AUCUNE_RAISON ? null : raison,
      note.trim().length > 0 ? note.trim() : null,
    );
    setEnvoi(false);
  }

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`titre.${statutPipeline}`)}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="resultat-raison">{t("champRaison")}</Label>
            <Select value={raison} onValueChange={setRaison}>
              <SelectTrigger id="resultat-raison">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={VALEUR_AUCUNE_RAISON}>{t("aucuneRaison")}</SelectItem>
                {raisons.map((valeur) => (
                  <SelectItem key={valeur} value={valeur}>
                    {t(`raisons.${valeur}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="resultat-note">{t("champNote")}</Label>
            <Textarea
              id="resultat-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("notePlaceholder")}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          {onPasser && (
            <Button type="button" variant="outline" onClick={passer} disabled={envoi}>
              {t("boutonPasser")}
            </Button>
          )}
          <Button type="button" onClick={enregistrer} disabled={envoi}>
            {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("boutonEnregistrer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Aucun `disabled` sur `Select`/`Dialog` eux-mêmes — seulement sur les deux `Button` natifs, conforme à la contrainte a11y de ce projet.

- [ ] **Step 3 : Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint components/ao/resultat-dialogue.tsx messages/`
Expected: aucune erreur.

- [ ] **Step 4 : Commit**

```bash
git add messages/fr.json messages/en.json components/ao/resultat-dialogue.tsx
git commit -m "feat(appels-offres): boîte de dialogue partagée de capture du résultat"
```

---

## Task 5 : Déclenchement depuis `StatutPipelineSelect`

**Files:**
- Modify: `app/(app)/pipeline/statut-pipeline-select.tsx`

**Interfaces:**
- Consumes : `ResultatDialogue` (Task 4), `modifierStatutPipeline` étendue (Task 3).

- [ ] **Step 1 : Remplacer `statut-pipeline-select.tsx`**

Remplacer tout le contenu du fichier par :

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { modifierStatutPipeline } from "@/lib/appels-offres/actions";
import { obtenirCouleurStatutPipeline } from "@/lib/appels-offres/statut-pipeline";
import { STATUTS_PIPELINE_AO, type StatutPipelineAo } from "@/lib/appels-offres/types";
import { ResultatDialogue } from "@/components/ao/resultat-dialogue";

const STYLES = {
  identifie: "bg-[hsl(var(--status-identifie))] text-slate-900",
  preparation: "bg-[hsl(var(--status-preparation))] text-white",
  soumis: "bg-[hsl(var(--status-soumis))] text-slate-900",
  gagne: "bg-[hsl(var(--status-gagne))] text-slate-900",
  perdu: "bg-[hsl(var(--status-perdu))] text-white",
} as const;

const CLES_LIBELLE: Record<StatutPipelineAo, string> = {
  identifie: "badge.identifie",
  en_preparation: "badge.enPreparation",
  soumis: "badge.soumis",
  en_attente: "badge.enAttente",
  gagne: "badge.gagne",
  perdu: "badge.perdu",
  sans_suite: "badge.sansSuite",
};

export function StatutPipelineSelect({
  appelOffresId,
  statutInitial,
}: {
  appelOffresId: string;
  statutInitial: StatutPipelineAo;
}) {
  const t = useTranslations("Pipeline");
  const [statut, setStatut] = useState(statutInitial);
  const [isPending, startTransition] = useTransition();
  const [statutEnAttenteDialogue, setStatutEnAttenteDialogue] = useState<
    "gagne" | "perdu" | null
  >(null);

  function onValueChange(valeur: string) {
    const nouveauStatut = valeur as StatutPipelineAo;

    if (nouveauStatut === "gagne" || nouveauStatut === "perdu") {
      setStatutEnAttenteDialogue(nouveauStatut);
      return;
    }

    const precedent = statut;
    setStatut(nouveauStatut);

    startTransition(async () => {
      const resultat = await modifierStatutPipeline(appelOffresId, nouveauStatut);
      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
        setStatut(precedent);
      } else {
        toast.success(t("table.toastStatutModifie"));
      }
    });
  }

  // Appelée depuis la boîte de dialogue (Passer ou Enregistrer) — gère son
  // propre état d'attente (resultat-dialogue.tsx) plutôt que isPending/
  // startTransition du Select, utilisés uniquement par le chemin direct
  // ci-dessus (changement vers un statut autre que gagné/perdu).
  //
  // `resultat` absent (bouton "Passer") appelle modifierStatutPipeline
  // avec SEULEMENT 2 arguments, pour que raisonResultat/noteResultat
  // restent `undefined` et soient omis de la requête UPDATE (voir Task 3)
  // — ne jamais passer `null, null` explicitement ici, ça écraserait une
  // raison déjà enregistrée lors d'un changement de statut antérieur.
  async function appliquerChangementStatut(
    nouveauStatut: "gagne" | "perdu",
    resultat?: { raison: string | null; note: string | null },
  ) {
    const precedent = statut;
    setStatut(nouveauStatut);
    const reponse = resultat
      ? await modifierStatutPipeline(appelOffresId, nouveauStatut, resultat.raison, resultat.note)
      : await modifierStatutPipeline(appelOffresId, nouveauStatut);
    if ("erreur" in reponse) {
      toast.error(reponse.erreur);
      setStatut(precedent);
    } else {
      toast.success(t("table.toastStatutModifie"));
    }
    setStatutEnAttenteDialogue(null);
  }

  const couleur = obtenirCouleurStatutPipeline(statut);

  return (
    <>
      <Select value={statut} onValueChange={onValueChange} disabled={isPending}>
        <SelectTrigger className={`w-40 border-transparent ${STYLES[couleur]}`}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUTS_PIPELINE_AO.map((valeur) => (
            <SelectItem key={valeur} value={valeur}>
              {t(CLES_LIBELLE[valeur])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {statutEnAttenteDialogue && (
        <ResultatDialogue
          ouvert={statutEnAttenteDialogue !== null}
          onOuvertChange={(ouvert) => {
            if (!ouvert) setStatutEnAttenteDialogue(null);
          }}
          statutPipeline={statutEnAttenteDialogue}
          raisonInitiale={null}
          noteInitiale={null}
          onPasser={() => appliquerChangementStatut(statutEnAttenteDialogue)}
          onEnregistrer={(raison, note) =>
            appliquerChangementStatut(statutEnAttenteDialogue, { raison, note })
          }
        />
      )}
    </>
  );
}
```

- [ ] **Step 2 : Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint "app/(app)/pipeline/statut-pipeline-select.tsx"`
Expected: aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add "app/(app)/pipeline/statut-pipeline-select.tsx"
git commit -m "feat(appels-offres): ouvre la capture du résultat au passage à gagné/perdu"
```

---

## Task 6 : `ResultatCard` sur la fiche AO

**Files:**
- Create: `app/(app)/appels-offres/[id]/resultat-card.tsx`
- Modify: `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes : `ResultatDialogue` (Task 4), `modifierResultatAo` (Task 3), `appelOffres.raison_resultat`/`note_resultat`/`statut_pipeline` (Task 2).

- [ ] **Step 1 : Ajouter les clés i18n**

Dans `messages/fr.json`, namespace `AppelsOffres.detail`, ajouter la clé `resultat` juste après `goNoGo` :

```json
"resultat": {
  "titre": "Résultat",
  "aucuneRaison": "Aucune raison renseignée.",
  "boutonAjouter": "Ajouter la raison",
  "boutonModifier": "Modifier",
  "toastEnregistre": "Résultat enregistré"
}
```

Dans `messages/en.json`, même namespace, même emplacement :

```json
"resultat": {
  "titre": "Result",
  "aucuneRaison": "No reason recorded.",
  "boutonAjouter": "Add the reason",
  "boutonModifier": "Edit",
  "toastEnregistre": "Result saved"
}
```

- [ ] **Step 2 : Créer `app/(app)/appels-offres/[id]/resultat-card.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { modifierResultatAo } from "@/lib/appels-offres/actions";
import { ResultatDialogue } from "@/components/ao/resultat-dialogue";

export function ResultatCard({
  appelOffresId,
  statutPipeline,
  raisonInitiale,
  noteInitiale,
}: {
  appelOffresId: string;
  statutPipeline: "gagne" | "perdu";
  raisonInitiale: string | null;
  noteInitiale: string | null;
}) {
  const t = useTranslations("AppelsOffres.detail.resultat");
  const tRaisons = useTranslations("Pipeline.postMortem.raisons");
  const [raison, setRaison] = useState(raisonInitiale);
  const [note, setNote] = useState(noteInitiale);
  const [dialogueOuvert, setDialogueOuvert] = useState(false);

  async function enregistrer(nouvelleRaison: string | null, nouvelleNote: string | null) {
    const resultat = await modifierResultatAo(appelOffresId, nouvelleRaison, nouvelleNote);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setRaison(nouvelleRaison);
    setNote(nouvelleNote);
    setDialogueOuvert(false);
    toast.success(t("toastEnregistre"));
  }

  const aUneRaisonOuNote = raison !== null || note !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titre")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {aUneRaisonOuNote ? (
          <>
            {raison && <p className="text-sm">{tRaisons(raison)}</p>}
            {note && <p className="text-sm text-muted-foreground">{note}</p>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("aucuneRaison")}</p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDialogueOuvert(true)}
          className="self-start"
        >
          {aUneRaisonOuNote ? t("boutonModifier") : t("boutonAjouter")}
        </Button>
      </CardContent>

      <ResultatDialogue
        ouvert={dialogueOuvert}
        onOuvertChange={setDialogueOuvert}
        statutPipeline={statutPipeline}
        raisonInitiale={raison}
        noteInitiale={note}
        onEnregistrer={enregistrer}
      />
    </Card>
  );
}
```

Pas de prop `onPasser` passée à `ResultatDialogue` ici — son absence masque déjà le bouton "Passer" dans la boîte de dialogue (voir Task 4), rien à faire de plus.

- [ ] **Step 3 : Intégrer dans `appel-offres-detail.tsx`**

Dans `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`, ajouter l'import `import { ResultatCard } from "./resultat-card";` à côté de l'import existant `import { GoNoGo } from "./go-no-go";`.

Remplacer :

```tsx
          <GoNoGo appelOffresId={appelOffres.id} evaluation={evaluationGoNoGo} />
```

par :

```tsx
          <GoNoGo appelOffresId={appelOffres.id} evaluation={evaluationGoNoGo} />

          {(appelOffres.statut_pipeline === "gagne" || appelOffres.statut_pipeline === "perdu") && (
            <ResultatCard
              appelOffresId={appelOffres.id}
              statutPipeline={appelOffres.statut_pipeline}
              raisonInitiale={appelOffres.raison_resultat}
              noteInitiale={appelOffres.note_resultat}
            />
          )}
```

- [ ] **Step 4 : Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint "app/(app)/appels-offres/[id]/resultat-card.tsx" "app/(app)/appels-offres/[id]/appel-offres-detail.tsx" messages/`
Expected: aucune erreur.

- [ ] **Step 5 : Commit**

```bash
git add messages/fr.json messages/en.json "app/(app)/appels-offres/[id]/resultat-card.tsx" "app/(app)/appels-offres/[id]/appel-offres-detail.tsx"
git commit -m "feat(appels-offres): carte résultat gagné-perdu sur la fiche AO"
```

---

## Task 7 : Vérification manuelle de bout en bout

Pas un commit de code — checklist de vérification navigateur (ne pas se contenter d'une lecture de code, cf. `noubinao_pilote_tests_sorel`).

Pré-requis : le contrôleur a appliqué et vérifié la migration du Task 1 avant de commencer cette checklist.

- [ ] **1. Migration appliquée** : `npx supabase db query --linked "select raison_resultat, note_resultat from appel_offres limit 1;"` ne renvoie pas d'erreur.
- [ ] **2. Passer, sur un AO "Perdu"** : dans `/pipeline`, passer un AO à "Perdu" → boîte de dialogue s'ouvre → cliquer "Passer" → statut change bien à "Perdu", aucune erreur, aucune raison enregistrée.
- [ ] **3. Enregistrer, sur un AO "Gagné"** : passer un autre AO à "Gagné" → choisir une raison (ex. "Prix compétitif") + écrire une note → "Enregistrer" → toast de confirmation, statut change.
- [ ] **4. Affichage sur la fiche détail** : ouvrir la fiche de l'AO gagné du point 3 → carte "Résultat" visible dans "Vue d'ensemble" → raison et note affichées correctement, bouton "Modifier".
- [ ] **5. Ajouter a posteriori** : ouvrir la fiche de l'AO perdu du point 2 (raison jamais saisie) → carte "Résultat" affiche "Aucune raison renseignée." + bouton "Ajouter la raison" → cliquer → boîte de dialogue sans bouton "Passer" → choisir une raison de la liste "perdu" → "Enregistrer" → carte mise à jour.
- [ ] **6. Modification** : rouvrir la carte "Résultat" de l'AO du point 3, cliquer "Modifier" → la boîte de dialogue est pré-remplie avec la raison et la note déjà saisies → changer la raison → "Enregistrer" → carte reflète le changement.
- [ ] **7. Pas de régression sur les autres statuts** : passer un AO à "En préparation" ou "Soumis" dans `/pipeline` → aucune boîte de dialogue ne s'ouvre, comportement identique à avant ce module.
- [ ] **8. Non-écrasement par "Passer"** : sur l'AO du point 3 (raison déjà enregistrée), repasser son statut à "En préparation" puis de nouveau à "Gagné" en cliquant "Passer" dans la boîte de dialogue cette fois → vérifier en base (`npx supabase db query --linked "select raison_resultat, note_resultat from appel_offres where id = '<id>';"`) que la raison précédente est toujours là, pas écrasée par `null`.
