# Rédaction assistée par IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de générer, avec Claude, le texte des sections rédactionnelles d'un dossier de réponse (dérivées de `sommaire_attendu`), avec traçabilité des sources au niveau section et validation humaine obligatoire avant intégration à l'export Word — Module 4, sous-projet 4 (dernier) de NoubinAO.

**Architecture:** Deux nouvelles tables (`section_dossier`, `section_document`), un module de génération isolant la construction du prompt (pure, testée) de l'appel Claude (impur, non testé — même principe que `normalisation/extraire.ts`), quatre nouvelles Server Actions, une extension de la lecture centrale `obtenirAppelOffres`, une intégration à l'export Word existant (sous-projet 3), et une nouvelle zone UI par intitulé de sommaire.

**Tech Stack:** Next.js App Router (Server Actions), Supabase (Postgres RLS), TypeScript, Vitest, `@anthropic-ai/sdk` (déjà en dépendance), shadcn/ui (`Card`, `Select`, nouveau `Textarea`), next-intl (FR/EN).

## Global Constraints

- **Traçabilité au niveau section, pas phrase par phrase** : chaque section générée enregistre l'ensemble exact des documents fournis au prompt via `section_document` — jamais de citation inline dans le texte généré.
- **Validation humaine obligatoire avant export** : une section a un statut `brouillon`/`validee`. Seules les sections `validee` entrent dans l'export Word. Toute régénération repasse la section à `brouillon`.
- **Sélection manuelle des documents source**, jamais d'heuristique automatique — l'utilisateur choisit les documents avant de cliquer "Générer".
- **`dao_markdown` toujours inclus** dans le prompt en plus des documents choisis (respect des consignes du DAO).
- **Aucune mention des sources dans le `.docx` exporté** — la traçabilité reste interne à NoubinAO, le texte exporté est une prose propre.
- **Génération synchrone, un appel Claude par section** — pas de file QStash, chaque génération est un seul appel réseau déclenché par un bouton.
- **Modèle configurable** : `process.env.ANTHROPIC_MODELE_REDACTION`, repli sur `"claude-haiku-4-5-20251001"`.
- **Policy RLS `UPDATE` sur `section_dossier` créée dès la migration initiale** (pas de rattrapage a posteriori comme `dossier_reponse` au sous-projet 3) — leçon du sous-projet 3 appliquée directement.
- Chaque worktree doit relier elle-même le projet Supabase via `supabase link` avant `npx supabase db push`/`db query` (le cache `supabase/.temp/` est gitignoré, propre à chaque checkout) — token récupérable depuis `.env.local` du dépôt principal, jamais committé.
- Spec complet : `docs/superpowers/specs/2026-09-07-redaction-assistee-ia-design.md`.

---

### Task 1: Migration — tables `section_dossier`/`section_document` + types TypeScript

**Files:**
- Create: `supabase/migrations/20260907120000_section_dossier.sql`
- Modify: `lib/appels-offres/types.ts`

**Interfaces:**
- Consumes: tables `dossier_reponse`, `appel_offres`, `utilisateur`, `document` (déjà en prod).
- Produces: `StatutSectionDossier`, `SectionDossier`, `SectionDocument` — consommés par toutes les tâches suivantes.

- [ ] **Step 1: Créer la migration**

Créer `supabase/migrations/20260907120000_section_dossier.sql` :

```sql
-- Modèle de données Sections rédactionnelles (Module 4, sous-projet 4)

create type statut_section_dossier as enum ('brouillon', 'validee');

create table section_dossier (
  id uuid primary key default gen_random_uuid(),
  dossier_reponse_id uuid not null references dossier_reponse(id) on delete cascade,
  titre text not null,
  contenu text,
  statut statut_section_dossier not null default 'brouillon',
  generated_at timestamptz,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (dossier_reponse_id, titre)
);

create table section_document (
  id uuid primary key default gen_random_uuid(),
  section_dossier_id uuid not null references section_dossier(id) on delete cascade,
  document_id uuid not null references document(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (section_dossier_id, document_id)
);

create index section_document_document_id_idx on section_document(document_id);

-- RLS

alter table section_dossier enable row level security;
alter table section_document enable row level security;

create policy "section_dossier_select_membres" on section_dossier
  for select using (
    exists (
      select 1 from dossier_reponse dr
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where dr.id = section_dossier.dossier_reponse_id and u.id = auth.uid()
    )
  );

create policy "section_dossier_insert_membres" on section_dossier
  for insert with check (
    exists (
      select 1 from dossier_reponse dr
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where dr.id = section_dossier.dossier_reponse_id and u.id = auth.uid()
    )
  );

-- Policy update présente dès la création de cette table (contrairement à
-- dossier_reponse, où son absence a dû être corrigée par une migration de
-- rattrapage au sous-projet 3) : section_dossier a besoin d'UPDATE dès le
-- premier usage (changement de statut, régénération) — la leçon est
-- appliquée directement ici.
create policy "section_dossier_update_membres" on section_dossier
  for update using (
    exists (
      select 1 from dossier_reponse dr
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where dr.id = section_dossier.dossier_reponse_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from dossier_reponse dr
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where dr.id = section_dossier.dossier_reponse_id and u.id = auth.uid()
    )
  );

create policy "section_dossier_delete_membres" on section_dossier
  for delete using (
    exists (
      select 1 from dossier_reponse dr
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where dr.id = section_dossier.dossier_reponse_id and u.id = auth.uid()
    )
  );

create policy "section_document_select_membres" on section_document
  for select using (
    exists (
      select 1 from section_dossier sd
      join dossier_reponse dr on dr.id = sd.dossier_reponse_id
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sd.id = section_document.section_dossier_id and u.id = auth.uid()
    )
  );

create policy "section_document_insert_membres" on section_document
  for insert with check (
    exists (
      select 1 from section_dossier sd
      join dossier_reponse dr on dr.id = sd.dossier_reponse_id
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sd.id = section_document.section_dossier_id and u.id = auth.uid()
    )
  );

create policy "section_document_delete_membres" on section_document
  for delete using (
    exists (
      select 1 from section_dossier sd
      join dossier_reponse dr on dr.id = sd.dossier_reponse_id
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sd.id = section_document.section_dossier_id and u.id = auth.uid()
    )
  );
```

- [ ] **Step 2: Appliquer la migration**

Run: `npx supabase db push`

Si la worktree n'est pas encore reliée au projet Supabase (erreur de lien), exécuter `supabase link` en réutilisant le token du `.env.local` du dépôt principal (`C:\Users\KONE\OneDrive\Desktop\k-group\aopilot\.env.local`) avant de réessayer — ne jamais écrire ce token dans un fichier de la worktree ni le committer.

