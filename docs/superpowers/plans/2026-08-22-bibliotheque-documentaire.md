# Bibliothèque Documentaire (Module 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working document library (upload, categorize, list, filter, expire-alert badges, download, delete) for NoubinAO, backed by a minimal multi-tenant foundation (entreprise/utilisateur tables + onboarding + a lightweight protected app shell).

**Architecture:** Server Components fetch data directly from Supabase (RLS-scoped by `entreprise_id`); mutations go through Next.js Server Actions (no API routes). Files live in a private Supabase Storage bucket, referenced by path only; downloads use short-lived signed URLs generated on demand. Three pure, unit-tested modules (expiration status, storage path, Zod schema) sit underneath the data/UI layers so the riskiest logic (badge thresholds, file validation) is verified without touching the database.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase (Postgres + Storage + Auth, via `@supabase/ssr`), Zod, shadcn/ui (dialog, alert-dialog, tabs, table, select, skeleton, sonner), Vitest.

## Global Constraints

- TypeScript strict mode; no `any` in new code.
- React Server Components by default; Server Actions for all mutations (no new API routes), per CLAUDE.md.
- All new UI copy in French (interface FR par défaut).
- Never call Supabase with a service-role key from new code — the SSR `createClient()` (anon key + user session) is sufficient because RLS enforces access; `SUPABASE_SERVICE_ROLE_KEY` is not introduced by this plan.
- Colors/spacing via existing Tailwind theme tokens (`app/globals.css` variables) — no hardcoded hex values in components.
- Mobile-first layout (CLAUDE.md: 98% d'accès mobile en Côte d'Ivoire).
- Every screen must cover loading / empty / error / success states (CLAUDE.md UI requirement).
- Commits use conventional prefixes (`feat:`, `fix:`, `docs:`, `test:`).
- Spec of record: `docs/superpowers/specs/2026-08-21-bibliotheque-documentaire-design.md`. Three corrections to that spec are applied in this plan (each noted inline at the relevant task): the onboarding page must live outside the `(app)` route group to avoid a redirect loop (Task 6); loading/error states are implemented via Next.js `loading.tsx`/`error.tsx` conventions rather than ad-hoc component state (Task 8); and client-side Zod validation is dropped in favor of server-only validation plus native HTML constraints, to avoid duplicating the schema (Task 9).

---

### Task 1: Database schema, storage bucket, and RLS

**Files:**
- Create: `supabase/config.toml` (via `supabase init`)
- Create: `supabase/migrations/<timestamp>_bibliotheque_documentaire.sql`

**Interfaces:**
- Produces: tables `entreprise(id, nom, rccm, created_at)`, `utilisateur(id, entreprise_id, nom, role, created_at)`, `document(id, entreprise_id, type, nom, fichier_path, fichier_nom_original, mime_type, taille_octets, date_expiration, contenu_markdown, source_ocr, created_by, created_at)`; enum `document_type`; RPC `creer_entreprise(p_nom text, p_rccm text, p_nom_utilisateur text) returns uuid`; storage bucket `documents` with RLS. All later tasks depend on these exact names and columns.

This task requires interactive credentials no engineer/subagent can substitute — a human must run the login/link steps.

- [ ] **Step 1: Log in and link the Supabase CLI (human-in-the-loop)**

Run in the project root:

```bash
npx supabase login
```

This prints a device-auth URL — a human opens it in a browser and approves with their Supabase account. Wait for "You are now logged in" before continuing.

```bash
npx supabase init
npx supabase link --project-ref hjjmymgwvpsxajwtzjdh
```

`link` prompts for the database password (from Supabase dashboard → Project Settings → Database). This is also a human-supplied secret — do not guess or hardcode it.

- [ ] **Step 2: Create the migration file**

```bash
npx supabase migration new bibliotheque_documentaire
```

This creates `supabase/migrations/<timestamp>_bibliotheque_documentaire.sql`. Use that generated path for the next step (the timestamp is assigned by the CLI at run time).

- [ ] **Step 3: Write the migration SQL**

Replace the generated file's content with:

