# Fil d'Ariane (breadcrumbs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every page under `app/(app)/` a fil d'Ariane (breadcrumb trail) in the header, declared per-page rather than derived from the URL, so it stays correct for future dynamic routes (e.g. `/pipeline/[id]` showing an AO's real title instead of its id).

**Architecture:** A React Context (`BreadcrumbProvider`) holds the current trail (`{ label, href? }[]`) in state. Pages declare their trail via a `useDefinirFilAriane(items)` hook (client-only, so a small no-render "announcer" component carries it for Server Component pages). `app/(app)/layout.tsx` wraps its content in the provider and renders a `<BreadcrumbTrail />` in the header, between the sidebar trigger and the user menu, using shadcn's `Breadcrumb` primitives.

**Tech Stack:** Next.js App Router, React Context, shadcn/ui `Breadcrumb` component (built on plain semantic markup, no Radix primitive, no new CSS custom properties).

## Global Constraints

- Chaque page déclare explicitement son propre libellé de fil d'Ariane — aucune dérivation automatique depuis un segment d'URL (spec, "Décision validée avec l'utilisateur").
- Le dernier élément du fil d'Ariane s'affiche comme texte simple non cliquable (`BreadcrumbPage`) ; les précédents comme liens (`BreadcrumbLink`) uniquement s'ils fournissent un `href` (spec, section `components/breadcrumb-trail.tsx`).
- `useDefinirFilAriane` réinitialise le tableau au démontage pour éviter qu'un fil d'Ariane obsolète persiste en changeant de page (spec, section `lib/breadcrumb-context.tsx`).
- `<BreadcrumbTrail />` prend place dans le header existant de `app/(app)/layout.tsx`, entre `SidebarTrigger` et `UserMenu` (spec, section `app/(app)/layout.tsx`).
- Pas de fil d'Ariane câblé pour des routes non construites (pipeline, dossier de réponse) — hors périmètre (spec, "Hors périmètre").
- Toute classe de couleur/texte utilisée doit venir des tokens shadcn/Tailwind existants (`text-foreground`, `text-muted-foreground`, etc.) — pas de nouvelle variable CSS, cohérent avec `app/globals.css` qui ne définit aucun token `--breadcrumb-*`.

---

### Task 1: Installer le composant shadcn `Breadcrumb`

**Files:**
- Create: `components/ui/breadcrumb.tsx` (généré par la CLI shadcn)
- Modify potentiellement (effet de bord CLI à vérifier, ne pas supposer) : `components/ui/*.tsx`, `app/globals.css`, `tailwind.config.ts`

**Interfaces:**
- Consumes: rien (première tâche)
- Produces: les primitives `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator` exportées par `components/ui/breadcrumb.tsx`, utilisées par la Task 2.

**Contexte important pour l'implémenteur :** un incident réel s'est déjà produit sur ce projet (sous-projet sidebar) où la CLI shadcn a injecté de la syntaxe Tailwind v4 (`@custom-variant`, `@theme inline {}`) dans `app/globals.css`, invisible à l'exécution de `next build` (pas d'erreur), mais qui empêchait silencieusement Tailwind v3 de générer les classes concernées — le composant s'affichait alors totalement sans style. Ne pas supposer que "le build passe" suffit à valider cette tâche : vérifier explicitement le CSS généré (voir Step 3).

- [ ] **Step 1: Installer le composant**

Run: `npx shadcn@latest add breadcrumb -y`

- [ ] **Step 2: Vérifier qu'aucun fichier existant n'a été modifié de façon inattendue**

Run: `git status`