Expected: la migration s'applique sans erreur.

- [ ] **Step 3: Vérifier réellement que les policies existent**

Run: `npx supabase db query --linked "select tablename, policyname, cmd from pg_policies where tablename in ('section_dossier','section_document') order by tablename, cmd;"`

Expected : 7 lignes — 4 pour `section_dossier` (DELETE, INSERT, SELECT, UPDATE) et 3 pour `section_document` (DELETE, INSERT, SELECT). Ne pas se contenter de l'absence d'erreur au push — lire réellement le résultat de cette requête (régression déjà rencontrée deux fois sur ce module : sous-projets 1 et 3).

- [ ] **Step 4: Ajouter les types TypeScript**

Ajouter à la fin de `lib/appels-offres/types.ts` :

```ts

export const STATUTS_SECTION_DOSSIER = ["brouillon", "validee"] as const;

export type StatutSectionDossier = (typeof STATUTS_SECTION_DOSSIER)[number];

export interface SectionDossier {
  id: string;
  dossier_reponse_id: string;
  titre: string;
  contenu: string | null;
  statut: StatutSectionDossier;
  generated_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SectionDocument {
  id: string;
  section_dossier_id: string;
  document_id: string;
  created_at: string;
}
```

- [ ] **Step 5: Documenter la nouvelle variable d'environnement dans CLAUDE.md**

Dans `CLAUDE.md`, la section "Variables d'environnement prévues" contient actuellement (lignes 175-189) :

```
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
RESEND_API_KEY=
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
APP_URL=
```

**`APP_URL`** : domaine public stable de production (ex. `https://ao-pilot-nine.vercel.app`), utilisé pour construire l'URL de callback QStash (`lib/appels-offres/file-attente.ts`). Ne pas utiliser `VERCEL_URL` pour cet usage — cette variable pointe vers l'URL unique du déploiement en cours, que Vercel protège via "Vercel Authentication" même quand cette protection est désactivée pour le domaine de production principal, ce qui fait échouer tout callback externe (QStash, webhooks) avec une erreur 401 "Protected deployment".
```

La remplacer par (ajout de `ANTHROPIC_MODELE_REDACTION=` après `ANTHROPIC_API_KEY=`, et d'un paragraphe explicatif après celui d'`APP_URL`) :

```
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_MODELE_REDACTION=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
RESEND_API_KEY=
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
APP_URL=
```

**`APP_URL`** : domaine public stable de production (ex. `https://ao-pilot-nine.vercel.app`), utilisé pour construire l'URL de callback QStash (`lib/appels-offres/file-attente.ts`). Ne pas utiliser `VERCEL_URL` pour cet usage — cette variable pointe vers l'URL unique du déploiement en cours, que Vercel protège via "Vercel Authentication" même quand cette protection est désactivée pour le domaine de production principal, ce qui fait échouer tout callback externe (QStash, webhooks) avec une erreur 401 "Protected deployment".

**`ANTHROPIC_MODELE_REDACTION`** : optionnelle, absente en développement (repli automatique sur `claude-haiku-4-5-20251001`). À définir uniquement en production si la qualité rédactionnelle de Haiku s'avère insuffisante sur un cas réel — voir `lib/appels-offres/redaction/generer.ts`.
```

- [ ] **Step 6: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260907120000_section_dossier.sql lib/appels-offres/types.ts CLAUDE.md
git commit -m "feat: modèle de données sections rédactionnelles (section_dossier, section_document)"
```

---

### Task 2: Génération — prompt pur (testé) + appel Claude (non testé)

**Files:**
- Create: `lib/appels-offres/redaction/generer.ts`
- Test: `lib/appels-offres/redaction/generer.test.ts`

**Interfaces:**
- Consumes: `Document` (`lib/documents/types.ts`).
- Produces: `export function construirePromptRedaction(titreSection: string, daoMarkdown: string | null, documentsSource: Document[]): string` (pure, testée) et `export async function genererSectionRedaction(titreSection: string, daoMarkdown: string | null, documentsSource: Document[]): Promise<string>` (impure) — consommée par Task 4 (Server Actions).

- [ ] **Step 1: Écrire le test (TDD, fonction pure uniquement)**

Créer `lib/appels-offres/redaction/generer.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { construirePromptRedaction } from "./generer";
import type { Document } from "@/lib/documents/types";

function creerDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    entreprise_id: "ent-1",
    type: "reference_projet",
    nom: "Référence Projet X",
    fichier_path: "ent-1/documents/ref-x.pdf",
    fichier_nom_original: "ref-x.pdf",
    mime_type: "application/pdf",
    taille_octets: 1024,
    date_expiration: null,
    contenu_markdown: "Contenu de la référence projet X.",
    source_ocr: false,
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("construirePromptRedaction", () => {
  it("inclut le titre de la section demandée", () => {
    const prompt = construirePromptRedaction("Méthodologie", null, []);
    expect(prompt).toContain('"Méthodologie"');
  });

  it("inclut l'extrait du DAO quand fourni", () => {
    const prompt = construirePromptRedaction("Méthodologie", "Contenu du DAO.", []);
    expect(prompt).toContain("Contenu du DAO.");
  });

  it("n'inclut aucune section DAO quand daoMarkdown est null", () => {
    const prompt = construirePromptRedaction("Méthodologie", null, []);
    expect(prompt).not.toContain("Extrait du dossier d'appel d'offres");
  });

  it("tronque le DAO au-delà de la longueur maximale (100 000 caractères)", () => {
    const daoLong = "A".repeat(150000);
    const prompt = construirePromptRedaction("Méthodologie", daoLong, []);
    expect(prompt).toContain("A".repeat(100000));
    expect(prompt).not.toContain("A".repeat(100001));
  });

  it("inclut le nom et le contenu de chaque document source", () => {
    const document = creerDocument();
    const prompt = construirePromptRedaction("Méthodologie", null, [document]);
    expect(prompt).toContain("Référence Projet X");
    expect(prompt).toContain("Contenu de la référence projet X.");
  });

  it("indique l'absence de document source quand la liste est vide", () => {
    const prompt = construirePromptRedaction("Méthodologie", null, []);
    expect(prompt).toContain("Aucun document de référence fourni");
  });

  it("tronque le contenu d'un document source au-delà de la longueur maximale (20 000 caractères)", () => {
    const documentLong = creerDocument({ contenu_markdown: "B".repeat(30000) });
    const prompt = construirePromptRedaction("Méthodologie", null, [documentLong]);
    expect(prompt).toContain("B".repeat(20000));
    expect(prompt).not.toContain("B".repeat(20001));
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/appels-offres/redaction/generer.test.ts`

Expected: FAIL — `generer.ts` n'existe pas encore.