```sql
-- Fondations minimales : entreprise / utilisateur

create table entreprise (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  rccm text,
  created_at timestamptz not null default now()
);

create table utilisateur (
  id uuid primary key references auth.users(id) on delete cascade,
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  nom text not null,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now()
);

create index utilisateur_entreprise_id_idx on utilisateur(entreprise_id);

-- Bibliothèque documentaire

create type document_type as enum (
  'piece_administrative',
  'reference_projet',
  'cv',
  'agrement'
);

create table document (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  type document_type not null,
  nom text not null,
  fichier_path text not null,
  fichier_nom_original text not null,
  mime_type text not null,
  taille_octets bigint not null,
  date_expiration date,
  contenu_markdown text,
  source_ocr boolean,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index document_entreprise_id_idx on document(entreprise_id);
create index document_type_idx on document(type);

-- RLS

alter table entreprise enable row level security;
alter table utilisateur enable row level security;
alter table document enable row level security;

create policy "utilisateur_select_self" on utilisateur
  for select using (id = auth.uid());

create policy "entreprise_select_membres" on entreprise
  for select using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = entreprise.id and u.id = auth.uid()
    )
  );

create policy "document_select_membres" on document
  for select using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = document.entreprise_id and u.id = auth.uid()
    )
  );

create policy "document_insert_membres" on document
  for insert with check (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = document.entreprise_id and u.id = auth.uid()
    )
  );

create policy "document_delete_membres" on document
  for delete using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = document.entreprise_id and u.id = auth.uid()
    )
  );

-- Onboarding : création atomique entreprise + utilisateur (contourne l'oeuf-et-poule RLS)

create or replace function creer_entreprise(
  p_nom text,
  p_rccm text default null,
  p_nom_utilisateur text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entreprise_id uuid;
begin
  if exists (select 1 from utilisateur where id = auth.uid()) then
    raise exception 'utilisateur_deja_rattache';
  end if;

  insert into entreprise (nom, rccm) values (p_nom, p_rccm)
  returning id into v_entreprise_id;

  insert into utilisateur (id, entreprise_id, nom, role)
  values (auth.uid(), v_entreprise_id, p_nom_utilisateur, 'admin');

  return v_entreprise_id;
end;
$$;

revoke all on function creer_entreprise from public;
grant execute on function creer_entreprise to authenticated;

-- Storage : bucket privé + policies scopées par entreprise

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents_select_membres" on storage.objects
  for select using (
    bucket_id = 'documents'
    and exists (
      select 1 from utilisateur u
      where u.id = auth.uid()
      and u.entreprise_id::text = (storage.foldername(name))[1]
    )
  );

create policy "documents_insert_membres" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and exists (
      select 1 from utilisateur u
      where u.id = auth.uid()
      and u.entreprise_id::text = (storage.foldername(name))[1]
    )
  );

create policy "documents_delete_membres" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and exists (
      select 1 from utilisateur u
      where u.id = auth.uid()
      and u.entreprise_id::text = (storage.foldername(name))[1]
    )
  );
```

- [ ] **Step 4: Apply the migration**

```bash
npx supabase db push
```

Expected: CLI reports the migration applied with no errors.

- [ ] **Step 5: Verify in the Supabase SQL editor (or `npx supabase db execute`)**

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('entreprise', 'utilisateur', 'document');
-- expect 3 rows

select id, public from storage.buckets where id = 'documents';
-- expect one row, public = false

select proname from pg_proc where proname = 'creer_entreprise';
-- expect 1 row
```

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "feat: add entreprise/utilisateur/document schema, RLS, and storage bucket"
```

---

### Task 2: Dependencies, shadcn components, and toast wiring

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `components/ui/dialog.tsx`, `components/ui/alert-dialog.tsx`, `components/ui/tabs.tsx`, `components/ui/table.tsx`, `components/ui/select.tsx`, `components/ui/skeleton.tsx`, `components/ui/sonner.tsx` (all generated by shadcn CLI)
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: `zod` and `sonner`'s `toast()` available for import; `npm test` runs Vitest; `<Toaster />` mounted globally so any later `toast.success()/toast.error()` call renders.

**Optional: use the `shadcn-ui` skill** before Step 2 if you want more context on the CLI/registry model than the bare command below provides.

- [ ] **Step 1: Install dependencies**

```bash
npm install zod
npm install -D vitest
```

- [ ] **Step 2: Add shadcn components**

```bash
npx shadcn@latest add dialog alert-dialog tabs table select skeleton sonner -y
```

This installs the `sonner` package as a side effect and writes `components/ui/sonner.tsx`.

- [ ] **Step 3: Add the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 4: Add the test script**

In `package.json`, inside `"scripts"`, add:

```json
    "test": "vitest run",
```

- [ ] **Step 5: Mount the Toaster**

In `app/layout.tsx`, add the import and render `<Toaster />` as a sibling after `{children}`, inside `ThemeProvider`:

```tsx
import { Toaster } from "@/components/ui/sonner";
```

```tsx
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
```

- [ ] **Step 6: Verify the build**

```bash
npm run build
```

Expected: build succeeds (proves the new shadcn components and Toaster wiring compile cleanly).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts components/ui/dialog.tsx components/ui/alert-dialog.tsx components/ui/tabs.tsx components/ui/table.tsx components/ui/select.tsx components/ui/skeleton.tsx components/ui/sonner.tsx app/layout.tsx
git commit -m "feat: add zod, vitest, and shadcn components for the document library"
```

---

### Task 3: Expiration status calculator (TDD)

**Use the `test-driven-development` skill** for this task and Tasks 4–5 if you want the underlying rationale for the red/green/commit rhythm — the steps below already follow it explicitly.

**Files:**
- Create: `lib/documents/expiration.ts`
- Test: `lib/documents/expiration.test.ts`

**Interfaces:**
- Produces: `calculerStatutExpiration(dateExpiration: string | null, maintenant?: Date): "rouge" | "orange" | "vert" | null` and exported type `StatutExpiration`. Consumed by Task 8's `ExpirationBadge`.

- [ ] **Step 1: Write the failing tests**

Create `lib/documents/expiration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculerStatutExpiration } from "./expiration";

