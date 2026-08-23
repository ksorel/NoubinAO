# Page d'Accueil Marketing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic Next.js/Supabase starter homepage with a real NoubinAO marketing page (hero, problem statement, workflow, modules with honest availability badges, pricing logic without amounts, final CTA, footer).

**Architecture:** One presentational Server Component per section under `components/marketing/`, assembled by a rewritten `app/page.tsx`. No new data fetching, no new Server Actions — the only dynamic piece is the existing `AuthButton` (already handles logged-in/out state). All obsolete starter components this page no longer needs are deleted in the same pass.

**Tech Stack:** Next.js 16 App Router (Server Components), Tailwind CSS with the existing NoubinAO theme tokens, `next/link`, existing `Button`/`Logo`/`ThemeSwitcher`/`AuthButton`/`LogoutButton` components.

## Global Constraints

- TypeScript strict mode, no `any`.
- French UI copy (default language per CLAUDE.md).
- Colors via existing Tailwind theme tokens (`app/globals.css` variables) — no hardcoded hex values in components.
- No fabricated statistics or unverifiable claims — the spec's copy is final, do not add numbers not present in it.
- No pricing amounts displayed — the spec's Tarifs section text is final, do not add FCFA figures.
- No links to legal pages (mentions légales, confidentialité) — they don't exist yet.
- Spec of record: `docs/superpowers/specs/2026-08-23-page-accueil-marketing-design.md`.
- **Correction to the spec's deletion list**: this branch is based on `main` at a commit that predates the Module 2 branch's own cleanup of `app/protected/`. On `main`, `app/protected/page.tsx` still exists and still imports `components/tutorial/fetch-data-steps.tsx`, which in turn depends on `components/tutorial/tutorial-step.tsx` and `components/tutorial/code-block.tsx`. **Do NOT delete these three files or `app/protected/`** — only `components/tutorial/connect-supabase-steps.tsx` and `components/tutorial/sign-up-user-steps.tsx` are safe to delete (they're only used by the old `app/page.tsx` this plan rewrites). That cleanup of `app/protected/` and the rest of `components/tutorial/` already happened on the Module 2 branch and will land naturally when that branch merges — redoing it here would just create a merge conflict for no benefit.

---

### Task 1: Marketing section components + French auth-button copy

**Files:**
- Create: `components/marketing/hero.tsx`
- Create: `components/marketing/constat.tsx`
- Create: `components/marketing/comment-ca-marche.tsx`
- Create: `components/marketing/modules.tsx`
- Create: `components/marketing/tarifs.tsx`
- Create: `components/marketing/cta-final.tsx`
- Create: `components/marketing/site-footer.tsx`
- Modify: `components/auth-button.tsx`

**Interfaces:**
- Produces: `Hero`, `Constat`, `CommentCaMarche`, `Modules`, `Tarifs`, `CtaFinal`, `SiteFooter` — all zero-prop React Server Components, default-exported as named exports (`export function X()`), consumed by Task 2's `app/page.tsx`.
- Consumes: `Button` from `@/components/ui/button` (existing, `asChild`/`size`/`variant`/`className` props), `ThemeSwitcher` from `@/components/theme-switcher` (existing, no props).

This task has no automated tests — every file is static presentational JSX with no logic branches worth unit testing (per CLAUDE.md, Vitest priority is the extraction/mapping engine and Zod validation, not static marketing copy). Verification is `npm run build` plus the Task 3 manual visual check.

- [ ] **Step 1: Create the hero section**

Create `components/marketing/hero.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="flex flex-col items-center gap-6 text-center py-16 px-4">
      <h1 className="text-3xl sm:text-4xl font-bold max-w-2xl">
        Une seule personne. Plusieurs appels d&apos;offres en parallèle.
      </h1>
      <p className="text-muted-foreground max-w-xl text-base sm:text-lg">
        NoubinAO centralise vos pièces administratives, vos références et le
        suivi de vos AO — pour sortir un dossier complet sans y consacrer
        plusieurs jours à chaque fois.
      </p>
      <div className="flex flex-col items-center gap-2">
        <Button asChild size="lg">
          <Link href="/auth/sign-up">Essai gratuit</Link>
        </Button>
        <span className="text-xs text-muted-foreground">
          Sans carte bancaire
        </span>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create the "constat" (problem) section**

Create `components/marketing/constat.tsx`:

```tsx
const POINTS = [
  "Vos pièces à jour sont dispersées entre dossier papier et boîte mail",
  "Le sommaire imposé se refait à chaque appel d'offres",
  "Faute de temps, certains AO sont ratés ou bâclés",
];

export function Constat() {
  return (
    <section className="py-12 px-4">
      <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-6">
        Le constat
      </h2>
      <div className="grid gap-4 sm:grid-cols-3 max-w-4xl mx-auto">
        {POINTS.map((point) => (
          <div
            key={point}
            className="rounded-lg border bg-card p-4 text-sm text-card-foreground text-center"
          >
            {point}
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create the "comment ça marche" (workflow) section**

Create `components/marketing/comment-ca-marche.tsx`:

```tsx
const ETAPES = [
  {
    titre: "Une bibliothèque toujours à jour",
    description:
      "Pièces administratives, références projets, CV — avec alertes d'expiration.",
  },
  {
    titre: "Un DAO analysé, un dossier pré-assemblé",
    description:
      "Lecture du DAO, extraction des exigences, mapping à la bibliothèque.",
  },
  {
    titre: "Tous vos AO suivis au même endroit",
    description: "Statut, échéances, échanges email centralisés.",
  },
];

export function CommentCaMarche() {
  return (
    <section className="py-12 px-4">
      <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-6">
        Comment ça marche
      </h2>
      <div className="grid gap-4 sm:grid-cols-3 max-w-4xl mx-auto">
        {ETAPES.map((etape, index) => (
          <div
            key={etape.titre}
            className="rounded-lg border bg-card p-4 text-card-foreground"
          >
            <div className="text-2xl font-bold text-primary mb-2">
              {index + 1}
            </div>
            <h3 className="font-semibold mb-1">{etape.titre}</h3>
            <p className="text-sm text-muted-foreground">
              {etape.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create the modules section**

Create `components/marketing/modules.tsx`:

```tsx
type EtatModule = "disponible" | "bientot";

const MODULES: { nom: string; etat: EtatModule }[] = [
  { nom: "Bibliothèque documentaire", etat: "disponible" },
  { nom: "Extraction de DAO", etat: "bientot" },
  { nom: "Suivi par AO (emails, pipeline)", etat: "bientot" },
];

const BADGE_STYLES: Record<EtatModule, string> = {
  disponible:
    "bg-[hsl(var(--status-gagne))]/15 text-[hsl(var(--status-gagne))]",
  bientot:
    "bg-[hsl(var(--status-identifie))]/15 text-[hsl(var(--status-identifie))]",
};

const BADGE_LABELS: Record<EtatModule, string> = {
  disponible: "Disponible",
  bientot: "Bientôt",
};

export function Modules() {
  return (
    <section className="py-12 px-4 bg-muted/40">
      <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-6">
        Modules
      </h2>
      <div className="flex flex-col gap-3 max-w-md mx-auto">
        {MODULES.map((module) => (
          <div
            key={module.nom}
            className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground"
          >
            <span>{module.nom}</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_STYLES[module.etat]}`}
            >
              {BADGE_LABELS[module.etat]}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create the pricing section**

Create `components/marketing/tarifs.tsx`:

```tsx
export function Tarifs() {
  return (
    <section className="py-12 px-4 bg-muted/40 text-center">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
        Tarifs
      </h2>
      <p className="max-w-md mx-auto text-sm text-muted-foreground">
        Le prix suit l&apos;usage réel : le nombre d&apos;AO traités par
        mois, pas le nombre d&apos;utilisateurs ni de documents stockés. Un
        palier Découverte gratuit pour essayer.
      </p>
    </section>
  );
}
```

- [ ] **Step 6: Create the final CTA section**

Create `components/marketing/cta-final.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CtaFinal() {
  return (
    <section className="py-16 px-4 bg-primary text-center">
      <h2 className="text-primary-foreground text-xl font-bold mb-6 max-w-md mx-auto">
        Prêt à traiter plus d&apos;AO avec la même équipe ?
      </h2>
      <Button
        asChild
        size="lg"
        className="bg-accent text-accent-foreground hover:bg-accent/90"
      >
        <Link href="/auth/sign-up">Essai gratuit</Link>
      </Button>
    </section>
  );
}
```

- [ ] **Step 7: Create the footer**

Create `components/marketing/site-footer.tsx`:

```tsx
import { ThemeSwitcher } from "@/components/theme-switcher";

export function SiteFooter() {
  return (
    <footer className="flex items-center justify-center gap-8 border-t py-8 px-4 text-center text-xs text-muted-foreground">
      <p>NoubinAO — un produit K-Nowledge</p>
      <ThemeSwitcher />
    </footer>
  );
}
```

- [ ] **Step 8: Localize `auth-button.tsx` to French**

In `components/auth-button.tsx`, replace:

```tsx
  return user ? (
    <div className="flex items-center gap-4">
      Hey, {user.email}!
      <LogoutButton />
    </div>
  ) : (
    <div className="flex gap-2">
      <Button asChild size="sm" variant={"outline"}>
        <Link href="/auth/login">Sign in</Link>
      </Button>
      <Button asChild size="sm" variant={"default"}>
        <Link href="/auth/sign-up">Sign up</Link>
      </Button>
    </div>
  );
```

with:

```tsx
  return user ? (
    <div className="flex items-center gap-4">
      Bonjour, {user.email}
      <LogoutButton />
    </div>
  ) : (
    <div className="flex gap-2">
      <Button asChild size="sm" variant={"outline"}>
        <Link href="/auth/login">Se connecter</Link>
      </Button>
      <Button asChild size="sm" variant={"default"}>
        <Link href="/auth/sign-up">S&apos;inscrire</Link>
      </Button>
    </div>
  );
```

- [ ] **Step 9: Verify the build**

```bash
npm run build
```

Expected: build succeeds. (`app/page.tsx` still imports the old components at this point, so this build is really checking the 8 files above type-check and compile in isolation — the old homepage keeps working until Task 2 rewires it.)

- [ ] **Step 10: Commit**

```bash
git add components/marketing components/auth-button.tsx
git commit -m "feat: add marketing homepage section components"
```

---

### Task 2: Assemble the homepage and remove obsolete starter files

**Files:**
- Modify: `app/page.tsx` (full rewrite)
- Delete: `components/hero.tsx`
- Delete: `components/next-logo.tsx`
- Delete: `components/supabase-logo.tsx`
- Delete: `components/deploy-button.tsx`
- Delete: `components/env-var-warning.tsx`
- Delete: `components/tutorial/connect-supabase-steps.tsx`
- Delete: `components/tutorial/sign-up-user-steps.tsx`

**Interfaces:**
- Consumes: `Hero`, `Constat`, `CommentCaMarche`, `Modules`, `Tarifs`, `CtaFinal`, `SiteFooter` from Task 1's `components/marketing/*`; `AuthButton` from `@/components/auth-button` (Task 1, French copy); `Logo` from `@/components/logo` (existing, `className` prop).

**Do NOT delete** `components/tutorial/tutorial-step.tsx`, `components/tutorial/code-block.tsx`, `components/tutorial/fetch-data-steps.tsx`, or `app/protected/` — see the Global Constraints correction above. These are still in active use by `app/protected/page.tsx` on this branch.

- [ ] **Step 1: Rewrite the homepage**

Replace the full contents of `app/page.tsx` with:

```tsx
import Link from "next/link";
import { Suspense } from "react";
import { AuthButton } from "@/components/auth-button";
import { Logo } from "@/components/logo";
import { Hero } from "@/components/marketing/hero";
import { Constat } from "@/components/marketing/constat";
import { CommentCaMarche } from "@/components/marketing/comment-ca-marche";
import { Modules } from "@/components/marketing/modules";
import { Tarifs } from "@/components/marketing/tarifs";
import { CtaFinal } from "@/components/marketing/cta-final";
import { SiteFooter } from "@/components/marketing/site-footer";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <nav className="w-full flex justify-center border-b h-16">
        <div className="w-full max-w-5xl flex justify-between items-center px-5">
          <Link href="/">
            <Logo className="h-8 w-auto" />
          </Link>
          <Suspense>
            <AuthButton />
          </Suspense>
        </div>
      </nav>

      <Hero />
      <Constat />
      <CommentCaMarche />
      <Modules />
      <Tarifs />
      <CtaFinal />
      <SiteFooter />
    </main>
  );
}
```

- [ ] **Step 2: Delete the obsolete starter files**

```bash
rm components/hero.tsx
rm components/next-logo.tsx
rm components/supabase-logo.tsx
rm components/deploy-button.tsx
rm components/env-var-warning.tsx
rm components/tutorial/connect-supabase-steps.tsx
rm components/tutorial/sign-up-user-steps.tsx
```

- [ ] **Step 3: Verify nothing else references the deleted files**

```bash
grep -rn "next-logo\|supabase-logo\|deploy-button\|env-var-warning\|connect-supabase-steps\|sign-up-user-steps\|components/hero" app components lib
```

Expected: no output. If anything other than what you just deleted shows up, stop and re-check before proceeding — it means something outside this plan's scope depends on one of these files (the Global Constraints section already identified `fetch-data-steps.tsx`/`tutorial-step.tsx`/`code-block.tsx`/`app/protected/` as such — those are expected to still exist and are not part of this grep's targets).

- [ ] **Step 4: Verify the build**

```bash
npm run build
```

Expected: build succeeds, `/` appears in the route list, no dangling imports. `/protected` should still appear too, unaffected.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git add -u components/hero.tsx components/next-logo.tsx components/supabase-logo.tsx components/deploy-button.tsx components/env-var-warning.tsx components/tutorial/connect-supabase-steps.tsx components/tutorial/sign-up-user-steps.tsx
git commit -m "feat: assemble marketing homepage, remove obsolete starter components"
```

---

### Task 3: Manual visual verification

**Files:** none (verification only).

**Interfaces:** none — this task confirms Tasks 1-2 produce the page a real visitor would see.

**Use the `verify` skill for this task** — driving the real page in a browser, not just trusting `npm run build`.

- [ ] **Step 1: Copy environment variables into this worktree**

This worktree was created fresh from `main` and does not have `.env.local` (it's git-ignored, never copied automatically between worktrees). Copy it from the original checkout:

```bash
cp "C:\Users\KONE\OneDrive\Desktop\k-group\aopilot\.env.local" .env.local
```

- [ ] **Step 2: Install dependencies and start the dev server**

```bash
npm install
npm run dev
```

- [ ] **Step 3: Visual walkthrough in the browser**

Open the dev server's URL (check its terminal output for the port — 3000 may already be in use by another project on this machine, in which case Next.js picks the next available port automatically) and check:

1. All 7 sections render in order: hero, constat, comment ça marche, modules, tarifs, CTA final, footer.
2. The "Extraction de DAO" and "Suivi par AO" modules show a neutral "Bientôt" badge; "Bibliothèque documentaire" shows a green "Disponible" badge.
3. No pricing amounts appear anywhere in the Tarifs section.
4. Both "Essai gratuit" buttons (hero and final CTA) link to `/auth/sign-up` and the page loads correctly.
5. The nav shows "Se connecter" / "S'inscrire" in French when logged out.
6. Toggle dark mode via the footer's theme switcher — check contrast on every section, especially the blue CTA-final section and the module badges.
7. Resize to a mobile width (or use browser dev tools' device toolbar) — confirm the 3-column grids (constat, comment ça marche) collapse to a single column and nothing overflows horizontally.
8. Confirm `/protected` still loads without errors (proves Task 2's file deletions didn't break it).

Expected: every point above holds. Note any visual issue and fix before considering this done — this is the acceptance gate for the whole page.

- [ ] **Step 4: Stop the dev server, commit any fixes**

If Step 3 required fixes, commit them with a `fix:` prefix. If no fixes were needed, this task produces no commit.

**Reminder (not part of this plan's scope):** the "Essai gratuit" buttons will fail in production until `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are added to the Vercel project's environment variables (confirmed missing in an earlier session). Flag this to whoever merges this branch before it goes live publicly.