- [ ] **Step 3: Créer `lib/appels-offres/redaction/generer.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { Document } from "@/lib/documents/types";

const anthropic = new Anthropic({ maxRetries: 4 });

const LONGUEUR_MAX_DAO_MARKDOWN = 100000;
const LONGUEUR_MAX_CONTENU_DOCUMENT = 20000;

export function construirePromptRedaction(
  titreSection: string,
  daoMarkdown: string | null,
  documentsSource: Document[],
): string {
  const daoTronque = daoMarkdown
    ? daoMarkdown.length > LONGUEUR_MAX_DAO_MARKDOWN
      ? daoMarkdown.slice(0, LONGUEUR_MAX_DAO_MARKDOWN)
      : daoMarkdown
    : null;

  const documentsTexte = documentsSource
    .map((document) => {
      const contenu = document.contenu_markdown ?? "";
      const contenuTronque =
        contenu.length > LONGUEUR_MAX_CONTENU_DOCUMENT
          ? contenu.slice(0, LONGUEUR_MAX_CONTENU_DOCUMENT)
          : contenu;
      return `### ${document.nom}\n${contenuTronque}`;
    })
    .join("\n\n");

  const sectionDocuments =
    documentsTexte.length > 0
      ? `Documents de référence disponibles :\n\n${documentsTexte}`
      : "Aucun document de référence fourni pour cette section.";

  const sectionDao = daoTronque
    ? `Extrait du dossier d'appel d'offres (DAO), pour respecter ses consignes :\n\n${daoTronque}`
    : "";

  return `Tu rédiges la section "${titreSection}" d'un dossier de réponse à un appel d'offres ivoirien, pour le compte d'une entreprise de BTP/ingénierie/environnement/énergie-climat.

${sectionDao}

${sectionDocuments}

Consignes strictes :
- N'invente aucun fait, chiffre, certification ou référence absent des documents fournis ci-dessus.
- Si une information nécessaire à cette section n'est présente dans aucun document fourni, indique-le explicitement dans le texte plutôt que de l'inventer (ex. "à compléter : [information manquante]").
- Rédige uniquement le texte de la section, en français, en paragraphes de prose — sans titre, sans numérotation, sans commentaire sur la tâche elle-même.
- Réponds uniquement avec le texte de la section, sans préambule ni conclusion ajoutés.`;
}

