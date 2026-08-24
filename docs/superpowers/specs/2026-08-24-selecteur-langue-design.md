# Sélecteur de langue FR/EN

Date : 2026-08-24
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Dernier des cinq sous-projets identifiés lors de la décomposition du
Module 1 (Fondations), après sidebar + menu utilisateur (livré), Cmd+K
(reporté — pas assez de destinations réelles) et fil d'Ariane (livré).
CLAUDE.md décrit une icône de traduction dans le menu utilisateur, à côté
du sélecteur de thème, avec le français comme langue par défaut, et une
implémentation via `next-intl`. CLAUDE.md précise aussi que le scope
réaliste pour le MVP est de construire l'architecture bilingue et le
sélecteur dès maintenant, sans viser une traduction anglaise parfaite
immédiatement.

`components/user-menu.tsx` contient déjà un menu déroulant (shadcn
`DropdownMenu`) avec un `DropdownMenuRadioGroup` pour le thème
(clair/sombre/système), suivant le pattern `next-themes` avec une garde
`mounted` pour éviter tout écart serveur/client à l'hydratation.

Toute l'interface existante (sidebar, page Bibliothèque, fil d'Ariane,
pages d'authentification, page marketing) est actuellement en français en
dur — chaînes littérales dans le JSX, aucun système d'i18n en place.

## Décisions validées avec l'utilisateur

**Étendue** : architecture + sélecteur seulement. Seul
`components/user-menu.tsx` est migré vers des clés de traduction dans ce
sous-projet, pour prouver le mécanisme. Le reste de l'UI reste en
français en dur, à migrer progressivement dans des tâches futures
séparées, hors périmètre ici.

**Routage** : pas de préfixe de langue dans l'URL. La langue est
mémorisée dans un cookie (`NEXT_LOCALE`), les routes existantes
(`/bibliotheque`, `/auth/login`, etc.) restent inchangées — mode "sans
routage i18n" de `next-intl`. Aucune restructuration de `app/` sous un
segment `[locale]`. Justifié par l'absence de besoin SEO multilingue par
URL pour une application derrière authentification.

**Défaut** : français, toujours, indépendamment de la langue du
navigateur — pas de détection automatique via `Accept-Language`.
Conforme à CLAUDE.md ("français comme langue par défaut — cohérent avec
le marché cible ivoirien").

## Conséquence explicite acceptée

Après cet incrément, la bascule vers l'anglais est **partielle** : le
menu utilisateur change de langue, mais le reste de l'application
(sidebar, page Bibliothèque, fil d'Ariane, pages d'authentification)
reste en français même si "English" est sélectionné. C'est un compromis
attendu du découpage en sous-projets, pas un oubli — documenté ici pour
ne pas surprendre lors d'une future revue.

## Composants

### `next.config.ts` (modifié)

Enveloppé par le plugin `createNextIntlPlugin` de `next-intl`, requis
pour que le bundler résolve `i18n/request.ts`.

### `i18n/request.ts`

Configuration serveur `next-intl` (fonction `getRequestConfig`) : lit la
locale via `getUserLocale()`, charge le fichier de messages
correspondant (`messages/fr.json` ou `messages/en.json`), les fournit au
provider.

### `i18n/locale.ts`

Deux fonctions :
- `getUserLocale(): Promise<"fr" | "en">` — lit le cookie `NEXT_LOCALE`
  via l'API `cookies()` de Next.js ; retourne `"fr"` si absent.
- `setUserLocale(locale: "fr" | "en"): Promise<void>` — server action,
  écrit le cookie `NEXT_LOCALE`, provoque un rafraîchissement pour que le
  Server Component racine relise la nouvelle langue.

### `messages/fr.json` et `messages/en.json`

Fichiers de traduction plats, un seul namespace `UserMenu` pour l'instant
(seul composant migré). Clés : `theme` (Thème), `light` (Clair), `dark`
(Sombre), `system` (Système), `language` (Langue), `french` (Français),
`english` (English), `logout` (Se déconnecter).

### `app/layout.tsx` (modifié)

Enveloppe l'app dans `NextIntlClientProvider`, alimenté par la config
`i18n/request.ts`.

### `components/user-menu.tsx` (modifié)

- Les libellés en dur ("Thème", "Clair", "Sombre", "Système",
  "Se déconnecter") sont remplacés par des appels à `useTranslations`
  (hook client `next-intl`) sur les clés du namespace `UserMenu`.
- Un second groupe est ajouté dans le menu déroulant, juste après le
  groupe "Thème" et avant le séparateur qui précède "Se déconnecter" :
  un `DropdownMenuLabel` (clé `language`) suivi d'un
  `DropdownMenuRadioGroup` avec deux `DropdownMenuRadioItem` ("Français"
  / "English"), une icône `Languages` (lucide-react) en tête de section
  — même pattern visuel que `Sun`/`Moon`/`Laptop` pour le thème.
- `onValueChange` du nouveau groupe appelle `setUserLocale(locale)`.
- Le nouveau groupe est placé sous la même garde `mounted` que la section
  thème — non pas pour une raison d'hydratation (contrairement au thème,
  `useLocale()` de `next-intl` est alimenté par le provider dès le rendu
  serveur via le cookie lu dans `i18n/request.ts`, donc sans écart
  serveur/client possible ici), mais simplement pour que les deux
  sections apparaissent ensemble d'un coup plutôt qu'en deux temps
  visuellement décalés.

## Tests

Pas de nouvelle logique pure nécessitant un test Vitest : `getUserLocale`
et `setUserLocale` sont de simples wrappers autour de l'API `cookies()`
de Next.js, sans logique métier à isoler.

Vérification manuelle uniquement : lancer le serveur de développement,
basculer la langue dans le menu utilisateur, confirmer que le menu passe
en anglais et que le choix persiste après un rafraîchissement de page.

## Hors périmètre

- Migration des autres composants existants (sidebar, page Bibliothèque,
  fil d'Ariane, pages d'authentification, page marketing) — français en
  dur conservé, à traiter dans des sous-projets futurs séparés.
- Traduction anglaise soignée au-delà des 8 clés de ce namespace.
- Détection de langue depuis le navigateur (`Accept-Language`).
- Préfixe de langue dans l'URL / restructuration de `app/` sous
  `[locale]`.
