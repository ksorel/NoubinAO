# Transformation des CV selon le modèle du DAO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer un CV de la bibliothèque documentaire selon le modèle imposé par un DAO donné, uniquement quand ce modèle a été téléversé sur l'AO — après avoir corrigé une dette pré-existante (le contenu texte des documents bibliothèque n'était jamais extrait) dont cette fonctionnalité dépend entièrement.

**Architecture:** Cinq tâches séquentielles. D'abord un fix applicatif pur (normalisation bibliothèque, aucune migration). Puis le modèle de données (colonnes `modele_cv_*` sur `appel_offres`, table `cv_transforme`). Puis la logique pure + l'appel IA + le générateur `.docx`. Puis les Server Actions et la requête de lecture. Enfin l'interface (upload du modèle, boutons de transformation dans `DocumentsExigence`).

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase Postgres/RLS + Storage, Zod, next-intl, Vitest, API Claude (`@anthropic-ai/sdk`), `docx` (génération Word), nouvelle dépendance `word-extractor` (extraction `.doc` legacy).

## Global Constraints

- Aucun retrait de format accepté à l'upload bibliothèque (PDF, DOC legacy, DOCX, JPEG, PNG restent tous acceptés) — chacun doit avoir une vraie voie de normalisation.
- Traitement de normalisation toujours **best-effort, jamais bloquant** pour un upload : une erreur de normalisation loggue et laisse `contenu_markdown: null`, ne fait jamais échouer l'upload lui-même.
- Traitement **synchrone** partout dans ce plan (bibliothèque, modèle de CV, transformation) — pas de nouvelle file QStash.
- Un seul modèle de CV par AO, stocké sur `appel_offres` (pas un nouveau type de document bibliothèque).
- La transformation ne s'affiche dans l'UI **que si** un modèle de CV existe sur l'AO — jamais par défaut.
- Sortie de la transformation : un `.docx` **séparé**, jamais fusionné dans l'export du dossier principal (`export/plan.ts`/`export/docx.ts` restent inchangés).
- Une régénération **remplace** le résultat précédent (`upsert` sur contrainte unique `(appel_offres_id, document_id)`) — pas d'historique de versions.
- Pas de rattrapage rétroactif sur les documents bibliothèque déjà existants.
- Migration SQL créée mais **jamais poussée par l'implémenteur** (`supabase db push` interdit) — relue et appliquée séparément par le contrôleur avant le merge.
- Aucun nouveau test sur les Server Actions, les composants UI, ni le code appelant l'API Claude — seule la logique pure (`construirePromptCvTransformation`) est testée (TDD), cohérent avec le reste du projet.

---

### Task 1: Fix normalisation bibliothèque documentaire

**Files:**
- Create: `types/word-extractor.d.ts`
- Create: `lib/documents/normalisation.ts`
- Create: `lib/documents/normalisation.test.ts`
- Modify: `lib/documents/actions.ts`
- Modify: `package.json` (nouvelle dépendance `word-extractor`)

**Interfaces:**
- Produces: `normaliserDocument(buffer: Buffer, mimeType: string): Promise<{ markdown: string | null; sourceOcr: boolean }>` — consommé par cette même tâche (`ajouterDocument`) et réutilisé conceptuellement (mais pas directement) par la Task 2 (qui réutilise `normaliserDao` en direct, pas cette fonction — un modèle de CV est toujours PDF/DOCX, jamais scanné en image ni en `.doc`).

- [ ] **Step 1: Installer `word-extractor`**

Run: `npm install word-extractor`
Expected: ajout dans `package.json` (`dependencies`), `package-lock.json` mis à jour. Note la version installée dans le rapport.

- [ ] **Step 2: Déclaration de types ambiante pour `word-extractor`**

`word-extractor` n'a pas de types TypeScript officiels connus. Créer
`types/word-extractor.d.ts` :

```ts
declare module "word-extractor" {
  interface ExtractedDocument {
    getBody(): string;
  }

  export default class WordExtractor {
    extract(input: Buffer | string): Promise<ExtractedDocument>;
  }
}
```

- [ ] **Step 3: Vérifier que le projet compile avec cette déclaration**

Run: `npx tsc --noEmit`
Expected: aucune erreur (le fichier `.d.ts` est repris automatiquement via
`include: ["**/*.ts"]` dans `tsconfig.json`).

- [ ] **Step 4: Écrire les tests de `normaliserDocument` (doivent échouer, le fichier n'existe pas)**

Créer `lib/documents/normalisation.test.ts` :

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/appels-offres/normalisation/normaliser", () => ({
  normaliserDao: vi.fn(async () => ({ markdown: "# DAO markdown", sections: [] })),
  MIME_PDF: "application/pdf",
  MIME_DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}));

vi.mock("@/lib/appels-offres/normalisation/ocr", () => ({
  lireImageParClaude: vi.fn(async () => "texte OCR de l'image"),
}));

vi.mock("word-extractor", () => ({
  default: class WordExtractorMock {
    async extract() {
      return { getBody: () => "texte du .doc legacy" };
    }
  },
}));

import { normaliserDocument } from "./normalisation";

