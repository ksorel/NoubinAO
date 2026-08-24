# Sélecteur de langue FR/EN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un sélecteur de langue FR/EN dans le menu utilisateur de NoubinAO, avec l'architecture `next-intl` nécessaire pour le faire fonctionner, sans changer les URLs existantes et sans migrer le reste de l'interface pour l'instant.

**Architecture:** `next-intl` en mode "sans routage i18n" : la langue choisie est mémorisée dans un cookie (`NEXT_LOCALE`, défaut `fr`), lu côté serveur à chaque requête pour charger les bons messages. Le fournisseur `NextIntlClientProvider` est branché sur `app/(app)/layout.tsx` (la coquille de l'app authentifiée, où vit `UserMenu`) plutôt que sur le layout racine — voir "Écart par rapport au spec" ci-dessous. Seul `components/user-menu.tsx` consomme des traductions dans cet incrément.

**Tech Stack:** `next-intl`, Next.js App Router (Server Actions pour l'écriture du cookie), cookies() de `next/headers`.

## Écart par rapport au spec (à valider)

Le spec (`docs/superpowers/specs/2026-08-24-selecteur-langue-design.md`) prévoyait
d'envelopper `app/layout.tsx` (le layout racine, partagé par la page marketing
publique ET la coquille authentifiée) dans `NextIntlClientProvider`. Ce plan
dévie de ce détail d'implémentation : le fournisseur est câblé sur
`app/(app)/layout.tsx` uniquement.

**Raison :** lire le cookie de langue (`getLocale()`/`getUserLocale()`) rend
le composant qui l'appelle dynamique (non pré-rendable statiquement). Le
layout racine est actuellement partagé avec la page marketing publique
(`app/page.tsx`, actuellement partiellement statique — `◐` dans la sortie de
build). Y ajouter la lecture du cookie de langue rendrait la page marketing
entièrement dynamique, une régression de performance non nécessaire puisque
la page marketing n'a aucun contenu traduit dans ce périmètre. `app/(app)/layout.tsx`,
en revanche, est **déjà** entièrement dynamique (`ƒ` dans la sortie de
build — il appelle déjà `supabase.auth.getClaims()` et fait une requête
DB à chaque rendu) : y ajouter la lecture du cookie ne coûte donc rien de
plus. Le layout racine garde en plus son attribut `<html lang="...">`,
actuellement codé en dur à `"en"` alors que le contenu par défaut est en
français (Task 3 corrige ce détail séparément, sans le rendre dynamique —
la page marketing reste 100% française pour l'instant).

Si tu préfères respecter le spec à la lettre malgré la régression de
performance décrite, dis-le avant l'exécution — sinon ce plan part sur la
version optimisée ci-dessus.

## Global Constraints

- Pas de préfixe de langue dans l'URL — les routes existantes ne changent pas.
- Langue par défaut : `fr`, toujours, sans détection depuis `Accept-Language` du navigateur.
- Seul `components/user-menu.tsx` est migré vers des clés de traduction dans cet incrément — le reste de l'UI reste en français en dur.
- Cookie de langue : nom `NEXT_LOCALE`.
- Namespace de traduction unique pour l'instant : `UserMenu`, avec exactement ces clés : `theme`, `light`, `dark`, `system`, `language`, `french`, `english`, `logout`.
- Pas de nouvelle logique pure nécessitant un test Vitest (spec, section "Tests") — vérification par build + test manuel uniquement.

---

### Task 1: Installer next-intl et poser l'architecture de base

**Files:**
- Modify: `next.config.ts`
- Create: `i18n/locale.ts`
- Create: `i18n/request.ts`
- Create: `messages/fr.json`
- Create: `messages/en.json`

**Interfaces:**
- Consumes: rien (première tâche)
- Produces:
  - `export type Locale = "fr" | "en"` et `export const LOCALES: readonly Locale[]` depuis `i18n/locale.ts`
  - `export async function getUserLocale(): Promise<Locale>` depuis `i18n/locale.ts` — utilisé par `i18n/request.ts` (cette tâche) et indirectement par `getLocale()` de `next-intl/server` (Task 3).
  - `export async function setUserLocale(locale: Locale): Promise<void>` depuis `i18n/locale.ts` — server action, à appeler par `components/user-menu.tsx` (Task 4).
  - Le module `i18n/request.ts`, consommé automatiquement par le plugin `next-intl/plugin` une fois `next.config.ts` modifié (pas d'import direct nécessaire ailleurs).
  - Les fichiers `messages/fr.json` / `messages/en.json`, avec le namespace `UserMenu` et ses 8 clés (voir Global Constraints), consommés par `useTranslations("UserMenu")` (Task 4).

- [ ] **Step 1: Installer la dépendance**

Run: `npm install next-intl`

- [ ] **Step 2: Créer `i18n/locale.ts`**

```ts
"use server";

import { cookies } from "next/headers";

const COOKIE_NAME = "NEXT_LOCALE";
const DEFAULT_LOCALE: Locale = "fr";

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export async function getUserLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const valeur = cookieStore.get(COOKIE_NAME)?.value;
  return valeur === "en" ? "en" : DEFAULT_LOCALE;
}

export async function setUserLocale(locale: Locale): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, locale);
}
```

- [ ] **Step 3: Créer `i18n/request.ts`**

```ts
import { getRequestConfig } from "next-intl/server";
import { getUserLocale } from "./locale";

export default getRequestConfig(async () => {
  const locale = await getUserLocale();

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 4: Créer `messages/fr.json`**

```json
{
  "UserMenu": {
    "theme": "Thème",
    "light": "Clair",
    "dark": "Sombre",
    "system": "Système",
    "language": "Langue",
    "french": "Français",
    "english": "English",
    "logout": "Se déconnecter"
  }
}
```

- [ ] **Step 5: Créer `messages/en.json`**

```json
{
  "UserMenu": {
    "theme": "Theme",
    "light": "Light",
    "dark": "Dark",
    "system": "System",
    "language": "Language",
    "french": "Français",
    "english": "English",
    "logout": "Log out"
  }
}
```

- [ ] **Step 6: Modifier `next.config.ts`**

Contenu actuel exact :

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;
```

Remplacer par :

```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  cacheComponents: true,
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
```

- [ ] **Step 7: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

Run: `npm run build`

Expected: build réussi. Ces fichiers ne sont pas encore consommés par aucun composant (Task 3 les branche), donc aucun changement de comportement n'est encore visible — c'est attendu. Si le build échoue avec une erreur liée à `next-intl/plugin` ou à la résolution de `i18n/request.ts`, ne pas tenter de contourner silencieusement : rapporter en `BLOCKED` avec le message d'erreur complet, une incompatibilité de version serait un problème d'architecture à remonter, pas à corriger localement.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json next.config.ts i18n/locale.ts i18n/request.ts messages/fr.json messages/en.json
git commit -m "feat: installer next-intl et poser l'architecture i18n de base"
```

---

### Task 2: Corriger l'attribut `lang` codé en dur du layout racine

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: rien
- Produces: rien (correction isolée, sans dépendance avec les autres tâches)

**Contexte :** `app/layout.tsx` a actuellement `<html lang="en" ...>` alors que le contenu par défaut de toute l'application (y compris la page marketing publique, hors périmètre de ce sous-projet) est en français. C'est un bug d'accessibilité/SEO préexistant, sans lien avec l'architecture `next-intl` posée dans les autres tâches (voir "Écart par rapport au spec" en tête de plan — le layout racine ne devient PAS dynamique ici, cette correction est une simple chaîne statique).

**Contenu actuel exact de `app/layout.tsx`** :

```tsx
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "NoubinAO",
  description:
    "NoubinAO — la plateforme de pilotage des réponses aux appels d'offres, un produit K-Nowledge.",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 1: Corriger l'attribut `lang`**

Remplacer uniquement :

```tsx
    <html lang="en" suppressHydrationWarning>
```

par :

```tsx
    <html lang="fr" suppressHydrationWarning>
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "fix: corriger l'attribut lang du layout racine (en -> fr)"
```

---

### Task 3: Brancher NextIntlClientProvider sur la coquille d'app authentifiée

**Files:**
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `getUserLocale` (indirectement, via `getLocale()` de `next-intl/server`, qui lit la config de `i18n/request.ts` créée en Task 1) ; `next-intl`'s `NextIntlClientProvider`, `getLocale`, `getMessages`.
- Produces: le contexte `next-intl` (locale + messages), disponible pour `useTranslations`/`useLocale` dans tout composant descendant — consommé par `components/user-menu.tsx` (Task 4).

**Contenu actuel exact de `app/(app)/layout.tsx`** :

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
import { BreadcrumbProvider } from "@/lib/breadcrumb-context";
import { BreadcrumbTrail } from "@/components/breadcrumb-trail";

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
}
```

- [ ] **Step 1: Ajouter les imports next-intl**

Ajouter, à la suite des imports existants :

```tsx
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
```

- [ ] **Step 2: Charger la locale et les messages avant le `return`**

Juste avant le `return (`, ajouter :

```tsx
  const locale = await getLocale();
  const messages = await getMessages();
```

- [ ] **Step 3: Envelopper le JSX existant dans `NextIntlClientProvider`**

Remplacer le bloc `return (...)` existant par :

```tsx
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
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
    </NextIntlClientProvider>
  );
```

- [ ] **Step 4: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

Run: `npm run build`

Expected: build réussi. Vérifier dans le résumé des routes affiché en fin de build que `/bibliotheque` reste marquée `ƒ` (dynamique, comme avant) — c'est attendu et sans changement, puisque cette route était déjà dynamique. Vérifier aussi que `/` (page marketing) reste `◐` (partiellement statique) et n'est PAS devenue `ƒ` — si c'est le cas, quelque chose a rendu le layout racine dynamique par erreur (ne devrait pas arriver puisque `app/layout.tsx` n'est pas touché par cette tâche) ; rapporter en `BLOCKED` plutôt que d'investiguer longuement.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/layout.tsx"
git commit -m "feat: brancher NextIntlClientProvider sur la coquille d'app authentifiée"
```

---

### Task 4: Migrer UserMenu et ajouter le sélecteur de langue

**Files:**
- Modify: `components/user-menu.tsx`

**Interfaces:**
- Consumes: `useTranslations`, `useLocale` de `next-intl` (contexte fourni par Task 3) ; `setUserLocale`, `Locale` de `@/i18n/locale` (Task 1).
- Produces: rien (dernière tâche de code ; Task 5 est vérification manuelle uniquement).

**Contenu actuel exact de `components/user-menu.tsx`** :

```tsx
"use client";

import { LogOut, Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deriverInitiales } from "@/lib/utilisateur/initiales";

export function UserMenu({
  nomUtilisateur,
  nomEntreprise,
}: {
  nomUtilisateur: string;
  nomEntreprise: string;
}) {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  async function deconnecter() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {deriverInitiales(nomUtilisateur)}
        </span>
        <span>{nomEntreprise}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{nomUtilisateur}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {mounted && (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Thème
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun className="mr-2 h-4 w-4" /> Clair
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="mr-2 h-4 w-4" /> Sombre
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Laptop className="mr-2 h-4 w-4" /> Système
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={deconnecter}>
            <LogOut className="mr-2 h-4 w-4" />
            Se déconnecter
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 1: Remplacer le fichier entier**

Remplacer tout le contenu de `components/user-menu.tsx` par :

```tsx
"use client";

import { LogOut, Laptop, Moon, Sun, Languages } from "lucide-react";
import { useTheme } from "next-themes";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setUserLocale, type Locale } from "@/i18n/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deriverInitiales } from "@/lib/utilisateur/initiales";

export function UserMenu({
  nomUtilisateur,
  nomEntreprise,
}: {
  nomUtilisateur: string;
  nomEntreprise: string;
}) {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const t = useTranslations("UserMenu");
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);

  async function deconnecter() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  function changerLangue(nouvelleLocale: string) {
    startTransition(() => {
      setUserLocale(nouvelleLocale as Locale);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {deriverInitiales(nomUtilisateur)}
        </span>
        <span>{nomEntreprise}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{nomUtilisateur}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {mounted && (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {t("theme")}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun className="mr-2 h-4 w-4" /> {t("light")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="mr-2 h-4 w-4" /> {t("dark")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Laptop className="mr-2 h-4 w-4" /> {t("system")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {t("language")}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={locale} onValueChange={changerLangue}>
              <DropdownMenuRadioItem value="fr">
                <Languages className="mr-2 h-4 w-4" /> {t("french")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="en">
                <Languages className="mr-2 h-4 w-4" /> {t("english")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={deconnecter}>
            <LogOut className="mr-2 h-4 w-4" />
            {t("logout")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

Run: `npm run build`

Expected: build réussi.

- [ ] **Step 3: Commit**

```bash
git add components/user-menu.tsx
git commit -m "feat: migrer UserMenu vers next-intl et ajouter le sélecteur de langue"
```

---

### Task 5: Vérification manuelle

**Files:** aucun fichier modifié — tâche de vérification uniquement.

**Interfaces:**
- Consumes: l'application complète issue des Tasks 1-4.
- Produces: rien.

- [ ] **Step 1: Lancer le serveur de développement**

Run: `npm run dev`

- [ ] **Step 2: Vérifier le comportement par défaut**

Se connecter à l'application (sans avoir jamais changé de langue au préalable — utiliser une fenêtre de navigation privée si besoin pour partir sans cookie). Ouvrir le menu utilisateur, vérifier que la section "Langue" affiche bien "Français" coché par défaut, et que tous les libellés du menu (Thème/Clair/Sombre/Système/Langue/Français/English/Se déconnecter) s'affichent normalement en français.

- [ ] **Step 3: Basculer vers l'anglais**

Sélectionner "English" dans le sélecteur de langue. Vérifier que le menu utilisateur (une fois rouvert) affiche ses libellés en anglais (Theme/Light/Dark/System/Language/Français/English/Log out).

- [ ] **Step 4: Vérifier la persistance**

Rafraîchir la page (F5). Rouvrir le menu utilisateur, vérifier que "English" est toujours sélectionné et que les libellés restent en anglais — confirme que le cookie `NEXT_LOCALE` persiste correctement.

- [ ] **Step 5: Revenir en français et vérifier le reste de l'app**

Rebasculer sur "Français". Naviguer sur `/bibliotheque` : vérifier que le reste de l'interface (sidebar, titre de page, fil d'Ariane, tableau de documents) est resté en français tout du long, y compris pendant que "English" était sélectionné à l'étape 3 — confirme que la migration partielle (UserMenu seul) se comporte comme prévu, sans effet de bord sur le reste de l'UI.

- [ ] **Step 6: Rapporter le résultat à l'utilisateur**

Décrire ce qui a été vérifié et demander confirmation visuelle explicite avant de considérer la tâche terminée.

---
