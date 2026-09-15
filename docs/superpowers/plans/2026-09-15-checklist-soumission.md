# Checklist finale de soumission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une checklist finale sur la page détail d'un appel d'offres (AO), juste avant l'export du dossier, combinant des vérifications automatiques (calculées depuis l'état réel du dossier) et trois items manuels traçés (qui a coché, quand).

**Architecture:** Une fonction pure calcule les vérifications automatiques depuis les données déjà chargées (aucune nouvelle requête). Les 3 items manuels sont modélisés comme une table de liaison insert/delete (cocher = insérer une ligne, décocher = la supprimer), même pattern que `exigence_document`/`section_document` déjà en place — jamais de policy `update`, donc aucun risque de retomber dans le piège RLS `WITH CHECK` déjà rencontré dans ce projet. La checklist n'est jamais bloquante : elle informe, elle ne désactive jamais le bouton d'export.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase Postgres/RLS, next-intl, Vitest, shadcn/ui (`Checkbox`, `Label`).

## Global Constraints

- Jamais bloquant : la checklist ne désactive jamais le bouton "Exporter le dossier", quel que soit l'état des vérifications.
- Trois items manuels fixes, exactement ces clés : `pieces_signees`, `prix_verifie`, `depose_sigmap` — pas de personnalisation par l'utilisateur.
- Table `checklist_item_dossier` en modèle insert/delete (présence de ligne = coché), jamais de colonne booléenne mise à jour, jamais de policy RLS `update`.
- `coche_par` nullable avec `on delete set null` (pas `not null`/`cascade`) — un item coché reste coché même si la personne qui l'a coché quitte l'entreprise.
- La migration SQL ne doit PAS être appliquée à la base Supabase distante par l'implémenteur (`supabase db push` interdit dans ce plan) — elle sera relue et appliquée séparément par le contrôleur une fois la branche entière revue, pratique déjà établie dans ce projet suite à un incident où un correctif RLS avait été poussé sans validation préalable.
- Ne jamais ajouter les nouveaux champs checklist au retour de `obtenirAppelOffres` — cette fonction a plusieurs appelants (`exporterDossierReponse`, `genererContenuSection`) qui n'en ont pas besoin (leçon tirée de la revue finale du Module 6, sous-projet 3).

---

### Task 1: Modèle de données — migration + type des items manuels

**Files:**
- Create: `supabase/migrations/20260915120000_checklist_item_dossier.sql`
- Modify: `lib/appels-offres/types.ts`

**Interfaces:**
- Produces: `CLES_CHECKLIST_MANUELLE: readonly ["pieces_signees", "prix_verifie", "depose_sigmap"]`, `CleChecklistManuelle = "pieces_signees" | "prix_verifie" | "depose_sigmap"` — consommés par Task 3 (lecture/écriture Supabase) et Task 4 (UI).

- [ ] **Step 1: Écrire la migration**

Créer `supabase/migrations/20260915120000_checklist_item_dossier.sql` :

```sql
-- Checklist de soumission (items manuels uniquement — les vérifications
-- automatiques ne sont jamais persistées, elles sont recalculées à
-- chaque affichage depuis l'état réel du dossier, voir
-- lib/appels-offres/checklist.ts).
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

- [ ] **Step 2: Ajouter le type des items manuels**

À la fin de `lib/appels-offres/types.ts`, ajouter (même convention que `TYPES_EXIGENCE_AO`/`TypeExigenceAo` déjà dans ce fichier) :

```ts
export const CLES_CHECKLIST_MANUELLE = [
  "pieces_signees",
  "prix_verifie",
  "depose_sigmap",
] as const;

export type CleChecklistManuelle = (typeof CLES_CHECKLIST_MANUELLE)[number];
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: NE PAS exécuter `supabase db push`**

