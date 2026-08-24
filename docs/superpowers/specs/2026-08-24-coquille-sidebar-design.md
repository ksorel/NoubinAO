# Coquille d'app — sidebar + menu utilisateur

Date : 2026-08-24
Statut : approuvé par l'utilisateur (structure validée visuellement, contenu confirmé en texte), en attente de relecture finale avant plan d'implémentation.

## Contexte

CLAUDE.md décrit une coquille d'interface complète pour le Module 1
(Fondations), inspirée de Supabase Studio : sidebar en icônes avec
info-bulles, palette de commandes Cmd+K, fil d'Ariane, menu utilisateur
groupé, sélecteur de langue FR/EN. `app/(app)/layout.tsx` actuel est minimal
(nav horizontale avec logo + `ThemeSwitcher` + `LogoutButton`), construit
pendant le Module 2 sans anticiper cette coquille.

Cette demande couvre en réalité 5 sous-systèmes largement indépendants
(sidebar+info-bulles, Cmd+K, fil d'Ariane, menu utilisateur, sélecteur de
langue). Décomposée en sous-projets distincts avec l'utilisateur avant de
commencer — ce spec ne couvre que le premier : **sidebar + menu
utilisateur**. Les quatre autres suivront chacun leur propre cycle
spec → plan → implémentation.

Recherche visuelle faite avec l'utilisateur (mockup dans le compagnon de
brainstorming) : structure reprise de Supabase Studio (rail d'icônes étroit
à gauche, info-bulle sombre au survol, barre du haut avec menu utilisateur
groupé à droite), mais avec la palette NoubinAO (bleu/ambre/slate) — pas
une reprise visuelle du thème sombre/vert de Supabase, seulement du
pattern structurel.

## Décisions validées avec l'utilisateur

1. **Un seul élément de navigation pour l'instant : "Bibliothèque".** Seule
   section réellement construite. Pas d'entrées désactivées/"Bientôt" pour
   les modules futurs — cohérent avec la règle déjà appliquée sur la page
   marketing (ne rien montrer comme disponible si ça ne l'est pas), mais
   appliquée ici en ne montrant simplement pas l'entrée du tout plutôt
   qu'en l'affichant désactivée.
2. **Avatar = initiales sur fond ambre**, dérivées de `utilisateur.nom`
   (pas d'upload/stockage d'image pour l'instant).
3. **Pas de boîte Cmd+K dans la barre du haut** — sous-projet séparé, pas
   construit ici, pour éviter un élément visuel non fonctionnel.
4. **Comportement mobile natif du composant shadcn Sidebar** : tiroir
   plein écran avec libellés visibles sur mobile, rail d'icônes replié par
   défaut sur desktop.

## Composants

### `lib/utilisateur/initiales.ts`

Fonction pure : `deriverInitiales(nom: string): string`. Prend les
premières lettres des deux premiers mots du nom (ex. "Sorel Koné" → "SK"),
majuscules. Cas d'un seul mot : les deux premières lettres de ce mot (ex.
"Sorel" → "SO"). Testée en TDD, dans l'esprit des modules
`lib/documents/*` déjà en place.

### `components/app-sidebar.tsx`

Sidebar shadcn (`collapsible="icon"`) : logo icône seule en haut, une
entrée de navigation "Bibliothèque" (icône + `Tooltip` affichant le
libellé au survol en mode replié, lien vers `/bibliotheque`).

### `components/user-menu.tsx`

Client Component. Props : `nomUtilisateur: string`, `nomEntreprise: string`.
Affiche un `DropdownMenu` déclenché par l'avatar (initiales via
`deriverInitiales`) + nom d'entreprise à côté. Contenu du menu déroulant :
item thème (réutilise la logique de `ThemeSwitcher` existant), item
déconnexion (réutilise `LogoutButton` existant).

### `app/(app)/layout.tsx` (réécrit)

- Élargit la requête Supabase existante (`.select("id")` →
  `.select("id, nom, entreprise:entreprise_id(nom)")`) pour récupérer en un
  seul appel le nom de l'utilisateur et celui de l'entreprise liée — pas de
  requête séparée.
- Structure : `SidebarProvider` → `AppSidebar` + `SidebarInset` (barre du
  haut avec `SidebarTrigger` — replie/déplie sur desktop, ouvre le tiroir
  sur mobile — et `UserMenu` à droite ; puis `{children}`).

## Style et thème

Couleurs via les tokens Tailwind existants (`app/globals.css`) — aucune
valeur codée en dur. Contraste WCAG AA à vérifier sur l'avatar (fond ambre
+ texte) par calcul, pas seulement visuellement, après l'épisode des
badges de statut.

## Hors périmètre

Palette de commandes Cmd+K, fil d'Ariane, sélecteur de langue FR/EN,
entrées de sidebar pour des modules non construits, upload d'avatar image.
