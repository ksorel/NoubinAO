# Fil d'Ariane (breadcrumbs)

Date : 2026-08-24
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Troisième des cinq sous-projets identifiés lors de la décomposition du
Module 1 (Fondations), après sidebar + menu utilisateur (livré) et Cmd+K
(reporté — pas assez de destinations réelles pour justifier sa
construction maintenant). CLAUDE.md décrit un fil d'Ariane en haut de page
inspiré de Supabase Studio, avec un exemple à plusieurs niveaux ("Pipeline
> Appel d'offres XYZ > Dossier de réponse") qui suppose des routes
(pipeline, dossier de réponse) non encore construites.

Une seule vraie page existe aujourd'hui : `/bibliotheque`, sous
`app/(app)/layout.tsx` (qui contient déjà la sidebar et le menu
utilisateur, livrés au sous-projet précédent).

## Décision validée avec l'utilisateur

**Système dynamique dès maintenant**, pas une version statique figée. Mais
"dynamique" signifie ici : chaque page déclare elle-même son propre fil
d'Ariane, pas un système qui dérive les libellés depuis l'URL — cette
dernière approche ne fonctionnerait pas pour une future route comme
`/pipeline/[id]`, où le libellé attendu est le titre réel d'un AO (chargé
depuis la base), pas son identifiant technique dans l'URL. La déclaration
par page reste robuste à toute structure de route future sans qu'on ait
besoin de la deviner aujourd'hui.

## Composants

### `lib/breadcrumb-context.tsx`

- `BreadcrumbProvider` : composant client, contexte React tenant un tableau
  `{ label: string; href?: string }[]` en state.
- `useDefinirFilAriane(items: { label: string; href?: string }[])` : hook
  que chaque page appelle (via `useEffect`) pour annoncer sa position dans
  la hiérarchie. Réinitialise le tableau au démontage pour éviter qu'un fil
  d'Ariane obsolète persiste en changeant de page.

### `components/breadcrumb-trail.tsx`

Composant client, lit le contexte, affiche via les primitives shadcn
`Breadcrumb`/`BreadcrumbList`/`BreadcrumbItem`/`BreadcrumbLink`/
`BreadcrumbSeparator`/`BreadcrumbPage` (le dernier élément du tableau rendu
comme `BreadcrumbPage`, texte simple non cliquable ; les précédents comme
`BreadcrumbLink` si `href` est fourni).

### `app/(app)/layout.tsx` (modifié)

Enveloppe `SidebarInset` (ou son contenu) dans `BreadcrumbProvider`.
`<BreadcrumbTrail />` prend place dans le header existant, entre
`SidebarTrigger` et `UserMenu`.

### `app/(app)/bibliotheque/page.tsx` (modifié)

Page actuellement un Server Component — puisque le hook nécessite
`useEffect` (client uniquement), on ajoute un petit composant client
« sans rendu » (ex. `<AnnoncerFilAriane items={[{ label: "Bibliothèque" }]} />`)
rendu par la page, dont le seul rôle est d'appeler le hook en effet de
bord. Pattern courant et propre plutôt que de convertir toute la page en
composant client pour un seul appel de hook.

## Hors périmètre

- Toute dérivation automatique de libellé depuis un segment d'URL — chaque
  page déclare explicitement son libellé.
- Fil d'Ariane pour des routes non construites (pipeline, dossier de
  réponse) — le mécanisme est prêt à les accueillir, mais rien n'est câblé
  pour elles maintenant.
