# Extension de la migration FR/EN à la coquille d'app et au Module 2

Date : 2026-08-26
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Le sélecteur de langue FR/EN (Module 1, coquille d'app) a été livré avec un
périmètre volontairement restreint : seul `components/user-menu.tsx`
consomme `next-intl` (namespace `UserMenu`, 8 clés). Le reste de
l'interface reste en français en dur :

- `components/app-sidebar.tsx` — libellé et tooltip "Bibliothèque".
- `components/breadcrumb-trail.tsx` — pas de chaîne en dur (affiche des
  libellés dynamiques fournis par les pages), mais la chaîne "Bibliothèque"
  passée par `app/(app)/bibliotheque/page.tsx` à `AnnoncerFilAriane` en est
  la source.
- Module 2 (bibliothèque documentaire) : `app/(app)/bibliotheque/page.tsx`,
  `document-table.tsx`, `expiration-badge.tsx`,
  `ajouter-document-dialog.tsx`, `error.tsx` — environ 43 chaînes en dur au
  total (titre de page, onglets, en-têtes de tableau, recherche, états
  vides, dialogue de suppression, toast, badges d'expiration, formulaire
  d'ajout de document, message d'erreur).

L'architecture `next-intl` (cookie `NEXT_LOCALE`, `i18n/locale.ts`,
`i18n/actions.ts`, `i18n/request.ts`, plugin dans `next.config.ts`,
`NextIntlClientProvider` dans `app/(app)/layout.tsx`, `messages/fr.json` /
`en.json`) est déjà en place et fonctionnelle. Ce sous-projet ajoute de
nouveaux namespaces de traduction et migre les composants existants vers
des appels `useTranslations`/`getTranslations`, sans toucher à
l'architecture elle-même.

## Décisions validées avec l'utilisateur

**Étendue : sidebar + fil d'Ariane + Module 2 complet**, en un seul
sous-projet (pas de découpage en plusieurs specs). Les pages
d'authentification et la page marketing restent explicitement hors
périmètre.

## Architecture des namespaces de traduction

Deux nouveaux namespaces dans `messages/fr.json` / `messages/en.json`, en
plus de `UserMenu` déjà existant :

- **`Sidebar`** : le libellé "Bibliothèque" (réutilisé pour le label du
  menu et le tooltip).
- **`Bibliotheque`** : tout le reste, organisé en sous-groupes imbriqués
  plutôt qu'en clés à plat, pour rester lisible malgré le volume :
  - `page` — titre de page, libellé du fil d'Ariane.
  - `tabs` — Tous / Pièces administratives / Références projets / CV /
    Agréments.
  - `table` — en-têtes de colonnes, placeholder de recherche, états vides,
    dialogue de confirmation de suppression, message toast.
  - `badge` — Expire bientôt / À surveiller / Valide.
  - `dialog` — libellés et placeholders du formulaire d'ajout de document.
  - `error` — message d'erreur de chargement et bouton de réessai.

Les clés exactes sont finalisées dans le plan d'implémentation, pas dans
ce spec.

## Approche technique par type de composant

- **Composants déjà `"use client"`** (`document-table.tsx`,
  `ajouter-document-dialog.tsx`) : hook `useTranslations()`, même pattern
  que `UserMenu`.
- **Composants Server Component** (`app-sidebar.tsx`,
  `app/(app)/bibliotheque/page.tsx`, `error.tsx`) : `getTranslations()` de
  `next-intl/server` — l'équivalent serveur, pas encore utilisé dans le
  projet (`UserMenu` est le seul consommateur actuel de `next-intl` et il
  est côté client). Aucun composant ne change de nature (client ↔ serveur)
  pour cette migration.
- **`expiration-badge.tsx`** : décision de détail laissée à
  l'implémentation — consommer directement `useTranslations`/
  `getTranslations`, ou recevoir les libellés déjà traduits en props
  depuis `document-table.tsx` qui l'appelle. Pas structurant pour le
  reste du sous-projet.

## Tests et vérification

Aucune nouvelle logique métier à tester — uniquement de la substitution de
chaînes littérales par des appels de traduction. Pas de nouveau test
Vitest prévu, cohérent avec le sous-projet précédent (sélecteur de
langue).

Vérification manuelle : lancer le serveur de développement, basculer en
anglais dans le menu utilisateur, naviguer sur `/bibliotheque` et
confirmer que la sidebar, le fil d'Ariane et toute la page (onglets,
tableau, badges, dialogue d'ajout, état d'erreur si déclenchable)
s'affichent en anglais, puis repasser en français pour confirmer l'absence
de régression.

## Hors périmètre

- Pages d'authentification (login, sign-up, mot de passe oublié, etc.) et
  page marketing — restent en français en dur, migration éventuelle dans
  un futur sous-projet séparé.
- Traduction anglaise "parfaite" — cohérent avec la note de CLAUDE.md :
  le français prime, l'anglais peut être complété progressivement.
- Toute nouvelle fonctionnalité ou changement de comportement — ce
  sous-projet est une migration de chaînes, pas une évolution
  fonctionnelle.