export async function genererSectionRedaction(
  titreSection: string,
  daoMarkdown: string | null,
  documentsSource: Document[],
): Promise<string> {
  const prompt = construirePromptRedaction(titreSection, daoMarkdown, documentsSource);

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

Run: `npx vitest run lib/appels-offres/redaction/generer.test.ts`

Expected: PASS, 7/7.

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/redaction/generer.ts lib/appels-offres/redaction/generer.test.ts
git commit -m "feat: génération de section rédactionnelle (prompt testé + appel Claude)"
```

---

### Task 3: Extension de `obtenirAppelOffres` — sections + documents source

**Files:**
- Modify: `lib/appels-offres/queries.ts`

**Interfaces:**
- Consumes: `SectionDossier` (Task 1), tables `section_dossier`/`section_document` (Task 1).
- Produces: `obtenirAppelOffres` retourne désormais `{ appelOffres, exigences, dossierReponse, documentsParExigence, sections, documentsParSection }` — consommé par Task 5 (export) et Task 7 (UI).

**Pas de test dédié** (cohérent avec l'absence de test sur ce fichier depuis le sous-projet 2).

- [ ] **Step 1: Remplacer le contenu de `lib/appels-offres/queries.ts`**

Remplacer le fichier entier par :

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AppelOffres, DossierReponse, ExigenceAo, SectionDossier } from "./types";
import type { Document } from "@/lib/documents/types";

export async function listerAppelsOffres(
  entrepriseId: string,
): Promise<AppelOffres[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appel_offres")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as AppelOffres[];
}

// Le get-or-create ci-dessous diffère délibérément de l'insertion
// best-effort de traitement.ts (lib/appels-offres/traitement.ts) : là-bas,
// un échec ne doit jamais faire échouer un traitement par ailleurs réussi.
// Ici, la page de détail a besoin de cette ligne pour fonctionner (afficher
// le mapping, plus tard le statut de relecture) — un échec doit donc
// remonter une vraie erreur.
async function obtenirOuCreerDossierReponse(
  supabase: SupabaseClient,
  appelOffresId: string,
): Promise<DossierReponse> {
  const { data: existant } = await supabase
    .from("dossier_reponse")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .maybeSingle();

  if (existant) return existant as DossierReponse;

  const { data: cree, error: erreurInsertion } = await supabase
    .from("dossier_reponse")
    .insert({ appel_offres_id: appelOffresId })
    .select("*")
    .maybeSingle();

  if (!erreurInsertion && cree) return cree as DossierReponse;

  // Course possible avec une autre requête concurrente (ex. deux onglets
  // ouverts sur le même AO au même instant, ou l'insertion best-effort de
  // traitement.ts qui vient de s'exécuter entre notre SELECT et notre
  // INSERT) : la contrainte unique sur appel_offres_id a été violée. Non
  // fatal — la ligne existe forcément à ce stade, on la relit.
  const { data: relu } = await supabase
    .from("dossier_reponse")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .maybeSingle();

  if (!relu) {
    throw new Error("Échec de la création du dossier de réponse.");
  }

  return relu as DossierReponse;
}

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

  const { data: exigences, error: erreurExigences } = await supabase
    .from("exigence_ao")
    .select("*")
    .eq("appel_offres_id", id)
    .order("created_at", { ascending: true });

  if (erreurExigences) throw erreurExigences;

  const exigencesTypees = (exigences ?? []) as ExigenceAo[];

  const dossierReponse = await obtenirOuCreerDossierReponse(supabase, id);

  const documentsParExigence: Record<string, Document[]> = {};

  if (exigencesTypees.length > 0) {
    const { data: liens, error: erreurLiens } = await supabase
      .from("exigence_document")
      .select("exigence_ao_id, document(*)")
      .in(
        "exigence_ao_id",
        exigencesTypees.map((e) => e.id),
      );

    if (erreurLiens) throw erreurLiens;

    for (const lien of liens ?? []) {
      const exigenceId = lien.exigence_ao_id as string;
      documentsParExigence[exigenceId] ??= [];
      documentsParExigence[exigenceId].push(lien.document as unknown as Document);
    }
  }

  const { data: sections, error: erreurSections } = await supabase
    .from("section_dossier")
    .select("*")
    .eq("dossier_reponse_id", dossierReponse.id)
    .order("created_at", { ascending: true });

  if (erreurSections) throw erreurSections;

  const sectionsTypees = (sections ?? []) as SectionDossier[];

  const documentsParSection: Record<string, Document[]> = {};

  if (sectionsTypees.length > 0) {
    const { data: liensSections, error: erreurLiensSections } = await supabase
      .from("section_document")
      .select("section_dossier_id, document(*)")
      .in(
        "section_dossier_id",
        sectionsTypees.map((s) => s.id),
      );

    if (erreurLiensSections) throw erreurLiensSections;

    for (const lien of liensSections ?? []) {
      const sectionId = lien.section_dossier_id as string;
      documentsParSection[sectionId] ??= [];
      documentsParSection[sectionId].push(lien.document as unknown as Document);
    }
  }

  return {
    appelOffres: appelOffres as AppelOffres,
    exigences: exigencesTypees,
    dossierReponse,
    documentsParExigence,
    sections: sectionsTypees,
    documentsParSection,
  };
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur. Comme pour `documentsParExigence`, un éventuel avertissement de typage sur la relation embarquée `document(*)` est déjà couvert par le double cast (`as string`, `as unknown as Document`) — ne pas ajouter de générique Supabase supplémentaire.

- [ ] **Step 3: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`

Expected: tous les tests existants passent toujours (127/127 attendus : 120 existants + 7 de Task 2). Aucun fichier n'importe `obtenirAppelOffres` en mockant l'ancien type de retour à 4 champs.

- [ ] **Step 4: Commit**

```bash
git add lib/appels-offres/queries.ts
git commit -m "feat: charger les sections rédactionnelles et leurs documents source"
```

---

### Task 4: Server Actions de rédaction

**Files:**
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: `genererSectionRedaction` (Task 2), `obtenirAppelOffres` (Task 3), tables `section_dossier`/`section_document` (Task 1).
- Produces :
  - `export async function genererContenuSection(appelOffresId: string, titreSection: string, documentIds: string[]): Promise<{ erreur: string } | { succes: true; sectionId: string; contenu: string; statut: StatutSectionDossier }>`
  - `export async function modifierContenuSection(appelOffresId: string, sectionId: string, contenu: string): Promise<{ erreur: string } | { succes: true }>`
  - `export async function validerSection(appelOffresId: string, sectionId: string): Promise<{ erreur: string } | { succes: true }>`
  - `export async function devaliderSection(appelOffresId: string, sectionId: string): Promise<{ erreur: string } | { succes: true }>`

  Toutes consommées par Task 7 (UI).

**Pas de test dédié** (cohérent avec l'absence de test sur les autres Server Actions du fichier).

- [ ] **Step 1: Étendre les imports de `lib/appels-offres/actions.ts`**

Remplacer les lignes d'import suivantes (en haut du fichier) :

```ts
import { construireCheminStockageDao, construireCheminStockageExport } from "./storage-path";
import { mettreEnFileTraitementDao } from "./file-attente";
import { listerAppelsOffres, obtenirAppelOffres } from "./queries";
import { construirePlanExport } from "./export/plan";
import { genererDocumentWord } from "./export/docx";
import type { AppelOffres, StatutPipelineAo } from "./types";
```

Par :

```ts
import { construireCheminStockageDao, construireCheminStockageExport } from "./storage-path";
import { mettreEnFileTraitementDao } from "./file-attente";
import { listerAppelsOffres, obtenirAppelOffres } from "./queries";
import { construirePlanExport } from "./export/plan";
import { genererDocumentWord } from "./export/docx";
import { genererSectionRedaction } from "./redaction/generer";
import type { AppelOffres, StatutPipelineAo, StatutSectionDossier } from "./types";
import type { Document } from "@/lib/documents/types";
```

- [ ] **Step 2: Ajouter les 4 Server Actions à la fin de `lib/appels-offres/actions.ts`**

```ts
export async function genererContenuSection(
  appelOffresId: string,
  titreSection: string,
  documentIds: string[],
): Promise<
  | { erreur: string }
  | { succes: true; sectionId: string; contenu: string; statut: StatutSectionDossier }
> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const resultat = await obtenirAppelOffres(appelOffresId, utilisateur.entreprise_id);
  if (!resultat) return { erreur: "Appel d'offres introuvable." };

  const supabase = await createClient();

  let documentsSource: Document[] = [];
  if (documentIds.length > 0) {
    const { data, error: erreurDocuments } = await supabase
      .from("document")
      .select("*")
      .in("id", documentIds);

    if (erreurDocuments) {
      return { erreur: "Échec de la lecture des documents source. Réessayez." };
    }
    documentsSource = (data ?? []) as Document[];
  }

  // La génération elle-même échoue avant toute écriture en base : un échec
  // ici ne doit jamais écraser le contenu/statut d'une section déjà
  // validée par une régénération précédente ratée.
  let contenu: string;
  try {
    contenu = await genererSectionRedaction(
      titreSection,
      resultat.appelOffres.dao_markdown,
      documentsSource,
    );
  } catch {
    return { erreur: "Échec de la génération. Réessayez." };
  }

  const { data: section, error: erreurUpsert } = await supabase
    .from("section_dossier")
    .upsert(
      {
        dossier_reponse_id: resultat.dossierReponse.id,
        titre: titreSection,
        contenu,
        statut: "brouillon",
        generated_at: new Date().toISOString(),
        created_by: utilisateur.id,
      },
      { onConflict: "dossier_reponse_id,titre" },
    )
    .select("id")
    .maybeSingle();

  if (erreurUpsert || !section) {
    return { erreur: "Échec de l'enregistrement de la section. Réessayez." };
  }

  const { error: erreurSuppressionLiens } = await supabase
    .from("section_document")
    .delete()
    .eq("section_dossier_id", section.id);

  if (erreurSuppressionLiens) {
    return { erreur: "Échec de l'enregistrement des sources. Réessayez." };
  }

  if (documentIds.length > 0) {
    const { error: erreurInsertionLiens } = await supabase.from("section_document").insert(
      documentIds.map((documentId) => ({
        section_dossier_id: section.id,
        document_id: documentId,
      })),
    );

    if (erreurInsertionLiens) {
      return { erreur: "Échec de l'enregistrement des sources. Réessayez." };
    }
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, sectionId: section.id, contenu, statut: "brouillon" };
}

export async function modifierContenuSection(
  appelOffresId: string,
  sectionId: string,
  contenu: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("section_dossier")
    .update({ contenu })
    .eq("id", sectionId)
    .select("id");

  if (error) {
    return { erreur: "Échec de l'enregistrement. Réessayez." };
  }

  if (!data || data.length === 0) {
    return { erreur: "Section introuvable." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function validerSection(
  appelOffresId: string,
  sectionId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("section_dossier")
    .update({ statut: "validee" })
    .eq("id", sectionId)
    .select("id");

  if (error) {
    return { erreur: "Échec de la validation. Réessayez." };
  }

  if (!data || data.length === 0) {
    return { erreur: "Section introuvable." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function devaliderSection(
  appelOffresId: string,
  sectionId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("section_dossier")
    .update({ statut: "brouillon" })
    .eq("id", sectionId)
    .select("id");

  if (error) {
    return { erreur: "Échec de la mise à jour. Réessayez." };
  }

  if (!data || data.length === 0) {
    return { erreur: "Section introuvable." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add lib/appels-offres/actions.ts
git commit -m "feat: Server Actions de génération/validation des sections rédactionnelles"
```

---

### Task 5: Intégration à l'export Word (modifie le sous-projet 3)

**Files:**
- Modify: `lib/appels-offres/export/plan.ts`
- Modify: `lib/appels-offres/export/plan.test.ts`
- Modify: `lib/appels-offres/export/docx.ts`
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: `SectionDossier` (Task 1), `resultat.sections` (Task 3).
- Produces: `construirePlanExport` gagne un 4e paramètre `sections: SectionDossier[]` (avant `dateExport`, qui devient le 5e) ; `PlanExport` gagne `sectionsRedigees`.

- [ ] **Step 1: Remplacer le contenu de `lib/appels-offres/export/plan.ts`**

```ts
import type { AppelOffres, ExigenceAo, SectionDossier } from "../types";
import type { Document, TypeDocument } from "@/lib/documents/types";

const LIBELLES_TYPE_DOCUMENT: Record<TypeDocument, string> = {
  piece_administrative: "Pièce administrative",
  reference_projet: "Référence de projet",
  cv: "CV",
  agrement: "Agrément",
};

export interface PlanExport {
  titre: string;
  acheteur: string | null;
  secteur: string | null;
  dateExport: string;
  sommaireAttendu: string[] | null;
  sectionsRedigees: Array<{ titre: string; contenu: string }>;
  piecesRequises: Array<{
    libelle: string;
    documents: Array<{ nom: string; type: string }>;
  }>;
  criteresEvaluation: Array<{
    libelle: string;
    ponderation: number | null;
  }>;
}

function formaterDate(date: Date): string {
  const jour = String(date.getUTCDate()).padStart(2, "0");
  const mois = String(date.getUTCMonth() + 1).padStart(2, "0");
  const annee = date.getUTCFullYear();
  return `${jour}/${mois}/${annee}`;
}

export function construirePlanExport(
  appelOffres: AppelOffres,
  exigences: ExigenceAo[],
  documentsParExigence: Record<string, Document[]>,
  sections: SectionDossier[],
  dateExport: Date,
): PlanExport {
  const piecesRequises = exigences
    .filter((e) => e.type_exigence === "piece_requise")
    .map((exigence) => ({
      libelle: exigence.libelle,
      documents: (documentsParExigence[exigence.id] ?? []).map((document) => ({
        nom: document.nom,
        type: LIBELLES_TYPE_DOCUMENT[document.type],
      })),
    }));

  const criteresEvaluation = exigences
    .filter((e) => e.type_exigence === "critere_evaluation")
    .map((exigence) => ({
      libelle: exigence.libelle,
      ponderation: exigence.ponderation,
    }));

  const sectionsRedigees = sections
    .filter((section) => section.statut === "validee" && section.contenu !== null)
    .map((section) => ({
      titre: section.titre,
      contenu: section.contenu as string,
    }));

  return {
    titre: appelOffres.titre ?? appelOffres.fichier_dao_nom_original,
    acheteur: appelOffres.acheteur,
    secteur: appelOffres.secteur,
    dateExport: formaterDate(dateExport),
    sommaireAttendu: appelOffres.sommaire_attendu,
    sectionsRedigees,
    piecesRequises,
    criteresEvaluation,
  };
}
```

- [ ] **Step 2: Remplacer le contenu de `lib/appels-offres/export/plan.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { construirePlanExport } from "./plan";
import type { AppelOffres, ExigenceAo, SectionDossier } from "../types";
import type { Document } from "@/lib/documents/types";

function creerAppelOffres(overrides: Partial<AppelOffres> = {}): AppelOffres {
  return {
    id: "ao-1",
    entreprise_id: "ent-1",
    titre: "Construction d'un pont",
    acheteur: "Ministère des Infrastructures",
    secteur: "BTP",
    date_limite: null,
    montant_caution: null,
    statut_pipeline: "identifie",
    statut_traitement: "termine",
    erreur_traitement: null,
    fichier_dao_path: "ent-1/appels-offres/ao-1-dao.pdf",
    fichier_dao_nom_original: "dao.pdf",
    dao_markdown: null,
    sommaire_attendu: ["Offre technique", "Offre financière"],
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function creerExigence(overrides: Partial<ExigenceAo> = {}): ExigenceAo {
  return {
    id: "exi-1",
    appel_offres_id: "ao-1",
    type_exigence: "piece_requise",
    libelle: "RCCM",
    description: null,
    ponderation: null,
    source_section: "IS 4.2",
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function creerDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    entreprise_id: "ent-1",
    type: "piece_administrative",
    nom: "RCCM K-Nowledge",
    fichier_path: "ent-1/documents/rccm.pdf",
    fichier_nom_original: "rccm.pdf",
    mime_type: "application/pdf",
    taille_octets: 1024,
    date_expiration: null,
    contenu_markdown: null,
    source_ocr: false,
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function creerSection(overrides: Partial<SectionDossier> = {}): SectionDossier {
  return {
    id: "sec-1",
    dossier_reponse_id: "dr-1",
    titre: "Méthodologie",
    contenu: "Texte généré et validé.",
    statut: "validee",
    generated_at: "2026-09-07T00:00:00Z",
    created_by: null,
    created_at: "2026-09-07T00:00:00Z",
    ...overrides,
  };
}

describe("construirePlanExport", () => {
  it("liste les documents associés à une pièce requise", () => {
    const appelOffres = creerAppelOffres();
    const exigence = creerExigence();
    const document = creerDocument();

    const plan = construirePlanExport(
      appelOffres,
      [exigence],
      { [exigence.id]: [document] },
      [],
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(plan.piecesRequises).toEqual([
      {
        libelle: "RCCM",
        documents: [{ nom: "RCCM K-Nowledge", type: "Pièce administrative" }],
      },
    ]);
  });

  it("laisse la liste de documents vide pour une pièce non mappée", () => {
    const appelOffres = creerAppelOffres();
    const exigence = creerExigence({ id: "exi-2", libelle: "Attestation CNPS" });

    const plan = construirePlanExport(
      appelOffres,
      [exigence],
      {},
      [],
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(plan.piecesRequises).toEqual([{ libelle: "Attestation CNPS", documents: [] }]);
  });

  it("inclut les critères d'évaluation avec leur pondération", () => {
    const appelOffres = creerAppelOffres();
    const critere = creerExigence({
      id: "exi-3",
      type_exigence: "critere_evaluation",
      libelle: "Qualité technique",
      ponderation: 60,
    });

    const plan = construirePlanExport(
      appelOffres,
      [critere],
      {},
      [],
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(plan.criteresEvaluation).toEqual([{ libelle: "Qualité technique", ponderation: 60 }]);
  });

  it("renvoie une liste de critères vide si aucun n'existe", () => {
    const appelOffres = creerAppelOffres();

    const plan = construirePlanExport(appelOffres, [], {}, [], new Date("2026-09-10T12:00:00Z"));

    expect(plan.criteresEvaluation).toEqual([]);
  });

  it("conserve sommaire_attendu tel quel quand présent", () => {
    const appelOffres = creerAppelOffres({ sommaire_attendu: ["Section A", "Section B"] });

    const plan = construirePlanExport(appelOffres, [], {}, [], new Date("2026-09-10T12:00:00Z"));

    expect(plan.sommaireAttendu).toEqual(["Section A", "Section B"]);
  });

  it("renvoie null pour sommaireAttendu quand absent", () => {
    const appelOffres = creerAppelOffres({ sommaire_attendu: null });

    const plan = construirePlanExport(appelOffres, [], {}, [], new Date("2026-09-10T12:00:00Z"));

    expect(plan.sommaireAttendu).toBeNull();
  });

  it("formate la date d'export en JJ/MM/AAAA (UTC)", () => {
    const appelOffres = creerAppelOffres();

    const plan = construirePlanExport(appelOffres, [], {}, [], new Date("2026-01-05T23:00:00Z"));

    expect(plan.dateExport).toBe("05/01/2026");
  });

  it("utilise le nom de fichier original comme titre si le titre est absent", () => {
    const appelOffres = creerAppelOffres({ titre: null, fichier_dao_nom_original: "dao-brut.pdf" });

    const plan = construirePlanExport(appelOffres, [], {}, [], new Date("2026-09-10T12:00:00Z"));

    expect(plan.titre).toBe("dao-brut.pdf");
  });

  it("inclut une section validée avec du contenu", () => {
    const appelOffres = creerAppelOffres();
    const section = creerSection();

    const plan = construirePlanExport(
      appelOffres,
      [],
      {},
      [section],
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(plan.sectionsRedigees).toEqual([
      { titre: "Méthodologie", contenu: "Texte généré et validé." },
    ]);
  });

  it("exclut une section en statut brouillon", () => {
    const appelOffres = creerAppelOffres();
    const section = creerSection({ statut: "brouillon" });

    const plan = construirePlanExport(
      appelOffres,
      [],
      {},
      [section],
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(plan.sectionsRedigees).toEqual([]);
  });

  it("renvoie une liste vide de sectionsRedigees si aucune section n'existe", () => {
    const appelOffres = creerAppelOffres();

    const plan = construirePlanExport(appelOffres, [], {}, [], new Date("2026-09-10T12:00:00Z"));

    expect(plan.sectionsRedigees).toEqual([]);
  });
});
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run lib/appels-offres/export/plan.test.ts`

Expected: PASS, 11/11.

- [ ] **Step 4: Remplacer le contenu de `lib/appels-offres/export/docx.ts`**

```ts
import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import type { PlanExport } from "./plan";

export async function genererDocumentWord(plan: PlanExport): Promise<Buffer> {
  const enfants: Paragraph[] = [
    new Paragraph({ text: plan.titre, heading: HeadingLevel.TITLE }),
  ];

  if (plan.acheteur) {
    enfants.push(new Paragraph({ text: `Acheteur : ${plan.acheteur}` }));
  }
  if (plan.secteur) {
    enfants.push(new Paragraph({ text: `Secteur : ${plan.secteur}` }));
  }
  enfants.push(new Paragraph({ text: `Exporté le : ${plan.dateExport}` }));

  if (plan.sommaireAttendu && plan.sommaireAttendu.length > 0) {
    enfants.push(
      new Paragraph({ text: "Sommaire attendu", heading: HeadingLevel.HEADING_1 }),
    );
    for (const item of plan.sommaireAttendu) {
      enfants.push(new Paragraph({ text: item, bullet: { level: 0 } }));
    }
  }

  // Sections rédigées et validées : rendues avant les pièces requises et les
  // critères d'évaluation, car elles constituent le contenu narratif réel de
  // l'offre — les sections suivantes sont plus administratives (listes,
  // checklists). Aucune mention des sources ici (décision du spec).
  for (const section of plan.sectionsRedigees) {
    enfants.push(new Paragraph({ text: section.titre, heading: HeadingLevel.HEADING_1 }));
    const paragraphes = section.contenu
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    for (const paragraphe of paragraphes) {
      enfants.push(new Paragraph({ text: paragraphe }));
    }
  }

  enfants.push(new Paragraph({ text: "Pièces requises", heading: HeadingLevel.HEADING_1 }));
  if (plan.piecesRequises.length === 0) {
    enfants.push(new Paragraph({ text: "Aucune pièce requise identifiée." }));
  } else {
    for (const piece of plan.piecesRequises) {
      enfants.push(new Paragraph({ text: piece.libelle, heading: HeadingLevel.HEADING_2 }));
      if (piece.documents.length === 0) {
        enfants.push(
          new Paragraph({ text: "Aucun document associé — à compléter", bullet: { level: 0 } }),
        );
      } else {
        for (const document of piece.documents) {
          enfants.push(
            new Paragraph({
              text: `${document.nom} (${document.type})`,
              bullet: { level: 0 },
            }),
          );
        }
      }
    }
  }

  enfants.push(
    new Paragraph({ text: "Critères d'évaluation", heading: HeadingLevel.HEADING_1 }),
  );
  if (plan.criteresEvaluation.length === 0) {
    enfants.push(new Paragraph({ text: "Aucun critère d'évaluation identifié." }));
  } else {
    for (const critere of plan.criteresEvaluation) {
      const suffixe = critere.ponderation !== null ? ` — ${critere.ponderation}%` : "";
      enfants.push(
        new Paragraph({ text: `${critere.libelle}${suffixe}`, bullet: { level: 0 } }),
      );
    }
  }

  const document = new Document({
    sections: [{ children: enfants }],
  });

  return Packer.toBuffer(document);
}
```

- [ ] **Step 5: Mettre à jour l'appel dans `exporterDossierReponse` (`lib/appels-offres/actions.ts`)**

Remplacer :

```ts
  const plan = construirePlanExport(
    resultat.appelOffres,
    resultat.exigences,
    resultat.documentsParExigence,
    new Date(),
  );
```

Par :

```ts
  const plan = construirePlanExport(
    resultat.appelOffres,
    resultat.exigences,
    resultat.documentsParExigence,
    resultat.sections,
    new Date(),
  );
```

- [ ] **Step 6: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 7: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`

Expected: 130/130 tests passent (127 après Task 3 − 8 anciens tests de `plan.test.ts` remplacés + 11 nouveaux = 130).

- [ ] **Step 8: Commit**

```bash
git add lib/appels-offres/export/plan.ts lib/appels-offres/export/plan.test.ts lib/appels-offres/export/docx.ts lib/appels-offres/actions.ts
git commit -m "feat: intégrer les sections rédigées validées à l'export Word"
```

---

### Task 6: Traductions FR/EN

**Files:**
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: rien.
- Produces: namespace `AppelsOffres.detail.redaction` avec 15 clés — consommé par Task 7 (`SectionRedaction`, via `useTranslations("AppelsOffres.detail.redaction")`).

- [ ] **Step 1: Ajouter le sous-objet `redaction` dans `messages/fr.json`**

Dans `messages/fr.json`, la clé `"detail"` se termine actuellement par (lignes 144-149) :

```json
      "error": {
        "message": "Impossible de charger cet appel d'offres.",
        "reessayer": "Réessayer"
      }
    }
  },