La migration reste locale pour l'instant — elle sera appliquée par le contrôleur une fois la branche entière revue (voir Global Constraints). N'exécute aucune commande touchant la base Supabase distante dans cette tâche.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260915120000_checklist_item_dossier.sql lib/appels-offres/types.ts
git commit -m "feat: table checklist_item_dossier + type CleChecklistManuelle"
```

---

### Task 2: Vérifications automatiques (`calculerChecklistAutomatique`, TDD)

**Files:**
- Create: `lib/appels-offres/checklist.ts`
- Create: `lib/appels-offres/checklist.test.ts`

**Interfaces:**
- Consumes: `ExigenceAo`, `SectionDossier` depuis `./types` (déjà existants — ne pas les redéfinir) ; `Document` depuis `@/lib/documents/types` (déjà existant).
- Produces: `CleItemAutomatique = "pieces_manquantes" | "sections_en_brouillon" | "documents_expires"`, `interface ItemChecklistAutomatique { cle: CleItemAutomatique; ok: boolean; nombre: number }`, `calculerChecklistAutomatique(exigences: ExigenceAo[], documentsParExigence: Record<string, Document[]>, sections: SectionDossier[], documentsParSection: Record<string, Document[]>, maintenant?: Date): ItemChecklistAutomatique[]` — consommés par Task 4 (`page.tsx` et le composant UI).

- [ ] **Step 1: Écrire les tests (ils doivent tous échouer, le fichier `checklist.ts` n'existe pas encore)**

Créer `lib/appels-offres/checklist.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { calculerChecklistAutomatique } from "./checklist";
import type { ExigenceAo, SectionDossier } from "./types";
import type { Document } from "@/lib/documents/types";

