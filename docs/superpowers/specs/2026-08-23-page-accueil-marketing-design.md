# Page d'accueil marketing

Date : 2026-08-23
Statut : approuvé par l'utilisateur (structure de hero validée visuellement, contenu section par section validé en texte), en attente de relecture finale avant plan d'implémentation.

## Contexte

`app/page.tsx` est toujours la page générique du starter Next.js/Supabase
(logos Next.js/Supabase, sections "Next steps" pour développeurs). NoubinAO
n'a jamais eu de vraie page d'accueil marketing. Ce spec couvre uniquement
cette page (`/`) — pas un site marketing complet avec plusieurs pages, pas
de blog, pas de pages légales (elles n'existent pas encore, donc pas de
liens vers elles).

Recherche concurrentielle faite sur deux sites français nommés "AOpilot"
(aopilot.fr, aopilot.vercel.app — concurrents distincts, sans lien avec
NoubinAO) pour s'inspirer de la structure et du ton, sans copier leur texte
ni leurs visuels. Constat notable : au moins deux acteurs distincts
utilisent déjà "AOpilot" comme nom sur le marché français, ce qui confirme
que le renommage en NoubinAO était le bon choix.

## Décisions validées avec l'utilisateur

1. **Branche séparée** : nouveau worktree/branche dédié depuis `main`,
   indépendant de la branche du module 2 (bibliothèque documentaire, pas
   encore fusionnée).
2. **Pas de chiffres inventés** : la section "constat" reste qualitative.
   CLAUDE.md interdit d'afficher une affirmation/chiffre sans source
   vérifiable — sans données réelles de terrain, on formule le problème en
   mots plutôt qu'en statistique précise.
3. **CTA principal → `/auth/sign-up`** (inscription réelle, déjà
   fonctionnelle). **Dépendance externe à noter** : les variables
   d'environnement Supabase ne sont pas configurées sur le projet Vercel
   (constaté dans une session précédente) — l'inscription en production
   échouera tant que ce n'est pas corrigé. Hors scope de ce spec (c'est une
   tâche d'infra Vercel, pas un changement de code), mais bloquant avant de
   rendre cette page publique.
4. **Pas de prix affichés** : CLAUDE.md qualifie les montants FCFA des
   paliers d'"hypothèse de travail à valider avec de vrais prospects avant
   le lancement commercial". La section tarifs explique la logique
   (paiement à l'usage réel, palier gratuit pour essayer) sans montants
   figés.
5. **Vision produit complète, étiquetée honnêtement** : les 3 piliers du
   produit (bibliothèque documentaire, extraction de DAO, suivi par AO)
   sont présentés avec un badge "Disponible" ou "Bientôt" selon l'état réel
   — rien n'est présenté comme fonctionnel s'il ne l'est pas.
6. **Structure de hero validée visuellement (option A)** : texte centré,
   sobre, sans image ni capture d'écran produit — cohérent avec un
   positionnement "cabinet sérieux" plutôt que "startup tech".

## Structure de la page (ordre validé)

1. Nav : logo + `AuthButton` (existant, texte à localiser en français)
2. Hero (texte centré)
3. Le constat (3 points qualitatifs)
4. Comment ça marche (3 étapes)
5. Modules (avec badges Disponible/Bientôt)
6. Tarifs (logique seulement, pas de montants)
7. CTA final
8. Footer (mention K-Nowledge + sélecteur de thème, pas de liens légaux
   pour l'instant — ces pages n'existent pas)

## Contenu exact

### Hero

- Titre : "Une seule personne. Plusieurs appels d'offres en parallèle."
- Sous-titre : "NoubinAO centralise vos pièces administratives, vos
  références et le suivi de vos AO — pour sortir un dossier complet sans y
  consacrer plusieurs jours à chaque fois."
- CTA : "Essai gratuit" (lien vers `/auth/sign-up`), sous-texte "Sans carte
  bancaire"

### Le constat

Label : "Le constat". Trois points :
- "Vos pièces à jour sont dispersées entre dossier papier et boîte mail"
- "Le sommaire imposé se refait à chaque appel d'offres"
- "Faute de temps, certains AO sont ratés ou bâclés"

### Comment ça marche

Label : "Comment ça marche". Trois étapes numérotées :
1. "Une bibliothèque toujours à jour" — pièces administratives, références,
   CV, avec alertes d'expiration
2. "Un DAO analysé, un dossier pré-assemblé" — lecture du DAO, extraction
   des exigences, mapping à la bibliothèque
3. "Tous vos AO suivis au même endroit" — statut, échéances, échanges email
   centralisés

### Modules

Label : "Modules". Liste de 3 lignes, chacune avec un badge d'état :
- "Bibliothèque documentaire" — badge vert "Disponible"
- "Extraction de DAO" — badge neutre "Bientôt"
- "Suivi par AO (emails, pipeline)" — badge neutre "Bientôt"

### Tarifs

Label : "Tarifs". Texte : "Le prix suit l'usage réel : le nombre d'AO
traités par mois, pas le nombre d'utilisateurs ni de documents stockés. Un
palier Découverte gratuit pour essayer." Pas de tableau de montants.

### CTA final

Fond bleu primaire. Titre : "Prêt à traiter plus d'AO avec la même
équipe ?" Bouton ambre : "Essai gratuit" (même lien que le hero).

### Footer

"NoubinAO — un produit K-Nowledge" + `ThemeSwitcher` (existant). Pas de
liens "Mentions légales"/"Confidentialité" — pages inexistantes, pas de
lien mort.

## Structure de fichiers

- Réécriture complète de `app/page.tsx` (nav + assemblage des sections).
- Nouveaux composants, un par section, dans `components/marketing/` :
  `hero.tsx`, `constat.tsx`, `comment-ca-marche.tsx`, `modules.tsx`,
  `tarifs.tsx`, `cta-final.tsx`, `site-footer.tsx`.
- `components/auth-button.tsx` : localisation du texte en français
  ("Se connecter" / "S'inscrire" / "Bonjour, {email}" au lieu de
  "Sign in" / "Sign up" / "Hey, {email}!").

### Suppressions (vérifié : aucune autre référence dans le repo)

- `components/hero.tsx` (ancien hero Next.js/Supabase)
- `components/next-logo.tsx`
- `components/supabase-logo.tsx`
- `components/deploy-button.tsx`
- `components/env-var-warning.tsx`
- `components/tutorial/` (dossier complet : `connect-supabase-steps.tsx`,
  `sign-up-user-steps.tsx`, `tutorial-step.tsx`, `code-block.tsx`,
  `fetch-data-steps.tsx` — ce dernier déjà supprimé au module 2)

## Style et thème

Couleurs et espacements via les tokens Tailwind déjà définis dans
`app/globals.css` (bleu primaire `#1D4ED8`, ambre accent `#F59E0B`, slate
neutre) — aucune valeur codée en dur. Mobile-first (98% des accès internet
en Côte d'Ivoire se font depuis un mobile, par CLAUDE.md). Dark mode déjà
géré par les variables CSS existantes, pas de travail supplémentaire
nécessaire au-delà de vérifier le contraste sur chaque section.

## Hors périmètre

- Pages légales (mentions légales, confidentialité, CGU) — n'existent pas,
  pas créées ici.
- Sélecteur de langue FR/EN — reste du Module 1, pas construit.
- Tout contenu chiffré (statistiques, témoignages clients) — pas de données
  vérifiables disponibles.
- Correction des variables d'environnement Vercel — tâche d'infra séparée,
  bloquante pour la mise en ligne publique mais pas pour ce spec.