describe("normaliserDocument", () => {
  it("délègue à normaliserDao pour un PDF", async () => {
    const resultat = await normaliserDocument(Buffer.from("x"), "application/pdf");
    expect(resultat).toEqual({ markdown: "# DAO markdown", sourceOcr: false });
  });

  it("délègue à normaliserDao pour un DOCX", async () => {
    const resultat = await normaliserDocument(
      Buffer.from("x"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(resultat).toEqual({ markdown: "# DAO markdown", sourceOcr: false });
  });

  it("passe par l'OCR Claude pour une image JPEG, sourceOcr à true", async () => {
    const resultat = await normaliserDocument(Buffer.from("x"), "image/jpeg");
    expect(resultat).toEqual({ markdown: "texte OCR de l'image", sourceOcr: true });
  });

  it("passe par l'OCR Claude pour une image PNG, sourceOcr à true", async () => {
    const resultat = await normaliserDocument(Buffer.from("x"), "image/png");
    expect(resultat).toEqual({ markdown: "texte OCR de l'image", sourceOcr: true });
  });

  it("extrait le texte brut d'un .doc legacy via word-extractor, sourceOcr à false", async () => {
    const resultat = await normaliserDocument(Buffer.from("x"), "application/msword");
    expect(resultat).toEqual({ markdown: "texte du .doc legacy", sourceOcr: false });
  });

  it("retourne markdown null pour un type MIME non reconnu", async () => {
    const resultat = await normaliserDocument(Buffer.from("x"), "application/zip");
    expect(resultat).toEqual({ markdown: null, sourceOcr: false });
  });
});
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/documents/normalisation.test.ts`
Expected: FAIL — `./normalisation` introuvable.

- [ ] **Step 6: Écrire l'implémentation**

Créer `lib/documents/normalisation.ts` :

```ts
import WordExtractor from "word-extractor";
import { normaliserDao, MIME_PDF, MIME_DOCX } from "@/lib/appels-offres/normalisation/normaliser";
import { lireImageParClaude } from "@/lib/appels-offres/normalisation/ocr";

const MIME_DOC_LEGACY = "application/msword";
const MIME_JPEG = "image/jpeg";
const MIME_PNG = "image/png";

export async function normaliserDocument(
  buffer: Buffer,
  mimeType: string,
): Promise<{ markdown: string | null; sourceOcr: boolean }> {
  try {
    if (mimeType === MIME_PDF || mimeType === MIME_DOCX) {
      const resultat = await normaliserDao(buffer, mimeType);
      return { markdown: resultat.markdown, sourceOcr: false };
    }

    if (mimeType === MIME_JPEG || mimeType === MIME_PNG) {
      const texte = await lireImageParClaude(buffer);
      return { markdown: texte.trim().length > 0 ? texte : null, sourceOcr: true };
    }

    if (mimeType === MIME_DOC_LEGACY) {
      const extractor = new WordExtractor();
      const document = await extractor.extract(buffer);
      const texte = document.getBody();
      return { markdown: texte.trim().length > 0 ? texte : null, sourceOcr: false };
    }

    return { markdown: null, sourceOcr: false };
  } catch (erreur) {
    // Best-effort : une erreur de normalisation ne doit jamais faire
    // échouer l'upload — le fichier reste utilisable (téléchargeable)
    // même sans texte extrait.
    console.error("Échec de la normalisation du document :", erreur);
    return { markdown: null, sourceOcr: false };
  }
}
```

- [ ] **Step 7: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run lib/documents/normalisation.test.ts`
Expected: PASS, 6/6 tests verts.

- [ ] **Step 8: Brancher `normaliserDocument` dans `ajouterDocument`**

Le fichier actuel `lib/documents/actions.ts` :

```ts
"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { documentUploadSchema } from "./schema";
import { construireCheminStockage } from "./storage-path";
import { obtenirUtilisateurCourant } from "./queries";

export async function ajouterDocument(
  formData: FormData,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = documentUploadSchema.safeParse({
    type: formData.get("type"),
    nom: formData.get("nom"),
    dateExpiration: formData.get("dateExpiration") || null,
    fichier: formData.get("fichier"),
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const { type, nom, dateExpiration, fichier } = parsed.data;
  const documentId = randomUUID();
  const cheminStockage = construireCheminStockage(
    utilisateur.entreprise_id,
    documentId,
    fichier.name,
  );

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, fichier, { contentType: fichier.type });

  if (erreurUpload) {
    return { erreur: "Échec de l'envoi du fichier. Réessayez." };
  }

  const { error: erreurInsertion } = await supabase.from("document").insert({
    id: documentId,
    entreprise_id: utilisateur.entreprise_id,
    type,
    nom,
    fichier_path: cheminStockage,
    fichier_nom_original: fichier.name,
    mime_type: fichier.type,
    taille_octets: fichier.size,
    date_expiration: dateExpiration ?? null,
    created_by: utilisateur.id,
  });

  if (erreurInsertion) {
    await supabase.storage.from("documents").remove([cheminStockage]);
    return { erreur: "Échec de l'enregistrement du document. Réessayez." };
  }

  revalidatePath("/bibliotheque");
  return { succes: true as const };
}
```

devient (import ajouté, contenu du buffer normalisé avant l'insert,
`contenu_markdown`/`source_ocr` ajoutés à l'insert) :

```ts
"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { documentUploadSchema } from "./schema";
import { construireCheminStockage } from "./storage-path";
import { obtenirUtilisateurCourant } from "./queries";
import { normaliserDocument } from "./normalisation";

export async function ajouterDocument(
  formData: FormData,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = documentUploadSchema.safeParse({
    type: formData.get("type"),
    nom: formData.get("nom"),
    dateExpiration: formData.get("dateExpiration") || null,
    fichier: formData.get("fichier"),
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const { type, nom, dateExpiration, fichier } = parsed.data;
  const documentId = randomUUID();
  const cheminStockage = construireCheminStockage(
    utilisateur.entreprise_id,
    documentId,
    fichier.name,
  );

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, fichier, { contentType: fichier.type });

  if (erreurUpload) {
    return { erreur: "Échec de l'envoi du fichier. Réessayez." };
  }

  const buffer = Buffer.from(await fichier.arrayBuffer());
  const { markdown, sourceOcr } = await normaliserDocument(buffer, fichier.type);

  const { error: erreurInsertion } = await supabase.from("document").insert({
    id: documentId,
    entreprise_id: utilisateur.entreprise_id,
    type,
    nom,
    fichier_path: cheminStockage,
    fichier_nom_original: fichier.name,
    mime_type: fichier.type,
    taille_octets: fichier.size,
    date_expiration: dateExpiration ?? null,
    contenu_markdown: markdown,
    source_ocr: sourceOcr,
    created_by: utilisateur.id,
  });

  if (erreurInsertion) {
    await supabase.storage.from("documents").remove([cheminStockage]);
    return { erreur: "Échec de l'enregistrement du document. Réessayez." };
  }

  revalidatePath("/bibliotheque");
  return { succes: true as const };
}
```

- [ ] **Step 9: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 10: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`
Expected: tous les tests verts (209 existants + 6 nouveaux), aucune
régression.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json types/word-extractor.d.ts lib/documents/normalisation.ts lib/documents/normalisation.test.ts lib/documents/actions.ts
git commit -m "fix: normaliser le contenu des documents bibliothèque à l'upload (PDF/DOCX/DOC legacy/JPEG/PNG)"
```

---

### Task 2: Modèle de données — migration + types + chemins de stockage

**Files:**
- Create: `supabase/migrations/20260917140000_transformation_cv.sql`
- Modify: `lib/appels-offres/types.ts`
- Modify: `lib/appels-offres/storage-path.ts`

**Interfaces:**
- Produces: `AppelOffres` enrichi de `modele_cv_path`/`modele_cv_nom_original`/`modele_cv_markdown` (tous `string | null`) ; `CvTransforme` ; `construireCheminStockageModeleCv(entrepriseId, appelOffresId, nomFichierOriginal): string` ; `construireCheminStockageCvTransforme(entrepriseId, appelOffresId, documentId): string` — consommés par les Tasks 3-5.

- [ ] **Step 1: Écrire la migration**

Créer `supabase/migrations/20260917140000_transformation_cv.sql` :

```sql
-- Transformation des CV selon le modèle imposé par un DAO (lacune reportée
-- pendant le cadrage du sous-projet BPU du Module 7 — voir
-- docs/superpowers/specs/2026-09-16-pyramide-cout-bpu-design.md). Un seul
-- modèle par AO, saisi manuellement (upload), jamais extrait
-- automatiquement du DAO. Colonnes ajoutées à appel_offres, comme
-- fichier_dao_path : un modèle de CV est propre à un AO, jamais partagé.
alter table appel_offres
  add column modele_cv_path text,
  add column modele_cv_nom_original text,
  add column modele_cv_markdown text;

-- Résultat de transformation d'un CV vers le modèle de l'AO. Une
-- régénération remplace le résultat précédent (contrainte unique, pas
-- d'historique de versions — cohérent avec le reste du projet). document_id
-- référence le CV source (bibliothèque, type 'cv') ; appel_offres_id le
-- modèle utilisé. Les deux restent des FK explicites pour la traçabilité :
-- CV source et modèle restent consultables séparément.
create table cv_transforme (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  document_id uuid not null references document(id) on delete cascade,
  contenu_markdown text not null,
  export_path text not null,
  genere_par uuid references utilisateur(id) on delete set null,
  genere_le timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (appel_offres_id, document_id)
);

create index cv_transforme_appel_offres_id_idx on cv_transforme(appel_offres_id);

alter table cv_transforme enable row level security;

-- Même patron que jalon_retroplanning/evaluation_go_no_go : select/insert
-- scopés par appartenance entreprise via appel_offres, update autorisé à
-- toute l'équipe (une régénération peut être faite par n'importe qui,
-- pas seulement l'auteur de la première génération).
create policy "cv_transforme_select_membres" on cv_transforme
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = cv_transforme.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "cv_transforme_insert_membres" on cv_transforme
  for insert with check (
    genere_par = auth.uid()
    and exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = cv_transforme.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "cv_transforme_update_membres" on cv_transforme
  for update
  using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = cv_transforme.appel_offres_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = cv_transforme.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "cv_transforme_delete_membres" on cv_transforme
  for delete using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = cv_transforme.appel_offres_id and u.id = auth.uid()
    )
  );
```

- [ ] **Step 2: Enrichir `AppelOffres` et ajouter `CvTransforme` dans `lib/appels-offres/types.ts`**

L'interface `AppelOffres` actuelle :

```ts
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
  assigne_a: string | null;
  created_by: string | null;
  created_at: string;
}
```

devient (trois champs insérés après `fichier_dao_nom_original`) :

```ts
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
  modele_cv_path: string | null;
  modele_cv_nom_original: string | null;
  modele_cv_markdown: string | null;
  dao_markdown: string | null;
  sommaire_attendu: string[] | null;
  assigne_a: string | null;
  created_by: string | null;
  created_at: string;
}
```

Ajouter à la fin du fichier (après `LigneBpu`, dernière interface
actuelle) :

```ts
export interface CvTransforme {
  id: string;
  appel_offres_id: string;
  document_id: string;
  contenu_markdown: string;
  export_path: string;
  genere_par: string | null;
  genere_le: string;
  created_at: string;
}
```

- [ ] **Step 3: Ajouter les deux fonctions de chemin de stockage**

Le fichier actuel `lib/appels-offres/storage-path.ts` :

```ts
export function construireCheminStockageDao(
  entrepriseId: string,
  appelOffresId: string,
  nomFichierOriginal: string,
): string {
  const nomNettoye = nomFichierOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entrepriseId}/appels-offres/${appelOffresId}-${nomNettoye}`;
}

export function construireCheminStockageExport(
  entrepriseId: string,
  appelOffresId: string,
): string {
  return `${entrepriseId}/appels-offres/exports/${appelOffresId}-dossier-reponse.docx`;
}
```

devient (deux fonctions ajoutées à la fin) :

```ts
export function construireCheminStockageDao(
  entrepriseId: string,
  appelOffresId: string,
  nomFichierOriginal: string,
): string {
  const nomNettoye = nomFichierOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entrepriseId}/appels-offres/${appelOffresId}-${nomNettoye}`;
}

export function construireCheminStockageExport(
  entrepriseId: string,
  appelOffresId: string,
): string {
  return `${entrepriseId}/appels-offres/exports/${appelOffresId}-dossier-reponse.docx`;
}

export function construireCheminStockageModeleCv(
  entrepriseId: string,
  appelOffresId: string,
  nomFichierOriginal: string,
): string {
  const nomNettoye = nomFichierOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entrepriseId}/appels-offres/${appelOffresId}-modele-cv-${nomNettoye}`;
}

export function construireCheminStockageCvTransforme(
  entrepriseId: string,
  appelOffresId: string,
  documentId: string,
): string {
  return `${entrepriseId}/appels-offres/cv-transformes/${appelOffresId}-${documentId}.docx`;
}
```

- [ ] **Step 4: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 5: NE PAS exécuter `supabase db push`**

La migration reste locale — elle sera appliquée par le contrôleur une
fois la branche entière revue, avant le merge. N'exécute aucune commande
touchant la base Supabase distante dans cette tâche.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260917140000_transformation_cv.sql lib/appels-offres/types.ts lib/appels-offres/storage-path.ts
git commit -m "feat: colonnes modele_cv_* sur appel_offres, table cv_transforme, chemins de stockage"
```

---

### Task 3: Calcul pur (prompt IA, TDD) + génération Claude + export Word

**Files:**
- Create: `lib/appels-offres/cv-transformation.ts`
- Create: `lib/appels-offres/cv-transformation.test.ts`
- Create: `lib/appels-offres/export/cv-docx.ts`

**Interfaces:**
- Produces: `construirePromptCvTransformation(cvSourceMarkdown: string, modeleCvMarkdown: string): string` ; `genererContenuCvTransforme(cvSourceMarkdown: string, modeleCvMarkdown: string): Promise<string>` ; `genererDocumentCvTransforme(contenuMarkdown: string): Promise<Buffer>` — consommés par la Task 4 (Server Action `genererCvTransforme`).

- [ ] **Step 1: Écrire les tests de `construirePromptCvTransformation` (doivent échouer)**

Créer `lib/appels-offres/cv-transformation.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { construirePromptCvTransformation } from "./cv-transformation";

describe("construirePromptCvTransformation", () => {
  it("inclut le contenu du CV source dans le prompt", () => {
    const prompt = construirePromptCvTransformation(
      "Jean Dupont, Ingénieur, 10 ans d'expérience",
      "## Identité\n## Formation\n## Expérience",
    );
    expect(prompt).toContain("Jean Dupont, Ingénieur, 10 ans d'expérience");
  });

  it("inclut la structure du modèle cible dans le prompt", () => {
    const prompt = construirePromptCvTransformation(
      "Jean Dupont, Ingénieur, 10 ans d'expérience",
      "## Identité\n## Formation\n## Expérience",
    );
    expect(prompt).toContain("## Identité\n## Formation\n## Expérience");
  });

  it("contient une consigne explicite contre l'invention d'informations", () => {
    const prompt = construirePromptCvTransformation("CV source", "Modèle cible");
    expect(prompt.toLowerCase()).toContain("n'invente aucune information");
  });

  it("contient une consigne pour marquer une rubrique sans équivalent", () => {
    const prompt = construirePromptCvTransformation("CV source", "Modèle cible");
    expect(prompt).toContain("[à compléter]");
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/appels-offres/cv-transformation.test.ts`
Expected: FAIL — `./cv-transformation` introuvable.

- [ ] **Step 3: Écrire l'implémentation**

Créer `lib/appels-offres/cv-transformation.ts` :

```ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ maxRetries: 4 });

export function construirePromptCvTransformation(
  cvSourceMarkdown: string,
  modeleCvMarkdown: string,
): string {
  return `Tu réorganises un CV existant selon la structure d'un modèle imposé par un appel d'offres ivoirien.

CV source (contenu réel à réorganiser) :

${cvSourceMarkdown}

Modèle imposé (structure et rubriques à respecter) :

${modeleCvMarkdown}

Consignes strictes :
- N'invente aucune information absente du CV source : aucun nom, aucune date, aucun diplôme, aucune expérience.
- Reprends uniquement les informations réellement présentes dans le CV source, réorganisées selon les rubriques du modèle.
- Si une rubrique du modèle n'a aucun équivalent dans le CV source, écris "[à compléter]" à cet endroit plutôt que d'inventer.
- Réponds uniquement avec le CV réorganisé, sans préambule ni commentaire sur la tâche elle-même.`;
}

export async function genererContenuCvTransforme(
  cvSourceMarkdown: string,
  modeleCvMarkdown: string,
): Promise<string> {
  const prompt = construirePromptCvTransformation(cvSourceMarkdown, modeleCvMarkdown);

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODELE_REDACTION ?? "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const bloc = message.content.find((b) => b.type === "text");
  const texte = bloc && bloc.type === "text" ? bloc.text : "";

  if (!texte.trim()) {
    throw new Error("Réponse Claude vide.");
  }

  return texte.trim();
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run lib/appels-offres/cv-transformation.test.ts`
Expected: PASS, 4/4 tests verts.

- [ ] **Step 5: Créer le générateur Word**

Créer `lib/appels-offres/export/cv-docx.ts` :

```ts
import { Document, Paragraph, Packer } from "docx";

export async function genererDocumentCvTransforme(contenuMarkdown: string): Promise<Buffer> {
  const paragraphes = contenuMarkdown
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => new Paragraph({ text: p }));

  const document = new Document({ sections: [{ children: paragraphes }] });
  return Packer.toBuffer(document);
}
```

- [ ] **Step 6: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 7: Vérifier que les tests passent toujours**

Run: `npx vitest run`
Expected: tous les tests verts (215 existants + 4 nouveaux), aucune
régression.

- [ ] **Step 8: Commit**

```bash
git add lib/appels-offres/cv-transformation.ts lib/appels-offres/cv-transformation.test.ts lib/appels-offres/export/cv-docx.ts
git commit -m "feat: construirePromptCvTransformation (TDD) + genererContenuCvTransforme + genererDocumentCvTransforme"
```

---

### Task 4: Server Actions et requête de lecture

**Files:**
- Modify: `lib/appels-offres/actions.ts`
- Modify: `lib/appels-offres/queries.ts`

**Interfaces:**
- Consumes: `televerserDaoSchema` (existant, `./schema`) ; `construireCheminStockageModeleCv`, `construireCheminStockageCvTransforme` (Task 2) ; `genererContenuCvTransforme`, `genererDocumentCvTransforme` (Task 3) ; `CvTransforme` (Task 2).
- Produces: `televerserModeleCv`, `retirerModeleCv`, `genererCvTransforme`, `genererUrlTelechargementCvTransforme` (Server Actions) ; `listerCvTransformes(appelOffresId: string): Promise<Record<string, CvTransforme>>` — consommés par la Task 5.

- [ ] **Step 1: Enrichir les imports de `lib/appels-offres/actions.ts`**

L'import de `./normalisation/normaliser` n'existe pas encore dans ce
fichier (seul `./schema` y importe `MIME_TYPES_DAO_SUPPORTES`) — l'ajouter.
L'import de `./storage-path` actuel :

```ts
import { construireCheminStockageDao, construireCheminStockageExport } from "./storage-path";
```

devient :

```ts
import {
  construireCheminStockageDao,
  construireCheminStockageExport,
  construireCheminStockageModeleCv,
  construireCheminStockageCvTransforme,
} from "./storage-path";
import { normaliserDao } from "./normalisation/normaliser";
import { genererContenuCvTransforme } from "./cv-transformation";
import { genererDocumentCvTransforme } from "./export/cv-docx";
```

L'import de types actuel (déjà enrichi par la Task 2 côté `types.ts`,
mais l'import dans `actions.ts` doit lister `CvTransforme` explicitement)
— trouver le bloc `import type { ... } from "./types";` existant et
ajouter `CvTransforme` à la liste des types importés (ordre alphabétique,
même convention que les imports précédents de ce fichier).

- [ ] **Step 2: Ajouter les Server Actions du modèle de CV**

Ajouter à la fin du fichier :

```ts
export async function televerserModeleCv(
  appelOffresId: string,
  formData: FormData,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = televerserDaoSchema.safeParse({ fichier: formData.get("fichier") });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Fichier invalide" };
  }

  const { fichier } = parsed.data;
  const cheminStockage = construireCheminStockageModeleCv(
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

  const buffer = Buffer.from(await fichier.arrayBuffer());
  const resultat = await normaliserDao(buffer, fichier.type);

  const { error: erreurMiseAJour } = await supabase
    .from("appel_offres")
    .update({
      modele_cv_path: cheminStockage,
      modele_cv_nom_original: fichier.name,
      modele_cv_markdown: resultat.markdown,
    })
    .eq("id", appelOffresId);

  if (erreurMiseAJour) {
    await supabase.storage.from("documents").remove([cheminStockage]);
    return { erreur: "Échec de l'enregistrement du modèle. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function retirerModeleCv(
  appelOffresId: string,
  cheminStockage: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { error } = await supabase
    .from("appel_offres")
    .update({ modele_cv_path: null, modele_cv_nom_original: null, modele_cv_markdown: null })
    .eq("id", appelOffresId);

  if (error) return { erreur: "Échec de la suppression. Réessayez." };

  await supabase.storage.from("documents").remove([cheminStockage]);

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}
```

- [ ] **Step 3: Ajouter les Server Actions de génération**

Ajouter juste après, dans le même fichier :

```ts
export async function genererCvTransforme(
  appelOffresId: string,
  documentId: string,
): Promise<{ erreur: string } | { succes: true; cvTransforme: CvTransforme }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: appelOffres, error: erreurAo } = await supabase
    .from("appel_offres")
    .select("modele_cv_markdown")
    .eq("id", appelOffresId)
    .maybeSingle();

  if (erreurAo || !appelOffres?.modele_cv_markdown) {
    return { erreur: "Aucun modèle de CV n'a été téléversé pour cet AO." };
  }

  const { data: document, error: erreurDocument } = await supabase
    .from("document")
    .select("contenu_markdown")
    .eq("id", documentId)
    .maybeSingle();

  if (erreurDocument || !document?.contenu_markdown) {
    return { erreur: "Ce CV n'a pas de contenu extrait. Réessayez de le téléverser." };
  }

  let contenuGenere: string;
  try {
    contenuGenere = await genererContenuCvTransforme(
      document.contenu_markdown,
      appelOffres.modele_cv_markdown,
    );
  } catch {
    return { erreur: "Échec de la génération. Réessayez." };
  }

  const bufferDocx = await genererDocumentCvTransforme(contenuGenere);
  const cheminExport = construireCheminStockageCvTransforme(
    utilisateur.entreprise_id,
    appelOffresId,
    documentId,
  );

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminExport, bufferDocx, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });

  if (erreurUpload) {
    return { erreur: "Échec de l'enregistrement du fichier généré. Réessayez." };
  }

  const { data, error: erreurUpsert } = await supabase
    .from("cv_transforme")
    .upsert(
      {
        appel_offres_id: appelOffresId,
        document_id: documentId,
        contenu_markdown: contenuGenere,
        export_path: cheminExport,
        genere_par: utilisateur.id,
        genere_le: new Date().toISOString(),
      },
      { onConflict: "appel_offres_id,document_id" },
    )
    .select("*")
    .maybeSingle();

  if (erreurUpsert || !data) {
    return { erreur: "Échec de l'enregistrement. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, cvTransforme: data as CvTransforme };
}

export async function genererUrlTelechargementCvTransforme(
  cheminStockage: string,
): Promise<{ erreur: string } | { url: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(cheminStockage, 60);

  if (error || !data) return { erreur: "Impossible de générer le lien." };
  return { url: data.signedUrl };
}
```

- [ ] **Step 4: Ajouter `listerCvTransformes` à `lib/appels-offres/queries.ts`**

L'import de types en tête du fichier actuel :

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

devient :

```ts
import type {
  AppelOffres,
  ClePieceGroupement,
  CleChecklistManuelle,
  CvTransforme,
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

Ajouter à la fin du fichier (après `listerGroupement`) :

```ts
export async function listerCvTransformes(
  appelOffresId: string,
): Promise<Record<string, CvTransforme>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cv_transforme")
    .select("*")
    .eq("appel_offres_id", appelOffresId);

  if (error) throw error;

  const parDocument: Record<string, CvTransforme> = {};
  for (const cv of (data ?? []) as CvTransforme[]) {
    parDocument[cv.document_id] = cv;
  }
  return parDocument;
}
```

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6: Vérifier que les tests passent toujours**

Run: `npx vitest run`
Expected: tous les tests verts, aucune régression. Aucun nouveau test
dans cette tâche (Server Actions et requêtes non testées, cohérent avec
le reste du projet).

- [ ] **Step 7: Commit**

```bash
git add lib/appels-offres/actions.ts lib/appels-offres/queries.ts
git commit -m "feat: Server Actions modèle de CV + transformation, listerCvTransformes"
```

---

### Task 5: Interface — upload du modèle et boutons de transformation

**Files:**
- Create: `app/(app)/appels-offres/[id]/modele-cv.tsx`
- Modify: `app/(app)/appels-offres/[id]/documents-exigence.tsx`
- Modify: `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`
- Modify: `app/(app)/appels-offres/[id]/page.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `televerserModeleCv`, `retirerModeleCv`, `genererCvTransforme`, `genererUrlTelechargementCvTransforme` (Task 4) ; `listerCvTransformes` (Task 4) ; `CvTransforme` (Task 2).