```

La remplacer par (ajout de `"redaction"` avant `"error"`) :

```json
      "redaction": {
        "titre": "Rédaction assistée",
        "boutonGenerer": "Générer",
        "boutonRegenerer": "Régénérer",
        "generationEnCours": "Génération en cours...",
        "boutonValider": "Valider",
        "boutonDevalider": "Repasser en brouillon",
        "statutBrouillon": "Brouillon",
        "statutValidee": "Validée",
        "placeholderSelect": "Ajouter un document source...",
        "bibliothequeVide": "Aucun document dans la bibliothèque. Ajoutez-en depuis la Bibliothèque.",
        "retirerSource": "Retirer",
        "aucuneSource": "Aucun document source sélectionné.",
        "boutonEnregistrerTexte": "Enregistrer le texte",
        "erreurGeneration": "Échec de la génération. Réessayez.",
        "erreurEnregistrement": "Échec de l'enregistrement. Réessayez.",
        "erreurValidation": "Échec de la mise à jour du statut. Réessayez."
      },
      "error": {
        "message": "Impossible de charger cet appel d'offres.",
        "reessayer": "Réessayer"
      }
    }
  },
```

- [ ] **Step 2: Ajouter le même sous-objet dans `messages/en.json`**

Dans `messages/en.json`, la clé `"detail"` se termine actuellement par (lignes 144-149) :

```json
      "error": {
        "message": "Could not load this tender.",
        "reessayer": "Retry"
      }
    }
  },