Seul un nouveau fichier `components/ui/breadcrumb.tsx` (et éventuellement une entrée `breadcrumb` ajoutée à `components.json` s'il existe) est attendu. Si `git status` montre `app/globals.css`, `tailwind.config.ts`, ou d'autres fichiers de `components/ui/` comme modifiés, exécuter :

Run: `git diff app/globals.css tailwind.config.ts`

et vérifier qu'aucune syntaxe `@theme inline` ni `@custom-variant` n'a été ajoutée. Si c'est le cas, retirer ces ajouts (`git checkout -- app/globals.css tailwind.config.ts`) — `breadcrumb.tsx` n'a besoin d'aucune nouvelle variable CSS pour fonctionner, contrairement au composant `Sidebar`.

- [ ] **Step 3: Vérifier que le composant compile et que ses classes sont bien générées**

Run: `npm run build`

Expected: build réussi, sans erreur.

Ensuite, confirmer empiriquement que les classes utilisées par `breadcrumb.tsx` sont bien présentes dans le CSS compilé (et pas silencieusement absentes comme lors de l'incident sidebar) :

Run: `grep -o "text-muted-foreground" .next/static/css/*.css | head -1`

Expected: au moins une occurrence (cette classe est déjà utilisée ailleurs dans le projet, donc sa présence ne prouve pas à elle seule que `breadcrumb.tsx` compile correctement — mais si elle est absente, quelque chose de grave a cassé la build CSS globale). Ouvrir aussi `components/ui/breadcrumb.tsx` et confirmer visuellement qu'il ne référence aucune classe `bg-sidebar*`/variable non définie dans `app/globals.css`.

- [ ] **Step 4: Commit**

```bash
git add components/ui/breadcrumb.tsx components.json
git commit -m "feat: installer le composant shadcn Breadcrumb"
```

(Si `components.json` n'a pas changé, l'omettre du commit — ne commit que ce que `git status` montre réellement.)

---

### Task 2: Contexte, hook et composant d'affichage du fil d'Ariane

**Files:**
- Create: `lib/breadcrumb-context.tsx`
- Create: `components/breadcrumb-trail.tsx`
- Create: `components/annoncer-fil-ariane.tsx`

**Interfaces:**
- Consumes: `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator` de `components/ui/breadcrumb.tsx` (Task 1).
- Produces:
  - `export interface FilArianeItem { label: string; href?: string }`
  - `export function BreadcrumbProvider({ children }: { children: React.ReactNode })` — composant client, à utiliser dans `app/(app)/layout.tsx` (Task 3).
  - `export function useDefinirFilAriane(items: FilArianeItem[]): void` — hook, à appeler par les pages (directement si déjà client, ou via `AnnoncerFilAriane` si Server Component) (Task 3).
  - `export function useFilAriane(): FilArianeItem[]` — hook interne, consommé uniquement par `components/breadcrumb-trail.tsx` dans cette tâche.
  - `export function BreadcrumbTrail()` — composant client sans props, à rendre dans le header de `app/(app)/layout.tsx` (Task 3).
  - `export function AnnoncerFilAriane({ items }: { items: FilArianeItem[] })` — composant client sans rendu (`return null`), à utiliser par les Server Components comme `app/(app)/bibliotheque/page.tsx` (Task 3).

**Note sur les tests :** ces trois fichiers sont de la logique d'intégration React (contexte, effets, rendu de primitives UI), pas des fonctions pures. Le projet n'a pas d'infrastructure de test de composants React installée (`vitest.config.ts` utilise `environment: "node"`, pas de `@testing-library/react`/jsdom) et en ajouter une pour ces trois petits fichiers serait disproportionné (YAGNI) — cette tâche n'a donc pas d'étape TDD automatisée ; sa vérification se fait par build + vérification manuelle (Task 4).

- [ ] **Step 1: Créer le contexte et les hooks**

Créer `lib/breadcrumb-context.tsx` :

```tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";

export interface FilArianeItem {
  label: string;
  href?: string;
}

interface BreadcrumbContextValue {
  items: FilArianeItem[];
  setItems: (items: FilArianeItem[]) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<FilArianeItem[]>([]);

  return (
    <BreadcrumbContext.Provider value={{ items, setItems }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useDefinirFilAriane(items: FilArianeItem[]) {
  const context = useContext(BreadcrumbContext);
  const cleIdentite = items.map((item) => `${item.label}|${item.href ?? ""}`).join(",");

  useEffect(() => {
    if (!context) return;
    context.setItems(items);
    return () => context.setItems([]);
    // items est reconstruit à chaque rendu par l'appelant (tableau littéral) ;
    // cleIdentite en est une représentation stable qui ne change que si le
    // contenu change réellement, évitant une boucle d'effet infinie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleIdentite]);
}

export function useFilAriane(): FilArianeItem[] {
  const context = useContext(BreadcrumbContext);
  return context?.items ?? [];
}
```

- [ ] **Step 2: Créer le composant d'affichage**

Créer `components/breadcrumb-trail.tsx` :

```tsx
"use client";

import { Fragment } from "react";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useFilAriane } from "@/lib/breadcrumb-context";

export function BreadcrumbTrail() {
  const items = useFilAriane();

  if (items.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => {
          const dernier = index === items.length - 1;

          return (
            <Fragment key={`${item.label}-${index}`}>
              <BreadcrumbItem>
                {dernier || !item.href ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={item.href}>{item.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!dernier && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
```

- [ ] **Step 3: Créer le composant "annonceur" pour les Server Components**

Créer `components/annoncer-fil-ariane.tsx` :

```tsx
"use client";

import { useDefinirFilAriane, type FilArianeItem } from "@/lib/breadcrumb-context";

export function AnnoncerFilAriane({ items }: { items: FilArianeItem[] }) {
  useDefinirFilAriane(items);
  return null;
}
```

- [ ] **Step 4: Vérifier que le projet compile et que le typecheck passe**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

Run: `npm run build`

Expected: build réussi (ces trois fichiers ne sont pas encore utilisés ailleurs, donc aucun changement de comportement visible à ce stade — c'est attendu).

- [ ] **Step 5: Commit**

```bash
git add lib/breadcrumb-context.tsx components/breadcrumb-trail.tsx components/annoncer-fil-ariane.tsx
git commit -m "feat: ajouter le contexte, les hooks et l'affichage du fil d'Ariane"
```

---

### Task 3: Câbler le fil d'Ariane dans la coquille d'app et sur la page Bibliothèque

**Files:**
- Modify: `app/(app)/layout.tsx`
- Modify: `app/(app)/bibliotheque/page.tsx`

**Interfaces:**
- Consumes: `BreadcrumbProvider` et `BreadcrumbTrail` (`lib/breadcrumb-context.tsx` / `components/breadcrumb-trail.tsx`, Task 2) ; `AnnoncerFilAriane` (`components/annoncer-fil-ariane.tsx`, Task 2).
- Produces: rien (dernière tâche de câblage ; Task 4 est vérification manuelle uniquement).

**Contenu actuel exact de `app/(app)/layout.tsx`** (pour référence, ne pas deviner) :

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export const instant = false;

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
    .select("id, nom, entreprise:entreprise_id(nom)")
    .eq("id", authData.claims.sub)
    .maybeSingle();

  if (!utilisateur) {
    redirect("/onboarding");
  }

  const entreprise = utilisateur.entreprise as unknown as {
    nom: string;
  } | null;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 items-center justify-between border-b px-4">
          <SidebarTrigger />
          <UserMenu
            nomUtilisateur={utilisateur.nom}
            nomEntreprise={entreprise?.nom ?? ""}
          />
        </header>
        <main className="flex-1 p-5">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

**Contenu actuel exact de `app/(app)/bibliotheque/page.tsx`** (pour référence) :

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

- [ ] **Step 1: Modifier `app/(app)/layout.tsx`**

Ajouter les deux imports suivants, à la suite des imports existants :

```tsx
import { BreadcrumbProvider } from "@/lib/breadcrumb-context";
import { BreadcrumbTrail } from "@/components/breadcrumb-trail";
```

Remplacer le bloc `return (...)` existant par :

```tsx
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <BreadcrumbProvider>
          <header className="flex h-14 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <BreadcrumbTrail />
            </div>
            <UserMenu
              nomUtilisateur={utilisateur.nom}
              nomEntreprise={entreprise?.nom ?? ""}
            />
          </header>
          <main className="flex-1 p-5">{children}</main>
        </BreadcrumbProvider>
      </SidebarInset>
    </SidebarProvider>
  );
```

Note : `BreadcrumbProvider` doit envelopper à la fois le `<header>` (qui contient `BreadcrumbTrail`, le lecteur du contexte) et `<main>{children}</main>` (où les pages déclarent leur fil d'Ariane via le contexte) — les deux doivent être des descendants du même provider pour partager l'état.

- [ ] **Step 2: Modifier `app/(app)/bibliotheque/page.tsx`**

Ajouter l'import :

```tsx
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";
```

Remplacer le `return (...)` existant par :

```tsx
  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: "Bibliothèque" }]} />
      <h1 className="text-2xl font-bold">Bibliothèque documentaire</h1>
      <DocumentTable documents={documents} />
    </div>
  );
```

(Un seul élément, sans `href`, car c'est la page courante — s'affichera donc comme `BreadcrumbPage`, texte simple non cliquable, conformément à la contrainte globale sur le dernier élément.)

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

Run: `npm run build`

Expected: build réussi.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/layout.tsx" "app/(app)/bibliotheque/page.tsx"
git commit -m "feat: afficher le fil d'Ariane dans la coquille d'app et sur la page Bibliothèque"
```

---

### Task 4: Vérification manuelle

**Files:** aucun fichier modifié — tâche de vérification uniquement.

**Interfaces:**
- Consumes: l'application complète issue des Tasks 1-3.
- Produces: rien.

- [ ] **Step 1: Lancer le serveur de développement**

Run: `npm run dev`

- [ ] **Step 2: Se connecter et observer la page Bibliothèque**

Se connecter à l'application, naviguer vers `/bibliotheque`. Vérifier visuellement :
- Le fil d'Ariane affiche "Bibliothèque" dans le header, entre le déclencheur de la sidebar et le menu utilisateur.
- Le texte "Bibliothèque" n'est PAS un lien cliquable (c'est le seul et dernier élément du fil).
- L'apparence est cohérente en mode clair ET en mode sombre (basculer via le sélecteur de thème du menu utilisateur).
- Le fil d'Ariane est lisible et correctement positionné sur mobile (réduire la largeur de la fenêtre ou utiliser les outils de développement en mode responsive).

- [ ] **Step 3: Vérifier la disparition propre en changeant de page**

Naviguer vers une autre page de l'application puis revenir sur `/bibliotheque` (ou observer que le fil d'Ariane ne "clignote" pas avec un ancien contenu au changement de page) — confirme que le nettoyage au démontage (`return () => context.setItems([])` dans `useDefinirFilAriane`) fonctionne comme prévu.

- [ ] **Step 4: Rapporter le résultat à l'utilisateur**

Décrire ce qui a été vérifié et demander confirmation visuelle explicite avant de considérer la tâche terminée — ne jamais affirmer qu'un rendu visuel est correct sans que l'humain l'ait recontrôlé.

---