- [ ] **Step 1: Ajouter les traductions dans `messages/fr.json`**

Le bloc `"boutonTelecharger"`/`"boutonExporter"` actuel (racine de
`AppelsOffres.detail`) :

```json
      "boutonTelecharger": "Télécharger le DAO",
      "boutonExporter": "Exporter le dossier",
      "messageTraitementEnCours": "Le traitement de ce dossier est en cours. Les informations extraites et les exigences apparaîtront ici une fois terminé.",
```

devient (nouveau bloc `"modeleCv"` ajouté juste après) :

```json
      "boutonTelecharger": "Télécharger le DAO",
      "boutonExporter": "Exporter le dossier",
      "messageTraitementEnCours": "Le traitement de ce dossier est en cours. Les informations extraites et les exigences apparaîtront ici une fois terminé.",
      "modeleCv": {
        "titre": "Modèle de CV imposé par le DAO",
        "description": "Si ce DAO impose un format de CV précis pour le personnel clé, téléversez-le ici — un bouton de transformation apparaîtra alors sur chaque CV associé aux pièces requises.",
        "boutonTeleverser": "Téléverser le modèle",
        "envoiEnCours": "Envoi...",
        "boutonRetirer": "Retirer",
        "toastEnvoye": "Modèle de CV enregistré",
        "toastRetire": "Modèle de CV retiré"
      },
```