```

La remplacer par :

```json
      "redaction": {
        "titre": "AI-assisted drafting",
        "boutonGenerer": "Generate",
        "boutonRegenerer": "Regenerate",
        "generationEnCours": "Generating...",
        "boutonValider": "Approve",
        "boutonDevalider": "Revert to draft",
        "statutBrouillon": "Draft",
        "statutValidee": "Approved",
        "placeholderSelect": "Add a source document...",
        "bibliothequeVide": "No document in the library yet. Add one from the Library.",
        "retirerSource": "Remove",
        "aucuneSource": "No source document selected.",
        "boutonEnregistrerTexte": "Save text",
        "erreurGeneration": "Failed to generate. Please try again.",
        "erreurEnregistrement": "Failed to save. Please try again.",
        "erreurValidation": "Failed to update status. Please try again."
      },
      "error": {
        "message": "Could not load this tender.",
        "reessayer": "Retry"
      }
    }
  },
```

- [ ] **Step 3: Vérifier que les deux fichiers restent du JSON valide**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('OK')"`

Expected: `OK` imprimé, aucune erreur de parsing.

- [ ] **Step 4: Commit**

```bash
git add messages/fr.json messages/en.json
git commit -m "feat: traductions FR/EN pour la rédaction assistée"
```

---

### Task 7: Composant `SectionRedaction` + intégration UI