function exigence(overrides: Partial<ExigenceAo> = {}): ExigenceAo {
  return {
    id: "exigence-1",
    appel_offres_id: "ao-1",
    type_exigence: "piece_requise",
    libelle: "RCCM",
    description: null,
    ponderation: null,
    source_section: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function section(overrides: Partial<SectionDossier> = {}): SectionDossier {
  return {
    id: "section-1",
    dossier_reponse_id: "dossier-1",
    titre: "Méthodologie",
    contenu: null,
    statut: "validee",
    generated_at: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function document(overrides: Partial<Document> = {}): Document {
  return {
    id: "document-1",
    entreprise_id: "entreprise-1",
    type: "piece_administrative",
    nom: "RCCM",
    fichier_path: "path/to/file",
    fichier_nom_original: "rccm.pdf",
    mime_type: "application/pdf",
    taille_octets: 1000,
    date_expiration: null,
    contenu_markdown: null,
    source_ocr: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const MAINTENANT = new Date("2026-09-15T00:00:00Z");

describe("calculerChecklistAutomatique", () => {
  it("toutes les pièces requises couvertes -> ok", () => {
    const e = exigence({ id: "e1", type_exigence: "piece_requise" });
    const doc = document({ id: "d1" });
    const resultat = calculerChecklistAutomatique([e], { e1: [doc] }, [], {});
    expect(resultat.find((i) => i.cle === "pieces_manquantes")).toEqual({
      cle: "pieces_manquantes",
      ok: true,
      nombre: 0,
    });
  });

  it("une pièce requise sans document -> problème", () => {
    const e = exigence({ id: "e1", type_exigence: "piece_requise" });
    const resultat = calculerChecklistAutomatique([e], {}, [], {});
    expect(resultat.find((i) => i.cle === "pieces_manquantes")).toEqual({
      cle: "pieces_manquantes",
      ok: false,
      nombre: 1,
    });
  });

  it("un critère d'évaluation sans document ne compte pas comme pièce manquante", () => {
    const e = exigence({ id: "e1", type_exigence: "critere_evaluation" });
    const resultat = calculerChecklistAutomatique([e], {}, [], {});
    expect(resultat.find((i) => i.cle === "pieces_manquantes")).toEqual({
      cle: "pieces_manquantes",
      ok: true,
      nombre: 0,
    });
  });

  it("toutes les sections validées -> ok", () => {
    const s = section({ statut: "validee" });
    const resultat = calculerChecklistAutomatique([], {}, [s], {});
    expect(resultat.find((i) => i.cle === "sections_en_brouillon")).toEqual({
      cle: "sections_en_brouillon",
      ok: true,
      nombre: 0,
    });
  });

  it("une section en brouillon -> problème", () => {
    const s = section({ statut: "brouillon" });
    const resultat = calculerChecklistAutomatique([], {}, [s], {});
    expect(resultat.find((i) => i.cle === "sections_en_brouillon")).toEqual({
      cle: "sections_en_brouillon",
      ok: false,
      nombre: 1,
    });
  });

  it("un document dont la date d'expiration est future n'est pas compté", () => {
    const e = exigence({ id: "e1", type_exigence: "piece_requise" });
    const doc = document({ id: "d1", date_expiration: "2027-01-01T00:00:00Z" });
    const resultat = calculerChecklistAutomatique([e], { e1: [doc] }, [], {}, MAINTENANT);
    expect(resultat.find((i) => i.cle === "documents_expires")).toEqual({
      cle: "documents_expires",
      ok: true,
      nombre: 0,
    });
  });

  it("un document déjà expiré utilisé comme pièce requise est compté", () => {
    const e = exigence({ id: "e1", type_exigence: "piece_requise" });
    const doc = document({ id: "d1", date_expiration: "2026-01-01T00:00:00Z" });
    const resultat = calculerChecklistAutomatique([e], { e1: [doc] }, [], {}, MAINTENANT);
    expect(resultat.find((i) => i.cle === "documents_expires")).toEqual({
      cle: "documents_expires",
      ok: false,
      nombre: 1,
    });
  });

  it("le même document expiré utilisé en pièce requise et en section n'est compté qu'une fois", () => {
    const e = exigence({ id: "e1", type_exigence: "piece_requise" });
    const s = section({ id: "s1", statut: "validee" });
    const doc = document({ id: "d1", date_expiration: "2026-01-01T00:00:00Z" });
    const resultat = calculerChecklistAutomatique(
      [e],
      { e1: [doc] },
      [s],
      { s1: [doc] },
      MAINTENANT,
    );
    expect(resultat.find((i) => i.cle === "documents_expires")).toEqual({
      cle: "documents_expires",
      ok: false,
      nombre: 1,
    });
  });

  it("aucune exigence/section/document -> tous les items sont ok", () => {
    const resultat = calculerChecklistAutomatique([], {}, [], {});
    expect(resultat).toEqual([
      { cle: "pieces_manquantes", ok: true, nombre: 0 },
      { cle: "sections_en_brouillon", ok: true, nombre: 0 },
      { cle: "documents_expires", ok: true, nombre: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/appels-offres/checklist.test.ts`
Expected: FAIL — `Cannot find module './checklist'` (le fichier n'existe pas encore).

- [ ] **Step 3: Écrire l'implémentation**

Créer `lib/appels-offres/checklist.ts` :

```ts
import type { ExigenceAo, SectionDossier } from "./types";
import type { Document } from "@/lib/documents/types";

export type CleItemAutomatique =
  | "pieces_manquantes"
  | "sections_en_brouillon"
  | "documents_expires";

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

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run lib/appels-offres/checklist.test.ts`
Expected: PASS, 9/9 tests verts.

- [ ] **Step 5: Vérifier que le projet compile toujours**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/checklist.ts lib/appels-offres/checklist.test.ts
git commit -m "feat: calculerChecklistAutomatique (TDD)"
```

---

### Task 3: Lecture et bascule des items manuels

**Files:**
- Modify: `lib/appels-offres/queries.ts`
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: `CleChecklistManuelle` depuis `./types` (Task 1) ; `createClient` (déjà importé dans les deux fichiers) ; `obtenirUtilisateurCourant` (déjà importé dans `actions.ts`) ; `revalidatePath` (déjà importé dans `actions.ts`).
- Produces: `listerChecklistManuelle(dossierReponseId: string): Promise<CleChecklistManuelle[]>`, `basculerChecklistManuelle(appelOffresId: string, dossierReponseId: string, cleItem: CleChecklistManuelle): Promise<{ erreur: string } | { succes: true }>` — consommés par Task 4 (`page.tsx` et le composant UI).

- [ ] **Step 1: Ajouter `listerChecklistManuelle` à `lib/appels-offres/queries.ts`**

Ajouter l'import du type en haut du fichier — la ligne actuelle :

```ts
import type { AppelOffres, DossierReponse, ExigenceAo, SectionDossier } from "./types";
```

devient :

```ts
import type { AppelOffres, CleChecklistManuelle, DossierReponse, ExigenceAo, SectionDossier } from "./types";
```

Puis ajouter à la fin du fichier :

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

- [ ] **Step 2: Ajouter `basculerChecklistManuelle` à `lib/appels-offres/actions.ts`**

Ajouter l'import du type — la ligne actuelle :

```ts
import type { AppelOffres, StatutPipelineAo, StatutSectionDossier } from "./types";
```

devient :

```ts
import type { AppelOffres, CleChecklistManuelle, StatutPipelineAo, StatutSectionDossier } from "./types";
```

Puis ajouter à la fin du fichier :

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

`appelOffresId` sert uniquement à construire la bonne URL de revalidation
(`dossier_reponse_id` ne correspond à aucune route) — même raison d'être
que le premier paramètre de `lierEmailAAppelOffres` (Module 6).

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Vérifier que les tests passent toujours**

Run: `npx vitest run`
Expected: PASS, tous les tests verts (aucune régression, aucun nouveau test dans cette tâche — pas de test sur les fonctions Supabase, cohérent avec le reste du projet).

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/queries.ts lib/appels-offres/actions.ts
git commit -m "feat: listerChecklistManuelle + basculerChecklistManuelle"
```

---

### Task 4: Interface — checklist sur la page détail AO

**Files:**
- Create: `app/(app)/appels-offres/[id]/checklist-soumission.tsx`
- Modify: `app/(app)/appels-offres/[id]/page.tsx`
- Modify: `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `calculerChecklistAutomatique`, `ItemChecklistAutomatique` (Task 2) ; `listerChecklistManuelle`, `basculerChecklistManuelle` (Task 3) ; `CLES_CHECKLIST_MANUELLE`, `CleChecklistManuelle` (Task 1).

- [ ] **Step 1: Ajouter les traductions dans `messages/fr.json`**

Le bloc `"detail"` actuel contient (dans `"AppelsOffres"`) :

```json
      "filSuivi": {
        "titre": "Fil de suivi",
        "aucunEmailLie": "Aucun email lié pour l'instant.",
        "sansObjet": "(sans objet)",
        "delier": "Délier",
        "placeholderSelect": "Lier un email...",
        "aucuneSuggestion": "Aucun email correspondant trouvé.",
        "erreurRattachement": "Échec du rattachement. Réessayez.",
        "erreurDissociation": "Échec de la dissociation. Réessayez."
      },
      "error": {
        "message": "Impossible de charger cet appel d'offres.",
        "reessayer": "Réessayer"
      }
```

Remplacer par (ajout du bloc `checklist` avant `error`) :

```json
      "filSuivi": {
        "titre": "Fil de suivi",
        "aucunEmailLie": "Aucun email lié pour l'instant.",
        "sansObjet": "(sans objet)",
        "delier": "Délier",
        "placeholderSelect": "Lier un email...",
        "aucuneSuggestion": "Aucun email correspondant trouvé.",
        "erreurRattachement": "Échec du rattachement. Réessayez.",
        "erreurDissociation": "Échec de la dissociation. Réessayez."
      },
      "checklist": {
        "titre": "Checklist avant soumission",
        "pretPourSoumission": "Prêt pour soumission",
        "pointsAVerifier": "{count, plural, one {# point à vérifier avant soumission} other {# points à vérifier avant soumission}}",
        "auto": {
          "piecesManquantes": "{count, plural, =0 {Toutes les pièces requises ont un document associé} one {# pièce requise sans document associé} other {# pièces requises sans document associé}}",
          "sectionsEnBrouillon": "{count, plural, =0 {Toutes les sections sont validées} one {# section encore en brouillon} other {# sections encore en brouillon}}",
          "documentsExpires": "{count, plural, =0 {Aucun document expiré utilisé} one {# document expiré utilisé} other {# documents expirés utilisés}}"
        },
        "manuel": {
          "piecesSignees": "Pièces signées par la personne habilitée",
          "prixVerifie": "Prix vérifié et cohérent",
          "deposeSigmap": "Déposé sur SIGMAP et récépissé conservé"
        },
        "erreurBascule": "Échec de la mise à jour. Réessayez."
      },
      "error": {
        "message": "Impossible de charger cet appel d'offres.",
        "reessayer": "Réessayer"
      }
```

- [ ] **Step 2: Ajouter les mêmes traductions dans `messages/en.json`**

Le bloc `"detail"` actuel contient :

```json
      "filSuivi": {
        "titre": "Activity thread",
        "aucunEmailLie": "No email linked yet.",
        "sansObjet": "(no subject)",
        "delier": "Unlink",
        "placeholderSelect": "Link an email...",
        "aucuneSuggestion": "No matching email found.",
        "erreurRattachement": "Failed to link the email. Please try again.",
        "erreurDissociation": "Failed to unlink the email. Please try again."
      },
      "error": {
        "message": "Could not load this tender.",
        "reessayer": "Retry"
      }
```

Remplacer par :

```json
      "filSuivi": {
        "titre": "Activity thread",
        "aucunEmailLie": "No email linked yet.",
        "sansObjet": "(no subject)",
        "delier": "Unlink",
        "placeholderSelect": "Link an email...",
        "aucuneSuggestion": "No matching email found.",
        "erreurRattachement": "Failed to link the email. Please try again.",
        "erreurDissociation": "Failed to unlink the email. Please try again."
      },
      "checklist": {
        "titre": "Pre-submission checklist",
        "pretPourSoumission": "Ready for submission",
        "pointsAVerifier": "{count, plural, one {# point to check before submission} other {# points to check before submission}}",
        "auto": {
          "piecesManquantes": "{count, plural, =0 {All required documents are linked} one {# required document missing a file} other {# required documents missing a file}}",
          "sectionsEnBrouillon": "{count, plural, =0 {All sections are approved} one {# section still a draft} other {# sections still a draft}}",
          "documentsExpires": "{count, plural, =0 {No expired document in use} one {# expired document in use} other {# expired documents in use}}"
        },
        "manuel": {
          "piecesSignees": "Documents signed by an authorized person",
          "prixVerifie": "Price checked and consistent",
          "deposeSigmap": "Submitted on SIGMAP with receipt kept"
        },
        "erreurBascule": "Update failed. Please try again."
      },
      "error": {
        "message": "Could not load this tender.",
        "reessayer": "Retry"
      }
```

- [ ] **Step 3: Vérifier que les deux fichiers restent du JSON valide**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('OK')"`
Expected: `OK`.

- [ ] **Step 4: Créer `app/(app)/appels-offres/[id]/checklist-soumission.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { basculerChecklistManuelle } from "@/lib/appels-offres/actions";
import { CLES_CHECKLIST_MANUELLE, type CleChecklistManuelle } from "@/lib/appels-offres/types";
import type { ItemChecklistAutomatique } from "@/lib/appels-offres/checklist";

const CLES_AUTO_VERS_TRADUCTION: Record<ItemChecklistAutomatique["cle"], string> = {
  pieces_manquantes: "piecesManquantes",
  sections_en_brouillon: "sectionsEnBrouillon",
  documents_expires: "documentsExpires",
};

const CLES_MANUEL_VERS_TRADUCTION: Record<CleChecklistManuelle, string> = {
  pieces_signees: "piecesSignees",
  prix_verifie: "prixVerifie",
  depose_sigmap: "deposeSigmap",
};

export function ChecklistSoumission({
  appelOffresId,
  dossierReponseId,
  checklistAutomatique,
  checklistManuelle: checklistManuelleInitiale,
}: {
  appelOffresId: string;
  dossierReponseId: string;
  checklistAutomatique: ItemChecklistAutomatique[];
  checklistManuelle: CleChecklistManuelle[];
}) {
  const t = useTranslations("AppelsOffres.detail.checklist");
  const [checklistManuelle, setChecklistManuelle] = useState(checklistManuelleInitiale);
  const [isPending, startTransition] = useTransition();

  function basculer(cleItem: CleChecklistManuelle, coche: boolean) {
    const precedent = checklistManuelle;
    setChecklistManuelle((liste) =>
      coche ? [...liste, cleItem] : liste.filter((c) => c !== cleItem),
    );

    startTransition(async () => {
      const resultat = await basculerChecklistManuelle(appelOffresId, dossierReponseId, cleItem);
      if ("erreur" in resultat) {
        toast.error(t("erreurBascule"));
        setChecklistManuelle(precedent);
      }
    });
  }

  const nombreProblemesAuto = checklistAutomatique.filter((item) => !item.ok).length;
  const nombreItemsManuelsRestants = CLES_CHECKLIST_MANUELLE.length - checklistManuelle.length;
  const nombreTotal = nombreProblemesAuto + nombreItemsManuelsRestants;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("titre")}</h2>
        <span className="text-sm text-muted-foreground">
          {nombreTotal === 0
            ? t("pretPourSoumission")
            : t("pointsAVerifier", { count: nombreTotal })}
        </span>
      </div>

      <ul className="flex flex-col gap-1 text-sm">
        {checklistAutomatique.map((item) => (
          <li key={item.cle} className="flex items-center gap-2">
            <span className={item.ok ? "text-green-600" : "text-amber-600"}>
              {item.ok ? "✓" : "⚠"}
            </span>
            <span>{t(`auto.${CLES_AUTO_VERS_TRADUCTION[item.cle]}`, { count: item.nombre })}</span>
          </li>
        ))}
      </ul>

      <ul className="flex flex-col gap-2 text-sm">
        {CLES_CHECKLIST_MANUELLE.map((cle) => {
          const coche = checklistManuelle.includes(cle);
          return (
            <li key={cle} className="flex items-center gap-2">
              <Checkbox
                id={`checklist-${cle}`}
                checked={coche}
                disabled={isPending}
                onCheckedChange={(valeur) => basculer(cle, valeur === true)}
              />
              <Label htmlFor={`checklist-${cle}`}>
                {t(`manuel.${CLES_MANUEL_VERS_TRADUCTION[cle]}`)}
              </Label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Modifier `app/(app)/appels-offres/[id]/page.tsx`**

L'import actuel :

```tsx
import { obtenirAppelOffres } from "@/lib/appels-offres/queries";
import { listerDocuments } from "@/lib/documents/queries";
import { listerEmailsLies, obtenirSuggestionsEmail } from "@/lib/email/queries";
```

devient :

```tsx
import { obtenirAppelOffres, listerChecklistManuelle } from "@/lib/appels-offres/queries";
import { calculerChecklistAutomatique } from "@/lib/appels-offres/checklist";
import { listerDocuments } from "@/lib/documents/queries";
import { listerEmailsLies, obtenirSuggestionsEmail } from "@/lib/email/queries";
```

Le chargement des données actuel :

```tsx
  const resultat = await obtenirAppelOffres(id, utilisateur.entreprise_id);
  if (!resultat) notFound();

  const [bibliotheque, emailsLies, suggestions] = await Promise.all([
    listerDocuments(utilisateur.entreprise_id),
    listerEmailsLies(id),
    obtenirSuggestionsEmail(utilisateur.id, {
      titre: resultat.appelOffres.titre,
      acheteur: resultat.appelOffres.acheteur,
      date_limite: resultat.appelOffres.date_limite,
    }),
  ]);
```

devient :

```tsx
  const resultat = await obtenirAppelOffres(id, utilisateur.entreprise_id);
  if (!resultat) notFound();

  const [bibliotheque, emailsLies, suggestions, checklistManuelle] = await Promise.all([
    listerDocuments(utilisateur.entreprise_id),
    listerEmailsLies(id),
    obtenirSuggestionsEmail(utilisateur.id, {
      titre: resultat.appelOffres.titre,
      acheteur: resultat.appelOffres.acheteur,
      date_limite: resultat.appelOffres.date_limite,
    }),
    listerChecklistManuelle(resultat.dossierReponse.id),
  ]);

  const checklistAutomatique = calculerChecklistAutomatique(
    resultat.exigences,
    resultat.documentsParExigence,
    resultat.sections,
    resultat.documentsParSection,
  );
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
      />
```

- [ ] **Step 6: Modifier `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`**

L'import de types actuel (ligne proche du haut du fichier) :

```tsx
import type { AppelOffres, ExigenceAo } from "@/lib/appels-offres/types";
```

devient :

```tsx
import type { AppelOffres, CleChecklistManuelle, ExigenceAo } from "@/lib/appels-offres/types";
```

Juste après l'import de `FilSuivi` et `EmailResume` (fin du bloc d'imports) :

```tsx
import { FilSuivi } from "./fil-suivi";
import type { EmailResume } from "@/lib/email/types";
```

ajouter :

```tsx
import { FilSuivi } from "./fil-suivi";
import type { EmailResume } from "@/lib/email/types";
import { ChecklistSoumission } from "./checklist-soumission";
import type { ItemChecklistAutomatique } from "@/lib/appels-offres/checklist";
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
}: {
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  documentsParExigence: Record<string, Document[]>;
  bibliotheque: Document[];
  sections: SectionDossier[];
  documentsParSection: Record<string, Document[]>;
  emailsLies: EmailResume[];
  suggestions: EmailResume[];
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
}) {
```

Le bloc "Rédaction assistée" actuel se termine, suivi directement par le
bouton d'export :

```tsx
          {appelOffres.sommaire_attendu && appelOffres.sommaire_attendu.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">{t("redaction.titre")}</h2>
              {appelOffres.sommaire_attendu.map((titreSection) => {
                const section = sections.find((s) => s.titre === titreSection);
                return (
                  <SectionRedaction
                    key={titreSection}
                    appelOffresId={appelOffres.id}
                    titreSection={titreSection}
                    section={section}
                    documentsSource={section ? (documentsParSection[section.id] ?? []) : []}
                    bibliotheque={bibliotheque}
                  />
                );
              })}
            </div>
          )}

          <Button onClick={exporter} disabled={exportation}>
            {t("boutonExporter")}
          </Button>
```

Remplacer par (insertion de la checklist entre les deux) :

```tsx
          {appelOffres.sommaire_attendu && appelOffres.sommaire_attendu.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">{t("redaction.titre")}</h2>
              {appelOffres.sommaire_attendu.map((titreSection) => {
                const section = sections.find((s) => s.titre === titreSection);
                return (
                  <SectionRedaction
                    key={titreSection}
                    appelOffresId={appelOffres.id}
                    titreSection={titreSection}
                    section={section}
                    documentsSource={section ? (documentsParSection[section.id] ?? []) : []}
                    bibliotheque={bibliotheque}
                  />
                );
              })}
            </div>
          )}

          <ChecklistSoumission
            appelOffresId={appelOffres.id}
            dossierReponseId={dossierReponseId}
            checklistAutomatique={checklistAutomatique}
            checklistManuelle={checklistManuelle}
          />

          <Button onClick={exporter} disabled={exportation}>
            {t("boutonExporter")}
          </Button>
```

- [ ] **Step 7: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 8: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`
Expected: tous les tests passent (les 9 tests de la Task 2 + tous les tests existants, aucune régression).

- [ ] **Step 9: Vérifier le build de production**

Run: `npx next build`
Expected: build réussi, aucune erreur.

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/appels-offres/[id]/checklist-soumission.tsx" "app/(app)/appels-offres/[id]/page.tsx" "app/(app)/appels-offres/[id]/appel-offres-detail.tsx" messages/fr.json messages/en.json
git commit -m "feat: interface checklist finale de soumission"
```

---

## Self-Review Notes

- **Couverture du spec** : modèle de données + type manuel (Task 1),
  vérifications automatiques en TDD (Task 2), lecture/bascule Supabase
  (Task 3), interface + i18n (Task 4) — chaque section du spec a une
  tâche correspondante. Les sections "Intégration dans
  `obtenirAppelOffres`/`page.tsx`" et "Interface" du spec sont fusionnées
  dans la Task 4 plutôt que séparées : les séparer aurait laissé un état
  transitoire non significatif (des props calculées mais jamais
  affichées, ou une prop passée à un composant qui ne la déclare pas
  encore) sans bénéfice de revue supplémentaire — contrairement au
  Module 6 où la taille du refactor de `obtenirAppelOffres` (plusieurs
  appelants à corriger) justifiait une tâche dédiée.
- **Cohérence des types** : `CleChecklistManuelle` défini une seule fois
  (Task 1, `lib/appels-offres/types.ts`), réutilisé sans redéfinition
  dans `queries.ts`/`actions.ts` (Task 3) et `checklist-soumission.tsx`
  (Task 4). `CleItemAutomatique`/`ItemChecklistAutomatique` définis une
  seule fois (Task 2, `checklist.ts`), réutilisés à l'identique dans
  `page.tsx` et le composant UI (Task 4).
- **Aucun placeholder** : chaque étape contient le code exact à écrire
  ou le texte exact à remplacer, y compris les 9 tests complets de la
  Task 2.
- **Vérification manuelle en conditions réelles** : ce plan est
  entièrement testable une fois la migration appliquée (par le
  contrôleur, hors de ce plan) sur un AO déjà traité par NoubinAO — à
  faire une fois les 4 tâches exécutées, avant de proposer le merge.