Le bloc `"documents"` actuel (sous `AppelsOffres.detail.exigences`) :

```json
        "documents": {
          "aucunDocumentAssocie": "Aucun document associé.",
          "dissocier": "Retirer",
          "placeholderSelect": "Associer un document...",
          "groupeSuggestions": "Suggestions",
          "groupeAutres": "Autres documents",
          "bibliothequeVide": "Aucun document dans la bibliothèque. Ajoutez-en depuis la Bibliothèque.",
          "erreurAssociation": "Échec de l'association. Réessayez.",
          "erreurDissociation": "Échec de la dissociation. Réessayez."
        }
```

devient (4 clés ajoutées avant la fermeture) :

```json
        "documents": {
          "aucunDocumentAssocie": "Aucun document associé.",
          "dissocier": "Retirer",
          "placeholderSelect": "Associer un document...",
          "groupeSuggestions": "Suggestions",
          "groupeAutres": "Autres documents",
          "bibliothequeVide": "Aucun document dans la bibliothèque. Ajoutez-en depuis la Bibliothèque.",
          "erreurAssociation": "Échec de l'association. Réessayez.",
          "erreurDissociation": "Échec de la dissociation. Réessayez.",
          "boutonTransformer": "Transformer selon le modèle",
          "transformationEnCours": "Génération...",
          "boutonTelechargerTransforme": "Télécharger le CV transformé",
          "genereLe": "Généré le {date}",
          "boutonRegenerer": "Régénérer",
          "erreurTransformation": "Échec de la transformation. Réessayez."
        }
```