**Files:**
- Create: `components/ui/textarea.tsx`
- Create: `app/(app)/appels-offres/[id]/section-redaction.tsx`
- Modify: `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`
- Modify: `app/(app)/appels-offres/[id]/page.tsx`

**Interfaces:**
- Consumes: `genererContenuSection`/`modifierContenuSection`/`validerSection`/`devaliderSection` (Task 4), traductions (Task 6), `sections`/`documentsParSection` (Task 3).
- Produces: `AppelOffresDetail` accepte deux nouvelles props (`sections`, `documentsParSection`) ; `SectionRedaction` est un composant terminal.

- [ ] **Step 1: Créer `components/ui/textarea.tsx`**

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
```

- [ ] **Step 2: Créer `app/(app)/appels-offres/[id]/section-redaction.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { toast } from "sonner";
import {
  genererContenuSection,
  modifierContenuSection,
  validerSection,
  devaliderSection,
} from "@/lib/appels-offres/actions";
import type { SectionDossier, StatutSectionDossier } from "@/lib/appels-offres/types";
import type { Document } from "@/lib/documents/types";

export function SectionRedaction({
  appelOffresId,
  titreSection,
  section,
  documentsSource,
  bibliotheque,
}: {
  appelOffresId: string;
  titreSection: string;
  section: SectionDossier | undefined;
  documentsSource: Document[];
  bibliotheque: Document[];
}) {
  const t = useTranslations("AppelsOffres.detail.redaction");
  const [sectionId, setSectionId] = useState(section?.id);
  const [contenu, setContenu] = useState(section?.contenu ?? "");
  const [statut, setStatut] = useState<StatutSectionDossier>(section?.statut ?? "brouillon");
  const [documentsChoisis, setDocumentsChoisis] = useState(documentsSource);
  const [generation, setGeneration] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [isPending, startTransition] = useTransition();

  const idsChoisis = new Set(documentsChoisis.map((d) => d.id));
  const disponibles = bibliotheque.filter((d) => !idsChoisis.has(d.id));

  function ajouterDocument(documentId: string) {
    const document = bibliotheque.find((d) => d.id === documentId);
    if (!document) return;
    setDocumentsChoisis((liste) => [...liste, document]);
  }

  function retirerDocument(documentId: string) {
    setDocumentsChoisis((liste) => liste.filter((d) => d.id !== documentId));
  }

  async function generer() {
    setGeneration(true);
    const resultat = await genererContenuSection(
      appelOffresId,
      titreSection,
      documentsChoisis.map((d) => d.id),
    );
    setGeneration(false);

    if ("erreur" in resultat) {
      toast.error(t("erreurGeneration"));
      return;
    }

    setSectionId(resultat.sectionId);
    setContenu(resultat.contenu);
    setStatut(resultat.statut);
  }

  async function sauvegarderContenu() {
    if (!sectionId) return;
    setEnregistrement(true);
    const resultat = await modifierContenuSection(appelOffresId, sectionId, contenu);
    setEnregistrement(false);

    if ("erreur" in resultat) {
      toast.error(t("erreurEnregistrement"));
    }
  }

  function basculerStatut() {
    if (!sectionId) return;
    const precedent = statut;
    const nouveauStatut: StatutSectionDossier = statut === "brouillon" ? "validee" : "brouillon";
    setStatut(nouveauStatut);

    startTransition(async () => {
      const resultat =
        nouveauStatut === "validee"
          ? await validerSection(appelOffresId, sectionId)
          : await devaliderSection(appelOffresId, sectionId);

      if ("erreur" in resultat) {
        toast.error(t("erreurValidation"));
        setStatut(precedent);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{titreSection}</span>
          <Badge variant={statut === "validee" ? "default" : "outline"}>
            {statut === "validee" ? t("statutValidee") : t("statutBrouillon")}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {documentsChoisis.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("aucuneSource")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {documentsChoisis.map((document) => (
              <li key={document.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{document.nom}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => retirerDocument(document.id)}
                >
                  {t("retirerSource")}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {bibliotheque.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("bibliothequeVide")}</p>
        ) : disponibles.length > 0 ? (
          <Select key={documentsChoisis.length} onValueChange={ajouterDocument}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("placeholderSelect")} />
            </SelectTrigger>
            <SelectContent>
              {disponibles.map((document) => (
                <SelectItem key={document.id} value={document.id}>
                  {document.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {sectionId && (
          <div className="flex flex-col gap-2">
            <Textarea
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              rows={8}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={sauvegarderContenu}
              disabled={enregistrement}
            >
              {t("boutonEnregistrerTexte")}
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-2">
        <Button type="button" onClick={generer} disabled={generation}>
          {generation
            ? t("generationEnCours")
            : sectionId
              ? t("boutonRegenerer")
              : t("boutonGenerer")}
        </Button>
        {sectionId && (
          <Button type="button" variant="outline" onClick={basculerStatut} disabled={isPending}>
            {statut === "brouillon" ? t("boutonValider") : t("boutonDevalider")}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 3: Modifier `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`**

Ajouter les imports, avec les autres imports de composants locaux :

```ts
import { SectionRedaction } from "./section-redaction";
import type { SectionDossier } from "@/lib/appels-offres/types";
```

Changer la signature de la fonction pour accepter deux props supplémentaires :

```tsx
export function AppelOffresDetail({
  appelOffres,
  exigences,
  documentsParExigence,
  bibliotheque,
  sections,
  documentsParSection,
}: {
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  documentsParExigence: Record<string, Document[]>;
  bibliotheque: Document[];
  sections: SectionDossier[];
  documentsParSection: Record<string, Document[]>;
}) {
```

Insérer une nouvelle zone entre le bloc "Critères d'évaluation" et le bouton d'export. Le bloc actuel se termine par :

```tsx
          <Button onClick={exporter} disabled={exportation}>
            {t("boutonExporter")}
          </Button>
        </>
      )}
```

Le remplacer par (ajout de la zone de rédaction avant le bouton d'export) :

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
        </>
      )}
```

- [ ] **Step 4: Modifier `app/(app)/appels-offres/[id]/page.tsx`**

Remplacer l'appel à `<AppelOffresDetail>` (actuellement) :

```tsx
      <AppelOffresDetail
        appelOffres={resultat.appelOffres}
        exigences={resultat.exigences}
        documentsParExigence={resultat.documentsParExigence}
        bibliotheque={bibliotheque}
      />
```

Par :

```tsx
      <AppelOffresDetail
        appelOffres={resultat.appelOffres}
        exigences={resultat.exigences}
        documentsParExigence={resultat.documentsParExigence}
        bibliotheque={bibliotheque}
        sections={resultat.sections}
        documentsParSection={resultat.documentsParSection}
      />
```

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 6: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`

Expected: 130/130 tests passent (aucun test ne couvre ces composants UI, mais rien ne doit être cassé ailleurs).

- [ ] **Step 7: Vérifier le build de production**

Run: `npx next build`

Expected: build réussi, aucune erreur.

- [ ] **Step 8: Commit**

```bash
git add components/ui/textarea.tsx app/\(app\)/appels-offres/\[id\]/section-redaction.tsx app/\(app\)/appels-offres/\[id\]/appel-offres-detail.tsx app/\(app\)/appels-offres/\[id\]/page.tsx
git commit -m "feat: UI de rédaction assistée par section sur la page de détail AO"
```

---

## Self-Review Notes

- **Couverture du spec** : les 7 décisions validées (sections dérivées de `sommaire_attendu`, traçabilité au niveau section, validation section par section, sélection manuelle des sources, génération synchrone, modèle configurable, aucune mention des sources dans le `.docx`) sont chacune couvertes par une tâche.
- **Cohérence des types** : `SectionDossier`/`StatutSectionDossier` définis une seule fois (Task 1), réutilisés sans redéfinition dans `queries.ts` (Task 3), `actions.ts` (Task 4), `export/plan.ts` (Task 5), `section-redaction.tsx` (Task 7). La signature de `construirePlanExport` (nouveau paramètre `sections` en 4e position) est identique dans sa définition (Task 5) et son unique site d'appel (`exporterDossierReponse`, mis à jour dans la même tâche).
- **Correction apportée pendant la rédaction de ce plan (absente du spec, détail d'implémentation)** : `genererContenuSection` retourne le contenu et le statut générés (`{ succes: true; sectionId; contenu; statut }`) plutôt qu'un simple `{ succes: true }` — nécessaire car `SectionRedaction` ne peut pas connaître le texte produit par Claude autrement (contrairement à `DocumentsExigence` du sous-projet 2, qui connaît déjà l'objet `Document` associé côté client avant l'appel). Sans ce retour, l'UI n'aurait aucun moyen d'afficher le texte généré sans un rechargement complet de page.
- **Aucun placeholder** : chaque étape contient le code exact à écrire ou le texte exact à remplacer.
- **Vérification manuelle requise après ce sous-projet** : comme pour les précédents, la qualité réelle du texte généré sur un cas réel, l'ouverture du `.docx` avec ses nouvelles sections, et la policy RLS `section_dossier`/`section_document` restent à vérifier par Sorel via `npm run dev` avant de considérer le Module 4 dans son ensemble définitivement clos.