describe("calculerStatutExpiration", () => {
  const aujourdhui = new Date("2026-08-22T00:00:00Z");

  it("retourne null si aucune date d'expiration", () => {
    expect(calculerStatutExpiration(null, aujourdhui)).toBeNull();
  });

  it("retourne rouge si déjà expiré", () => {
    expect(calculerStatutExpiration("2026-01-01", aujourdhui)).toBe("rouge");
  });

  it("retourne rouge si expire dans moins de 30 jours", () => {
    expect(calculerStatutExpiration("2026-09-01", aujourdhui)).toBe("rouge");
  });

  it("retourne orange si expire entre 30 et 90 jours", () => {
    expect(calculerStatutExpiration("2026-10-15", aujourdhui)).toBe("orange");
  });

  it("retourne vert si expire dans plus de 90 jours", () => {
    expect(calculerStatutExpiration("2027-06-01", aujourdhui)).toBe("vert");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- expiration`
Expected: FAIL — `lib/documents/expiration.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `lib/documents/expiration.ts`:

```ts
export type StatutExpiration = "rouge" | "orange" | "vert" | null;

const JOUR_MS = 24 * 60 * 60 * 1000;

export function calculerStatutExpiration(
  dateExpiration: string | null,
  maintenant: Date = new Date(),
): StatutExpiration {
  if (!dateExpiration) return null;

  const expiration = new Date(dateExpiration);
  const joursRestants = Math.floor(
    (expiration.getTime() - maintenant.getTime()) / JOUR_MS,
  );

  if (joursRestants < 30) return "rouge";
  if (joursRestants < 90) return "orange";
  return "vert";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- expiration`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/documents/expiration.ts lib/documents/expiration.test.ts
git commit -m "feat: add expiration status calculator"
```

---

### Task 4: Storage path builder (TDD)

**Files:**
- Create: `lib/documents/storage-path.ts`
- Test: `lib/documents/storage-path.test.ts`

**Interfaces:**
- Produces: `construireCheminStockage(entrepriseId: string, documentId: string, nomFichierOriginal: string): string`. Consumed by Task 7's `ajouterDocument` action.

- [ ] **Step 1: Write the failing tests**

Create `lib/documents/storage-path.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { construireCheminStockage } from "./storage-path";

describe("construireCheminStockage", () => {
  it("préfixe le chemin par l'id entreprise puis l'id document", () => {
    const chemin = construireCheminStockage(
      "ent-1",
      "doc-1",
      "rccm.pdf",
    );
    expect(chemin).toBe("ent-1/doc-1-rccm.pdf");
  });

  it("nettoie les caractères non sûrs du nom de fichier", () => {
    const chemin = construireCheminStockage(
      "ent-1",
      "doc-1",
      "RCCM 2026 (final).pdf",
    );
    expect(chemin).toBe("ent-1/doc-1-RCCM_2026__final_.pdf");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- storage-path`
Expected: FAIL — `lib/documents/storage-path.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `lib/documents/storage-path.ts`:

```ts
export function construireCheminStockage(
  entrepriseId: string,
  documentId: string,
  nomFichierOriginal: string,
): string {
  const nomNettoye = nomFichierOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entrepriseId}/${documentId}-${nomNettoye}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- storage-path`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/documents/storage-path.ts lib/documents/storage-path.test.ts
git commit -m "feat: add storage path builder"
```

---

### Task 5: Shared types and upload validation schema (TDD)

**Files:**
- Create: `lib/documents/types.ts`
- Create: `lib/documents/schema.ts`
- Test: `lib/documents/schema.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: from `types.ts` — `TYPES_DOCUMENT` (const array), `TypeDocument` (union type), `TYPES_AVEC_EXPIRATION` (array), `Document` interface. From `schema.ts` — `documentUploadSchema` (Zod), `DocumentUploadInput` type. Consumed by Tasks 6 (layout guard reuses none), 7 (`actions.ts`/`queries.ts` use `Document`, `documentUploadSchema`), 8 (`Document`, `TYPES_DOCUMENT`), 9 (`documentUploadSchema` shape mirrored in the form, `TYPES_DOCUMENT`, `TYPES_AVEC_EXPIRATION`).

- [ ] **Step 1: Write `types.ts` (no test — plain type declarations)**

Create `lib/documents/types.ts`:

```ts
export const TYPES_DOCUMENT = [
  "piece_administrative",
  "reference_projet",
  "cv",
  "agrement",
] as const;

export type TypeDocument = (typeof TYPES_DOCUMENT)[number];

export const TYPES_AVEC_EXPIRATION: TypeDocument[] = [
  "piece_administrative",
  "agrement",
];

export interface Document {
  id: string;
  entreprise_id: string;
  type: TypeDocument;
  nom: string;
  fichier_path: string;
  fichier_nom_original: string;
  mime_type: string;
  taille_octets: number;
  date_expiration: string | null;
  contenu_markdown: string | null;
  source_ocr: boolean | null;
  created_by: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Write the failing tests for the schema**

Create `lib/documents/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { documentUploadSchema } from "./schema";

function creerFichier(nom: string, type: string, tailleOctets: number): File {
  return new File([new Uint8Array(tailleOctets)], nom, { type });
}

describe("documentUploadSchema", () => {
  it("accepte une référence projet sans date d'expiration", () => {
    const resultat = documentUploadSchema.safeParse({
      type: "reference_projet",
      nom: "Référence - École ABC",
      dateExpiration: null,
      fichier: creerFichier("ref.pdf", "application/pdf", 1024),
    });
    expect(resultat.success).toBe(true);
  });

  it("refuse une pièce administrative sans date d'expiration", () => {
    const resultat = documentUploadSchema.safeParse({
      type: "piece_administrative",
      nom: "RCCM",
      dateExpiration: null,
      fichier: creerFichier("rccm.pdf", "application/pdf", 1024),
    });
    expect(resultat.success).toBe(false);
  });

  it("accepte une pièce administrative avec date d'expiration", () => {
    const resultat = documentUploadSchema.safeParse({
      type: "piece_administrative",
      nom: "RCCM",
      dateExpiration: "2027-01-01",
      fichier: creerFichier("rccm.pdf", "application/pdf", 1024),
    });
    expect(resultat.success).toBe(true);
  });

  it("refuse un fichier de plus de 10 Mo", () => {
    const resultat = documentUploadSchema.safeParse({
      type: "cv",
      nom: "CV Jean",
      dateExpiration: null,
      fichier: creerFichier("cv.pdf", "application/pdf", 11 * 1024 * 1024),
    });
    expect(resultat.success).toBe(false);
  });

  it("refuse un type MIME non accepté", () => {
    const resultat = documentUploadSchema.safeParse({
      type: "cv",
      nom: "CV Jean",
      dateExpiration: null,
      fichier: creerFichier("cv.exe", "application/x-msdownload", 1024),
    });
    expect(resultat.success).toBe(false);
  });

  it("refuse un nom vide", () => {
    const resultat = documentUploadSchema.safeParse({
      type: "cv",
      nom: "",
      dateExpiration: null,
      fichier: creerFichier("cv.pdf", "application/pdf", 1024),
    });
    expect(resultat.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- schema`
Expected: FAIL — `lib/documents/schema.ts` does not exist yet.

- [ ] **Step 4: Write the implementation**

Create `lib/documents/schema.ts`:

```ts
import { z } from "zod";
import { TYPES_DOCUMENT, TYPES_AVEC_EXPIRATION } from "./types";

const TAILLE_MAX_OCTETS = 10 * 1024 * 1024;
const TYPES_MIME_ACCEPTES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
];

export const documentUploadSchema = z
  .object({
    type: z.enum(TYPES_DOCUMENT),
    nom: z.string().trim().min(1, "Le nom est requis").max(200),
    dateExpiration: z.string().date().optional().nullable(),
    fichier: z
      .instanceof(File)
      .refine((f) => f.size > 0 && f.size <= TAILLE_MAX_OCTETS, {
        message: "Le fichier doit faire moins de 10 Mo",
      })
      .refine((f) => TYPES_MIME_ACCEPTES.includes(f.type), {
        message: "Type de fichier non accepté",
      }),
  })
  .refine(
    (data) =>
      !TYPES_AVEC_EXPIRATION.includes(data.type) || !!data.dateExpiration,
    {
      message: "La date d'expiration est requise pour ce type de document",
      path: ["dateExpiration"],
    },
  );

export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- schema`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/documents/types.ts lib/documents/schema.ts lib/documents/schema.test.ts
git commit -m "feat: add document types and upload validation schema"
```

---

### Task 6: Onboarding flow, minimal app shell, and starter cleanup

**Files:**
- Create: `lib/entreprise/actions.ts`
- Create: `app/onboarding/page.tsx`
- Create: `app/onboarding/onboarding-form.tsx`
- Create: `app/(app)/layout.tsx`
- Modify: `components/login-form.tsx`
- Modify: `components/sign-up-form.tsx`
- Modify: `components/update-password-form.tsx`
- Delete: `app/protected/page.tsx`, `app/protected/layout.tsx`
- Delete: `components/tutorial/fetch-data-steps.tsx` (only consumer was `app/protected/page.tsx`)

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server` (existing), `LogoutButton` from `@/components/logout-button` (existing, no props), `ThemeSwitcher` from `@/components/theme-switcher` (existing, no props), `Logo` from `@/components/logo` (existing, `className` prop).
- Produces: Server Action `creerEntreprise(formData: FormData): Promise<{ erreur: string } | never>` (redirects on success, so the success branch never returns). `app/(app)/layout.tsx` guarantees every route under `(app)` has an authenticated user with a linked `utilisateur` row — Task 8's `bibliotheque` route relies on this.

**Correction to the spec:** the spec placed onboarding at `app/(app)/onboarding/page.tsx`. That would nest it under the same layout that redirects to `/onboarding` when no `utilisateur` row exists — an infinite redirect loop. This task places it at `app/onboarding/page.tsx` (outside the `(app)` group) instead, with its own inline auth/redirect check.

- [ ] **Step 1: Write the onboarding Server Action**

Create `lib/entreprise/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const creerEntrepriseSchema = z.object({
  nom: z.string().trim().min(1, "Le nom de l'entreprise est requis").max(200),
  rccm: z.string().trim().max(50).optional(),
  nomUtilisateur: z.string().trim().min(1, "Votre nom est requis").max(200),
});

export async function creerEntreprise(formData: FormData) {
  const parsed = creerEntrepriseSchema.safeParse({
    nom: formData.get("nom"),
    rccm: formData.get("rccm") || undefined,
    nomUtilisateur: formData.get("nomUtilisateur"),
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("creer_entreprise", {
    p_nom: parsed.data.nom,
    p_rccm: parsed.data.rccm ?? null,
    p_nom_utilisateur: parsed.data.nomUtilisateur,
  });

  if (error) {
    return { erreur: "Impossible de créer l'entreprise. Réessayez." };
  }

  redirect("/bibliotheque");
}
```

- [ ] **Step 2: Write the onboarding form**

Create `app/onboarding/onboarding-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { creerEntreprise } from "@/lib/entreprise/actions";

export function OnboardingForm() {
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function onSubmit(formData: FormData) {
    setEnvoi(true);
    setErreur(null);
    const resultat = await creerEntreprise(formData);
    setEnvoi(false);
    if (resultat?.erreur) {
      setErreur(resultat.erreur);
    }
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4 max-w-md">
      <div className="flex flex-col gap-2">
        <Label htmlFor="nom">Nom de l&apos;entreprise</Label>
        <Input id="nom" name="nom" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rccm">RCCM (optionnel)</Label>
        <Input id="rccm" name="rccm" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="nomUtilisateur">Votre nom</Label>
        <Input id="nomUtilisateur" name="nomUtilisateur" required />
      </div>
      {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      <Button type="submit" disabled={envoi}>
        {envoi ? "Création..." : "Créer mon entreprise"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Write the onboarding page**

Create `app/onboarding/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.getClaims();

  if (error || !authData?.claims) {
    redirect("/auth/login");
  }

  const { data: utilisateur } = await supabase
    .from("utilisateur")
    .select("id")
    .eq("id", authData.claims.sub)
    .maybeSingle();

  if (utilisateur) {
    redirect("/bibliotheque");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <div className="flex flex-col gap-6 w-full max-w-md">
        <h1 className="text-2xl font-bold">Bienvenue sur NoubinAO</h1>
        <p className="text-muted-foreground">
          Créons d&apos;abord votre entreprise pour continuer.
        </p>
        <OnboardingForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the app shell layout**

Create `app/(app)/layout.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { ThemeSwitcher } from "@/components/theme-switcher";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.getClaims();

  if (error || !authData?.claims) {
    redirect("/auth/login");
  }

  const { data: utilisateur } = await supabase
    .from("utilisateur")
    .select("id")
    .eq("id", authData.claims.sub)
    .maybeSingle();

  if (!utilisateur) {
    redirect("/onboarding");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="w-full flex justify-center border-b h-16">
        <div className="w-full max-w-5xl flex justify-between items-center px-5">
          <Link href="/bibliotheque">
            <Logo className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <ThemeSwitcher />
            <LogoutButton />
          </div>
        </div>
      </nav>
      <main className="flex-1 w-full max-w-5xl mx-auto p-5">{children}</main>
    </div>
  );
}
```

- [ ] **Step 5: Point post-auth redirects at `/bibliotheque`**

In `components/login-form.tsx`, change:
```ts
      router.push("/protected");
```
to:
```ts
      router.push("/bibliotheque");
```

In `components/sign-up-form.tsx`, change:
```ts
          emailRedirectTo: `${window.location.origin}/protected`,
```
to:
```ts
          emailRedirectTo: `${window.location.origin}/bibliotheque`,
```

In `components/update-password-form.tsx`, change:
```ts
      router.push("/protected");
```
to:
```ts
      router.push("/bibliotheque");
```

- [ ] **Step 6: Remove the starter's placeholder protected page**

```bash
rm -rf app/protected
rm components/tutorial/fetch-data-steps.tsx
```

- [ ] **Step 7: Verify the build**

```bash
npm run build
```

Expected: build succeeds with no dangling imports (confirms `fetch-data-steps.tsx` had no other consumers and the new routes compile).

- [ ] **Step 8: Commit**

```bash
git add lib/entreprise app/onboarding "app/(app)/layout.tsx" components/login-form.tsx components/sign-up-form.tsx components/update-password-form.tsx
git add -u app/protected components/tutorial/fetch-data-steps.tsx
git commit -m "feat: add onboarding flow and minimal protected app shell"
```

---

### Task 7: Document queries and mutations

**Files:**
- Create: `lib/documents/queries.ts`
- Create: `lib/documents/actions.ts`

**Interfaces:**
- Consumes: `Document` type and `documentUploadSchema` from `./types` and `./schema` (Task 5), `construireCheminStockage` from `./storage-path` (Task 4), `createClient` from `@/lib/supabase/server` (existing).
- Produces: `obtenirUtilisateurCourant(): Promise<{ id: string; entreprise_id: string; nom: string } | null>`, `listerDocuments(entrepriseId: string): Promise<Document[]>`, `ajouterDocument(formData: FormData): Promise<{ erreur: string } | { succes: true }>`, `supprimerDocument(documentId: string, cheminStockage: string): Promise<{ erreur: string } | { succes: true }>`, `genererUrlTelechargement(cheminStockage: string): Promise<{ erreur: string } | { url: string }>`. Consumed by Task 8 (`queries.ts`) and Task 9 (`actions.ts`).

No dedicated automated test for this task — per the spec, Server Actions that hit the live database/storage are verified manually in Task 10, not with Vitest (they need a running Supabase project and an authenticated session, which the Task 3/4/5 pure-function tests deliberately avoid depending on).

- [ ] **Step 1: Write the queries module**

Create `lib/documents/queries.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import type { Document } from "./types";

export async function obtenirUtilisateurCourant() {
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

export async function listerDocuments(entrepriseId: string): Promise<Document[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as Document[];
}
```

- [ ] **Step 2: Write the mutations module**

Create `lib/documents/actions.ts`:

```ts
"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { documentUploadSchema } from "./schema";
import { construireCheminStockage } from "./storage-path";
import { obtenirUtilisateurCourant } from "./queries";

export async function ajouterDocument(formData: FormData) {
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

export async function supprimerDocument(documentId: string, cheminStockage: string) {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { error: erreurSuppression } = await supabase
    .from("document")
    .delete()
    .eq("id", documentId);

  if (erreurSuppression) {
    return { erreur: "Échec de la suppression. Réessayez." };
  }

  await supabase.storage.from("documents").remove([cheminStockage]);

  revalidatePath("/bibliotheque");
  return { succes: true as const };
}

export async function genererUrlTelechargement(cheminStockage: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(cheminStockage, 60);

  if (error || !data) return { erreur: "Impossible de générer le lien." };
  return { url: data.signedUrl };
}
```

- [ ] **Step 3: Verify the build**

```bash
npm run build
```

Expected: build succeeds (no route consumes these yet, so this only checks the modules type-check correctly).

- [ ] **Step 4: Commit**

```bash
git add lib/documents/queries.ts lib/documents/actions.ts
git commit -m "feat: add document queries and mutation server actions"
```

---

### Task 8: Bibliothèque screen — data + states

**Files:**
- Create: `app/(app)/bibliotheque/page.tsx`
- Create: `app/(app)/bibliotheque/loading.tsx`
- Create: `app/(app)/bibliotheque/error.tsx`
- Create: `app/(app)/bibliotheque/expiration-badge.tsx`

**Interfaces:**
- Consumes: `obtenirUtilisateurCourant`, `listerDocuments` from `@/lib/documents/queries` (Task 7); `calculerStatutExpiration` from `@/lib/documents/expiration` (Task 3); `Document` from `@/lib/documents/types` (Task 5).
- Produces: route `/bibliotheque` renders (currently with an empty-state table since `DocumentTable`/upload dialog land in Task 9); `ExpirationBadge` component consumed by Task 9's table.

**Correction to the spec:** loading/error states are implemented via Next.js's `loading.tsx`/`error.tsx` file conventions (automatic Suspense/error boundaries) rather than manual component state, since the page is a Server Component doing an async fetch — this is simpler and more idiomatic than what the spec implied.

- [ ] **Step 1: Write the expiration badge**

Create `app/(app)/bibliotheque/expiration-badge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { calculerStatutExpiration } from "@/lib/documents/expiration";

const STYLES = {
  rouge: "bg-destructive/15 text-destructive border-destructive/30",
  orange:
    "bg-[hsl(var(--status-soumis))]/15 text-[hsl(var(--status-soumis))] border-[hsl(var(--status-soumis))]/30",
  vert: "bg-[hsl(var(--status-gagne))]/15 text-[hsl(var(--status-gagne))] border-[hsl(var(--status-gagne))]/30",
} as const;

const LABELS = {
  rouge: "Expire bientôt",
  orange: "À surveiller",
  vert: "Valide",
} as const;

export function ExpirationBadge({
  dateExpiration,
}: {
  dateExpiration: string | null;
}) {
  const statut = calculerStatutExpiration(dateExpiration);

  if (!statut) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  return (
    <Badge variant="outline" className={STYLES[statut]}>
      {LABELS[statut]}
    </Badge>
  );
}
```

- [ ] **Step 2: Write the loading state**

Create `app/(app)/bibliotheque/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function ChargementBibliotheque() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write the error state**

Create `app/(app)/bibliotheque/error.tsx`:

```tsx
"use client";

export default function ErreurBibliotheque({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-muted-foreground">
        Impossible de charger la bibliothèque documentaire.
      </p>
      <button
        onClick={reset}
        className="text-sm font-medium text-primary underline underline-offset-4"
      >
        Réessayer
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Write the page (temporary inline empty state, replaced in Task 9)**

Create `app/(app)/bibliotheque/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import {
  obtenirUtilisateurCourant,
  listerDocuments,
} from "@/lib/documents/queries";

export default async function BibliothequePage() {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const documents = await listerDocuments(utilisateur.entreprise_id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Bibliothèque documentaire</h1>
      <p className="text-muted-foreground">
        {documents.length} document(s) — tableau et ajout arrivent dans la
        tâche suivante.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Verify the build**

```bash
npm run build
```

Expected: build succeeds; `/bibliotheque` appears in the route list.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/bibliotheque"
git commit -m "feat: add bibliotheque route with loading/error states and expiration badge"
```

---

### Task 9: Document table and upload dialog

**Files:**
- Create: `app/(app)/bibliotheque/document-table.tsx`
- Create: `app/(app)/bibliotheque/ajouter-document-dialog.tsx`
- Modify: `app/(app)/bibliotheque/page.tsx`

**Interfaces:**
- Consumes: `Document`, `TYPES_DOCUMENT`, `TypeDocument`, `TYPES_AVEC_EXPIRATION` from `@/lib/documents/types` (Task 5); `ajouterDocument`, `supprimerDocument`, `genererUrlTelechargement` from `@/lib/documents/actions` (Task 7); `ExpirationBadge` from `./expiration-badge` (Task 8).
- Produces: the full interactive bibliothèque screen (filter tabs, search, table, delete confirmation, download, add-document dialog).

**Correction to the spec:** the spec called for Zod validation "côté client, re-validée côté Server Action." This task only validates on the server (`documentUploadSchema` inside `ajouterDocument`, Task 7) and relies on native HTML constraints (`required`, `accept`) for client-side guidance. Duplicating the same Zod schema in the client bundle would require either passing `File` objects through a client-side `safeParse` (works, but the error UI would still need the server round-trip for the one check that can't run client-side — the `TYPES_AVEC_EXPIRATION` cross-field rule needs no I/O, so it *could* run client-side) or accepting drift risk between two copies of the rules. Given the form is small and the server responds in one round trip with a clear French message via `toast.error`, this plan skips the client-side duplicate. If the manual verification in Task 10 shows the UX suffers from the extra round trip, add a client-side `documentUploadSchema.safeParse()` call in `onSubmit` before calling the server action, reusing the same import — no new schema needed.

**Optional: use the `shadcn-ui` skill** for Step 1/2 if you want guidance on idiomatic composition of the `Dialog`/`Select`/`Table`/`AlertDialog` primitives beyond what's written out below.

- [ ] **Step 1: Write the upload dialog**

Create `app/(app)/bibliotheque/ajouter-document-dialog.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ajouterDocument } from "@/lib/documents/actions";
import {
  TYPES_DOCUMENT,
  TYPES_AVEC_EXPIRATION,
  type TypeDocument,
} from "@/lib/documents/types";

const LIBELLES_TYPE: Record<TypeDocument, string> = {
  piece_administrative: "Pièce administrative",
  reference_projet: "Référence projet",
  cv: "CV",
  agrement: "Agrément",
};

export function AjouterDocumentDialog({
  libelle = "Ajouter un document",
}: {
  libelle?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<TypeDocument>("piece_administrative");
  const [envoi, setEnvoi] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const afficherExpiration = TYPES_AVEC_EXPIRATION.includes(type);

  async function onSubmit(formData: FormData) {
    setEnvoi(true);
    const resultat = await ajouterDocument(formData);
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }

    toast.success("Document ajouté");
    setOuvert(false);
    formRef.current?.reset();
  }

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>
        <Button>{libelle}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter un document</DialogTitle>
          <DialogDescription>
            Le fichier est stocké de façon privée, accessible uniquement à
            votre entreprise.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="type">Type</Label>
            <Select
              name="type"
              value={type}
              onValueChange={(v) => setType(v as TypeDocument)}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES_DOCUMENT.map((t) => (
                  <SelectItem key={t} value={t}>
                    {LIBELLES_TYPE[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="nom">Nom</Label>
            <Input
              id="nom"
              name="nom"
              placeholder="Ex. RCCM, CV Jean Kouassi"
              required
            />
          </div>

          {afficherExpiration && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="dateExpiration">Date d&apos;expiration</Label>
              <Input id="dateExpiration" name="dateExpiration" type="date" />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="fichier">Fichier</Label>
            <Input
              id="fichier"
              name="fichier"
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              required
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={envoi}>
              {envoi ? "Envoi..." : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write the document table**

Create `app/(app)/bibliotheque/document-table.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ExpirationBadge } from "./expiration-badge";
import { AjouterDocumentDialog } from "./ajouter-document-dialog";
import {
  supprimerDocument,
  genererUrlTelechargement,
} from "@/lib/documents/actions";
import type { Document, TypeDocument } from "@/lib/documents/types";

const ONGLETS: { valeur: TypeDocument | "tous"; libelle: string }[] = [
  { valeur: "tous", libelle: "Tous" },
  { valeur: "piece_administrative", libelle: "Pièces administratives" },
  { valeur: "reference_projet", libelle: "Références projets" },
  { valeur: "cv", libelle: "CV" },
  { valeur: "agrement", libelle: "Agréments" },
];

export function DocumentTable({ documents }: { documents: Document[] }) {
  const [onglet, setOnglet] = useState<TypeDocument | "tous">("tous");
  const [recherche, setRecherche] = useState("");
  const [aSupprimer, setASupprimer] = useState<Document | null>(null);
  const [isPending, startTransition] = useTransition();

  const documentsFiltres = useMemo(() => {
    return documents.filter((doc) => {
      const correspondOnglet = onglet === "tous" || doc.type === onglet;
      const correspondRecherche = doc.nom
        .toLowerCase()
        .includes(recherche.toLowerCase());
      return correspondOnglet && correspondRecherche;
    });
  }, [documents, onglet, recherche]);

  async function telecharger(doc: Document) {
    const resultat = await genererUrlTelechargement(doc.fichier_path);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }

  function confirmerSuppression() {
    if (!aSupprimer) return;
    const cible = aSupprimer;
    startTransition(async () => {
      const resultat = await supprimerDocument(cible.id, cible.fichier_path);
      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
      } else {
        toast.success("Document supprimé");
      }
      setASupprimer(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <Tabs
          value={onglet}
          onValueChange={(v) => setOnglet(v as TypeDocument | "tous")}
        >
          <TabsList>
            {ONGLETS.map((o) => (
              <TabsTrigger key={o.valeur} value={o.valeur}>
                {o.libelle}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Input
            placeholder="Rechercher..."
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="w-full sm:w-64"
          />
          <AjouterDocumentDialog />
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          <p>Aucun document pour l&apos;instant.</p>
          <AjouterDocumentDialog libelle="Ajouter votre premier document" />
        </div>
      ) : documentsFiltres.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          Aucun document ne correspond à ce filtre.
        </p>
      ) : (
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Expiration</TableHead>
              <TableHead>Ajouté le</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documentsFiltres.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>{doc.nom}</TableCell>
                <TableCell>
                  {ONGLETS.find((o) => o.valeur === doc.type)?.libelle}
                </TableCell>
                <TableCell>
                  <ExpirationBadge dateExpiration={doc.date_expiration} />
                </TableCell>
                <TableCell>
                  {new Date(doc.created_at).toLocaleDateString("fr-FR")}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => telecharger(doc)}
                  >
                    Télécharger
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setASupprimer(doc)}
                  >
                    Supprimer
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AlertDialog
        open={!!aSupprimer}
        onOpenChange={(open) => !open && setASupprimer(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce document ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le fichier sera définitivement
              supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={confirmerSuppression}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 3: Wire the table into the page**

Replace `app/(app)/bibliotheque/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import {
  obtenirUtilisateurCourant,
  listerDocuments,
} from "@/lib/documents/queries";
import { DocumentTable } from "./document-table";

export default async function BibliothequePage() {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const documents = await listerDocuments(utilisateur.entreprise_id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Bibliothèque documentaire</h1>
      <DocumentTable documents={documents} />
    </div>
  );
}
```

- [ ] **Step 4: Verify the build**

```bash
npm run build
```

Expected: build succeeds with no type errors across the new client components.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/bibliotheque"
git commit -m "feat: add document table with filters, search, upload, delete, download"
```

---

### Task 10: End-to-end manual verification

**Files:** none (verification only).

**Interfaces:** none — this task confirms Tasks 1–9 work together as a real user would experience them.

**Use the `verify` skill for Step 2** — it exists exactly for this: driving the real flow end-to-end in a browser rather than trusting `npm run build`/`npm test` alone to prove the feature works.

- [ ] **Step 1: Run the full automated check**

```bash
npm test
npm run build
```

Expected: all Vitest tests pass (Tasks 3, 4, 5 — 13 tests total), build succeeds.

- [ ] **Step 2: Manual walkthrough in the browser**

```bash
npm run dev
```

Then, in a browser:
1. Sign up a new account → confirm email (or use an existing test account) → land on `/onboarding` (not stuck in a redirect loop).
2. Submit the onboarding form → land on `/bibliotheque` with an empty state and "Ajouter votre premier document" button.
3. Add one document of each type (`piece_administrative`, `reference_projet`, `cv`, `agrement`) — for the two that require it, set a `date_expiration` once in the past, once <30 days out, once 30-90 days out, once >90 days out — confirm the badge colors match (rouge/rouge/orange/vert), and confirm `reference_projet`/`cv` show "—" instead of a badge.
4. Use the filter tabs and the search box — confirm the table narrows correctly and the "aucun document ne correspond à ce filtre" message appears for an empty combination.
5. Click "Télécharger" on a document — confirm it opens the real file in a new tab.
6. Click "Supprimer", cancel — document remains. Click "Supprimer", confirm — document disappears and the toast shows.
7. Sign out, sign in as a second, unrelated account (or check via the Supabase Studio table editor) — confirm you cannot see the first account's documents (RLS is working).

Expected: every step above behaves as described. Note any deviation and fix before proceeding — this is the acceptance gate for the whole module.

- [ ] **Step 3: Stop the dev server and do a final commit if any fixes were needed**

If Step 2 required fixes, commit them with a `fix:` prefix describing what broke. If no fixes were needed, this task produces no commit.