- [ ] **Step 2: Ajouter les mêmes traductions dans `messages/en.json`**

Même bloc racine `AppelsOffres.detail`, remplacer :

```json
      "boutonTelecharger": "Download the tender document",
      "boutonExporter": "Export the response file",
      "messageTraitementEnCours": "This file is still being processed. Extracted information and requirements will appear here once done.",
```

par :

```json
      "boutonTelecharger": "Download the tender document",
      "boutonExporter": "Export the response file",
      "messageTraitementEnCours": "This file is still being processed. Extracted information and requirements will appear here once done.",
      "modeleCv": {
        "titre": "CV template required by the tender",
        "description": "If this tender requires a specific CV format for key staff, upload it here — a transform button will then appear on each CV linked to the required documents.",
        "boutonTeleverser": "Upload template",
        "envoiEnCours": "Uploading...",
        "boutonRetirer": "Remove",
        "toastEnvoye": "CV template saved",
        "toastRetire": "CV template removed"
      },
```

Le bloc `"documents"` anglais existant :

```json
        "documents": {
          "aucunDocumentAssocie": "No document linked.",
          "dissocier": "Remove",
          "placeholderSelect": "Link a document...",
          "groupeSuggestions": "Suggestions",
          "groupeAutres": "Other documents",
          "bibliothequeVide": "No document in the library yet. Add one from the Library.",
          "erreurAssociation": "Failed to link the document. Please try again.",
          "erreurDissociation": "Failed to remove the document. Please try again."
        }
```

devient (6 clés ajoutées avant la fermeture) :

```json
        "documents": {
          "aucunDocumentAssocie": "No document linked.",
          "dissocier": "Remove",
          "placeholderSelect": "Link a document...",
          "groupeSuggestions": "Suggestions",
          "groupeAutres": "Other documents",
          "bibliothequeVide": "No document in the library yet. Add one from the Library.",
          "erreurAssociation": "Failed to link the document. Please try again.",
          "erreurDissociation": "Failed to remove the document. Please try again.",
          "boutonTransformer": "Transform to template",
          "transformationEnCours": "Generating...",
          "boutonTelechargerTransforme": "Download the transformed CV",
          "genereLe": "Generated on {date}",
          "boutonRegenerer": "Regenerate",
          "erreurTransformation": "Transformation failed. Please try again."
        }
```

- [ ] **Step 3: Vérifier que les deux fichiers restent du JSON valide**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('OK')"`
Expected: `OK`.

- [ ] **Step 4: Créer `app/(app)/appels-offres/[id]/modele-cv.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { televerserModeleCv, retirerModeleCv } from "@/lib/appels-offres/actions";

export function ModeleCv({
  appelOffresId,
  modeleCvPath,
  modeleCvNomOriginal,
}: {
  appelOffresId: string;
  modeleCvPath: string | null;
  modeleCvNomOriginal: string | null;
}) {
  const t = useTranslations("AppelsOffres.detail.modeleCv");
  const [envoi, setEnvoi] = useState(false);

  async function onSubmit(formData: FormData) {
    setEnvoi(true);
    const resultat = await televerserModeleCv(appelOffresId, formData);
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(t("toastEnvoye"));
  }

  async function retirer() {
    if (!modeleCvPath) return;
    const resultat = await retirerModeleCv(appelOffresId, modeleCvPath);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(t("toastRetire"));
  }

  return (
    <div className="flex flex-col gap-2 border rounded-lg p-4">
      <h2 className="text-lg font-semibold">{t("titre")}</h2>
      <p className="text-sm text-muted-foreground">{t("description")}</p>

      {modeleCvPath ? (
        <div className="flex items-center gap-2">
          <span className="text-sm">{modeleCvNomOriginal}</span>
          <Button type="button" variant="ghost" size="sm" onClick={retirer}>
            {t("boutonRetirer")}
          </Button>
        </div>
      ) : (
        <form action={onSubmit} className="flex items-center gap-2">
          <input type="file" name="fichier" accept=".pdf,.docx" required />
          <Button type="submit" disabled={envoi}>
            {envoi ? t("envoiEnCours") : t("boutonTeleverser")}
          </Button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Modifier `documents-exigence.tsx`**

L'import actuel :

```tsx
import {
  associerDocumentAExigence,
  dissocierDocumentAExigence,
} from "@/lib/appels-offres/actions";
import { deviserTypeDocumentPrefere } from "@/lib/appels-offres/suggestion-document";
import type { Document } from "@/lib/documents/types";
```

devient :

```tsx
import {
  associerDocumentAExigence,
  dissocierDocumentAExigence,
  genererCvTransforme,
  genererUrlTelechargementCvTransforme,
} from "@/lib/appels-offres/actions";
import { deviserTypeDocumentPrefere } from "@/lib/appels-offres/suggestion-document";
import type { Document } from "@/lib/documents/types";
import type { CvTransforme } from "@/lib/appels-offres/types";
```

La signature du composant actuelle :

```tsx
export function DocumentsExigence({
  appelOffresId,
  exigenceId,
  libelleExigence,
  documentsAssocies: documentsAssociesInitial,
  bibliotheque,
}: {
  appelOffresId: string;
  exigenceId: string;
  libelleExigence: string;
  documentsAssocies: Document[];
  bibliotheque: Document[];
}) {
  const t = useTranslations("AppelsOffres.detail.exigences.documents");
  const [documentsAssocies, setDocumentsAssocies] = useState(documentsAssociesInitial);
  const [selectValue, setSelectValue] = useState("");
  const [isPending, startTransition] = useTransition();
```

devient (deux nouvelles props, un état local pour suivre la génération
en cours par document) :

```tsx
export function DocumentsExigence({
  appelOffresId,
  exigenceId,
  libelleExigence,
  documentsAssocies: documentsAssociesInitial,
  bibliotheque,
  modeleCvDisponible,
  cvTransformeParDocument,
}: {
  appelOffresId: string;
  exigenceId: string;
  libelleExigence: string;
  documentsAssocies: Document[];
  bibliotheque: Document[];
  modeleCvDisponible: boolean;
  cvTransformeParDocument: Record<string, CvTransforme>;
}) {
  const t = useTranslations("AppelsOffres.detail.exigences.documents");
  const [documentsAssocies, setDocumentsAssocies] = useState(documentsAssociesInitial);
  const [selectValue, setSelectValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const [cvTransformes, setCvTransformes] = useState(cvTransformeParDocument);
  const [documentIdEnCours, setDocumentIdEnCours] = useState<string | null>(null);

  async function transformer(documentId: string) {
    setDocumentIdEnCours(documentId);
    const resultat = await genererCvTransforme(appelOffresId, documentId);
    setDocumentIdEnCours(null);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setCvTransformes((carte) => ({ ...carte, [documentId]: resultat.cvTransforme }));
  }

  async function telechargerTransforme(exportPath: string) {
    const resultat = await genererUrlTelechargementCvTransforme(exportPath);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }
```

Le rendu de la liste `documentsAssocies` actuel :

```tsx
      {documentsAssocies.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("aucunDocumentAssocie")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {documentsAssocies.map((document) => (
            <li key={document.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                {document.nom}
                <ExpirationBadge dateExpiration={document.date_expiration} />
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => onDissocier(document.id)}
              >
                {t("dissocier")}
              </Button>
            </li>
          ))}
        </ul>
      )}
```

devient (bloc de transformation ajouté pour les documents de type `cv`
quand `modeleCvDisponible` est vrai) :

```tsx
      {documentsAssocies.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("aucunDocumentAssocie")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {documentsAssocies.map((document) => {
            const cvTransforme = cvTransformes[document.id];
            const enCours = documentIdEnCours === document.id;
            return (
              <li key={document.id} className="flex flex-col gap-1 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    {document.nom}
                    <ExpirationBadge dateExpiration={document.date_expiration} />
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => onDissocier(document.id)}
                  >
                    {t("dissocier")}
                  </Button>
                </div>

                {modeleCvDisponible && document.type === "cv" && (
                  <div className="flex items-center gap-2 pl-4">
                    {cvTransforme ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => telechargerTransforme(cvTransforme.export_path)}
                        >
                          {t("boutonTelechargerTransforme")}
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {t("genereLe", { date: new Date(cvTransforme.genere_le).toLocaleDateString("fr-FR") })}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={enCours}
                          onClick={() => transformer(document.id)}
                        >
                          {enCours ? t("transformationEnCours") : t("boutonRegenerer")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={enCours}
                        onClick={() => transformer(document.id)}
                      >
                        {enCours ? t("transformationEnCours") : t("boutonTransformer")}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
```

Ajouter `import { toast } from "sonner";` s'il n'est pas déjà présent en
tête du fichier (déjà le cas — vérifié dans le fichier existant, ligne
15).

- [ ] **Step 6: Modifier `appel-offres-detail.tsx`**

L'import de composants actuel se termine par :

```tsx
import { Bpu } from "./bpu";
import { GroupementCard } from "./groupement-card";
```

devient :

```tsx
import { Bpu } from "./bpu";
import { GroupementCard } from "./groupement-card";
import { ModeleCv } from "./modele-cv";
```

L'import de types actuel :

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

devient :

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

La signature du composant actuelle :

```tsx
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

devient :

```tsx
  bpu,
  tauxFraisStructureDefaut,
  groupement,
  nomEntreprise,
  cvTransformeParDocument,
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

Le rendu actuel juste après `<GroupementCard ... />` et avant
`<Retroplanning ... />` :

```tsx
          <GroupementCard
            appelOffresId={appelOffres.id}
            membresInitiaux={groupement.membres}
            piecesParMembreInitial={groupement.piecesParMembre}
            nomEntreprise={nomEntreprise}
          />

          <Retroplanning
```

devient (le bloc modèle de CV s'insère entre les deux) :

```tsx
          <GroupementCard
            appelOffresId={appelOffres.id}
            membresInitiaux={groupement.membres}
            piecesParMembreInitial={groupement.piecesParMembre}
            nomEntreprise={nomEntreprise}
          />

          <ModeleCv
            appelOffresId={appelOffres.id}
            modeleCvPath={appelOffres.modele_cv_path}
            modeleCvNomOriginal={appelOffres.modele_cv_nom_original}
          />

          <Retroplanning
```

Le rendu de `<DocumentsExigence>` actuel (dans la boucle
`piecesRequises.map`) :

```tsx
                        <div className="mt-2">
                          <DocumentsExigence
                            appelOffresId={appelOffres.id}
                            exigenceId={exigence.id}
                            libelleExigence={exigence.libelle}
                            documentsAssocies={documentsParExigence[exigence.id] ?? []}
                            bibliotheque={bibliotheque}
                          />
                        </div>
```

devient :

```tsx
                        <div className="mt-2">
                          <DocumentsExigence
                            appelOffresId={appelOffres.id}
                            exigenceId={exigence.id}
                            libelleExigence={exigence.libelle}
                            documentsAssocies={documentsParExigence[exigence.id] ?? []}
                            bibliotheque={bibliotheque}
                            modeleCvDisponible={appelOffres.modele_cv_path !== null}
                            cvTransformeParDocument={cvTransformeParDocument}
                          />
                        </div>
```

- [ ] **Step 7: Modifier `page.tsx`**

L'import actuel :

```tsx
import {
  obtenirAppelOffres,
  listerChecklistManuelle,
  obtenirEvaluationGoNoGo,
  listerJalonsRetroplanning,
  listerBpu,
  listerGroupement,
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
  listerGroupement,
  listerCvTransformes,
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
    cvTransformeParDocument,
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
    listerCvTransformes(id),
  ]);
```

Le rendu de `<AppelOffresDetail>` actuel :

```tsx
        groupement={groupement}
        nomEntreprise={nomEntreprise}
      />
```

devient :

```tsx
        groupement={groupement}
        nomEntreprise={nomEntreprise}
        cvTransformeParDocument={cvTransformeParDocument}
      />
```

- [ ] **Step 8: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 9: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`
Expected: tous les tests passent, aucune régression.

- [ ] **Step 10: Vérifier le build de production**

Run: `npx next build`
Expected: build réussi, aucune erreur.

- [ ] **Step 11: Commit**

```bash
git add "app/(app)/appels-offres/[id]/modele-cv.tsx" "app/(app)/appels-offres/[id]/documents-exigence.tsx" "app/(app)/appels-offres/[id]/appel-offres-detail.tsx" "app/(app)/appels-offres/[id]/page.tsx" messages/fr.json messages/en.json
git commit -m "feat: interface upload modèle de CV + boutons de transformation par document"
```

---

## Self-Review Notes

- **Couverture du spec** : fix normalisation bibliothèque (Task 1),
  modèle de données (Task 2), calcul pur + IA + export Word (Task 3),
  Server Actions + requête (Task 4), interface (Task 5) — chaque section
  du spec `2026-09-17-transformation-cv-modele-dao-design.md` a une tâche
  correspondante.
- **Import `anthropic` vérifié explicitement** dans le snippet de la
  Task 3 (`cv-transformation.ts`) — absent d'une première version de ce
  plan, ajouté après relecture croisée avec le patron existant
  (`redaction/generer.ts`).
- **Déclaration de types ambiante pour `word-extractor`** (Task 1, Step 2)
  ajoutée explicitement — `word-extractor` n'a pas de types officiels
  connus, une déclaration `.d.ts` manquante ferait échouer `tsc --noEmit`
  en mode strict dès l'import.
- **Cohérence des types** : `CvTransforme` défini une seule fois
  (Task 2), réutilisé sans redéfinition dans les Tasks 4-5. Signature de
  `genererCvTransforme`/`televerserModeleCv`/`retirerModeleCv` identique
  entre leur définition (Task 4) et leur site d'appel
  (`documents-exigence.tsx`/`modele-cv.tsx`, Task 5).
- **`modeleCvDisponible` et `cvTransformeParDocument` threadés sans
  rupture** : `page.tsx` → prop `AppelOffresDetail` → prop
  `DocumentsExigence`, même valeurs à chaque étage, jamais transformées
  en chemin.
- **RLS vérifiée par lecture réelle** des migrations existantes
  (`jalon_retroplanning`, `evaluation_go_no_go`) avant d'écrire ce plan —
  `cv_transforme` reprend leur patron exact (select/insert/update/delete
  scopés par appartenance entreprise via jointure `appel_offres`).
- **Dépendance bloquante (Task 1) traitée en premier**, avant toute
  fonctionnalité de transformation — les Tasks 3-5 supposent que
  `document.contenu_markdown` peut être non-null, ce qui n'était vrai
  pour aucun document avant ce plan.
- **Aucun placeholder** : chaque étape contient le code exact à écrire ou
  le texte exact à remplacer, y compris les 6 tests de la Task 1 et les
  4 tests de la Task 3. Les blocs `old_string` de `messages/en.json`
  (Task 5, Step 2) reprennent le texte anglais réel du fichier, lu
  directement avant d'écrire ce plan — pas une traduction supposée.
- **Vérification manuelle en conditions réelles**, à faire une fois les 5
  tâches exécutées et la migration appliquée par le contrôleur :
  téléverser une pièce bibliothèque de chacun des 5 formats acceptés et
  vérifier que `contenu_markdown` est rempli ; téléverser un modèle de CV
  sur un AO, transformer un CV associé, télécharger le résultat, vérifier
  que le contenu réorganisé ne contient aucune information absente du CV
  source ; régénérer et vérifier que l'ancien fichier est bien remplacé.
