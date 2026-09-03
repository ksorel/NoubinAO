# NoubinAO

*Un produit K-Nowledge.*

Plateforme centrale de pilotage des réponses aux appels d'offres (AO), conçue pour les bureaux d'études, cabinets de conseil et entreprises de BTP, ingénierie, environnement et énergie-climat de Côte d'Ivoire qui manquent de personnel dédié. L'objectif n'est pas de rédiger "mieux" qu'un humain, mais de compenser le manque de capacité : permettre à une seule personne de sortir un dossier complet en quelques heures au lieu de plusieurs jours, et de suivre tous les AO en cours (documents + échanges email + statut) depuis un seul endroit.

**Note de cadrage stratégique (recadrage du 29/07/2026).** NoubinAO n'est volontairement pas positionné comme un outil généraliste pour "toutes les PME ivoiriennes", même si la technologie le permettrait. Le ciblage commercial est restreint aux secteurs BTP, ingénierie, environnement et énergie-climat — les pairs et clients naturels de K-Nowledge — pour deux raisons : éviter de diluer le positionnement de K-Nowledge comme cabinet d'ingénierie énergie-climat en la faisant percevoir comme une entreprise tech généraliste, et valoriser la connaissance réelle de K-Nowledge des dossiers AO dans ces secteurs, un avantage qu'un développeur générique n'a pas. Ce projet reste soumis aux garde-fous de temps du Directeur définis dans le plan stratégique de K-Nowledge : le développement d'NoubinAO ne doit pas dépasser l'enveloppe de temps allouée au bootstrap numérique (60 % du temps du Directeur maximum, décroissant), et son exécution technique doit être déléguée à un développeur recruté ou sous-traité dès que le revenu récurrent le permet.

**Sur le choix de rester sur les DAO nationaux en V1 (validé, ne pas remettre en cause sans raison technique).** Le choix documenté plus bas d'exclure les formats bailleurs (Banque mondiale, BAD) de la V1 est une bonne décision technique : le format national via ARCOP/SIGMAP est stable et bien documenté, contrairement aux formats bailleurs qui varient par institution. Cela signifie cependant qu'NoubinAO en V1 ne sert pas directement K-Nowledge pour ses propres réponses aux AO bailleurs, qui restent son canal commercial prioritaire selon le plan stratégique. La synergie "produit interne" ne se matérialise donc qu'à partir de la V2 (formats bailleurs) — c'est un jalon explicite à garder en tête pour la feuille de route, pas une raison de complexifier la V1.

## Vision produit

Le problème résolu est un problème de **capacité**, pas de qualité rédactionnelle. Les entreprises ciblées (5-20 personnes, BTP, ingénierie, environnement, énergie-climat, basées à Abidjan) ratent des AO ou bâclent leur dossier faute de temps pour : réunir les pièces administratives à jour, adapter les références de projets et les CV de l'équipe à chaque AO, respecter le sommaire imposé, suivre les échanges avec l'acheteur.

NoubinAO centralise trois choses qui aujourd'hui vivent dans des silos séparés (dossier papier, boîte mail, mémoire de quelqu'un) :

1. Une **bibliothèque documentaire vivante** de l'entreprise (pièces administratives, références, CV) avec alertes d'expiration.
2. Un **moteur d'extraction et d'assemblage** qui lit un DAO, en extrait les exigences, les mappe à la bibliothèque, et pré-assemble le dossier.
3. Un **fil de suivi par AO** qui centralise emails échangés (clarifications, addenda, notifications) et statut dans le pipeline.

Métrique de succès : temps entre le téléchargement du DAO et un dossier prêt à soumettre, et nombre d'AO traités en parallèle par l'entreprise.

## Périmètre marché (Côte d'Ivoire) — à connaître pour le modèle de données

- Régulateur : ARCOP (ex-ANRMP, depuis janvier 2025). Plateforme officielle de dématérialisation : SIGMAP.
- Structure type d'un DAO national : Avis d'Appel d'Offres (AAO), Instructions aux Soumissionnaires (IS), Données Particulières de l'Appel d'Offres (DPAO), Cahier des Clauses Administratives Générales (CCAG), Cahier des Clauses Administratives Particulières (CCAP), puis offre technique et offre financière.
- Pièces administratives récurrentes à suivre dans la bibliothèque : RCCM, Carte de Contribuable, Attestation de Régularité Fiscale, attestation CNPS, certificat de non-faillite, IDU (a remplacé la DFE).
- Délai minimum légal de dépôt : 30 jours calendaires pour un AO national — donc le produit n'est pas une course contre un compte à rebours très serré, mais un outil pour traiter plus d'AO en parallèle avec peu de personnel.
- **Hors périmètre V1** : formats bailleurs (Banque mondiale, BAD), plus complexes et destinés à des acteurs déjà mieux outillés. **V2 planifiée** une fois le format national maîtrisé et un premier socle de clients payants acquis — c'est à ce moment qu'NoubinAO devient aussi l'outil interne de K-Nowledge pour ses propres réponses aux AO bailleurs, bouclant la logique de dogfooding évoquée dans le plan stratégique.

## Stack technique (gratuit pour démarrer, serverless, sans Firebase)

| Besoin | Choix | Pourquoi |
|---|---|---|
| Frontend + API | Next.js (App Router, TypeScript) déployé sur **Vercel** (plan Hobby gratuit) | Fonctions serverless intégrées, déploiement gratuit, écosystème mature |
| Base de données + Auth + Storage fichiers | **Supabase** (plan Free) — Postgres managé | Alternative open-source à Firebase : Postgres réel, Auth intégrée, stockage de fichiers, Edge Functions, le tout sur un tier gratuit généreux |
| Recherche/matching dans la bibliothèque | **pgvector** (extension Postgres incluse dans Supabase) | Évite d'ajouter un service de vector store séparé ; suffisant pour matcher exigences ↔ documents |
| Extraction PDF/Word | `pdf-parse`, `mammoth` (npm, gratuits, open-source) | Suffisant pour extraire le texte brut d'un DAO avant analyse |
| Normalisation en Markdown | `mammoth` (DOCX→HTML) + `turndown` (HTML→MD) pour le Word ; `pdf-parse` + détection heuristique de titres connus pour le PDF | Représentation intermédiaire structurée (titres, tableaux) — voir section dédiée ci-dessous |
| OCR (documents scannés) | `tesseract.js` (npm, gratuit) en fallback, ou envoi direct des pages scannées à l'API Claude (lecture d'image native) | Une partie des pièces administratives ivoiriennes (attestations, RCCM) sont des scans, pas du PDF texte |
| Analyse et génération IA | **API Claude (Anthropic)** | Seul poste non gratuit à l'usage — voir note ci-dessous |
| Intégration email | **Gmail API** et **Microsoft Graph API** (OAuth) | Gratuites dans les limites d'usage normales, standard du marché |
| Tâches planifiées / rappels d'expiration | Supabase Edge Functions + `pg_cron`, ou **Upstash QStash** (tier gratuit) | Pas besoin d'un serveur dédié pour les jobs différés |
| Emails transactionnels (notifications produit) | **Resend** (tier gratuit ~100/jour) | Simple à intégrer avec Next.js |
| Paiement / abonnements | **CinetPay** (ou PayDunya en alternative) | Agrégateur couvrant Wave, Orange Money, MTN MoMo et cartes en Côte d'Ivoire, avec gestion native des paiements récurrents — pas besoin de construire soi-même la logique de prélèvement mensuel |
| Mode sombre / clair | **next-themes** (npm, gratuit) | Persistance du choix, respect de `prefers-color-scheme`, s'appuie sur les variables déjà définies dans `theme.css` |
| Internationalisation FR/EN | **next-intl** (npm, gratuit) | Intégration native à l'App Router, routage par locale, fichiers `fr.json`/`en.json` séparés |
| Composants d'interface avancés | `Sidebar`, `Tooltip`, `Command`, `Sonner` (shadcn/ui, déjà dans la stack) | Sidebar en icônes avec info-bulle, palette de commandes Cmd+K, notifications — voir section "Référence d'interface : Supabase Studio" |

**Note sur le coût IA** : l'API Claude n'est pas gratuite à l'usage, c'est la seule brique payante de cette liste. Pour développer sans frais au départ : utiliser le crédit d'essai offert à la création d'un compte Anthropic, tester avec le modèle le moins cher de la famille (Haiku) pendant le développement, et ne monter en gamme de modèle qu'au moment de la mise en production. Éviter d'appeler le modèle sur de gros documents bruts sans les avoir d'abord nettoyés/découpés, pour limiter la consommation de tokens.

**Alternative à Supabase** si on préfère rester 100% dans l'écosystème Vercel : **Neon** (Postgres serverless, tier gratuit, intégration native Vercel) + **Clerk** (Auth, tier gratuit) + **Vercel Blob** (stockage fichiers, tier gratuit limité). Supabase reste recommandé au départ car il regroupe DB + Auth + Storage en un seul service à configurer.

## Skills Claude à utiliser ou installer

Lors du développement de ce projet avec Claude Code, plusieurs skills Claude (marketplace `anthropic-skills`) sont directement utiles et doivent être mobilisés plutôt que réinventés :

- **pdf** — à utiliser pour générer des DAO de test réalistes (fixtures) servant à valider le moteur d'extraction avant de le brancher sur de vrais documents, et pour inspecter/lire les DAO réels fournis par les premiers clients pilotes. Utile aussi si l'export du dossier de réponse doit un jour produire un PDF fidèle plutôt qu'un export navigateur basique.
- **docx** — à utiliser pour construire l'export Word du dossier de réponse (module 4, "export Word/PDF"), et pour préparer des pièces types (CV, références projets) réutilisables comme fixtures de test de la bibliothèque documentaire.
- **xlsx** — utile pour préparer les tableaux de l'offre financière, souvent transmis en Excel dans les DAO ivoiriens, et pour tester l'import/export de données tabulaires si un module de reporting est ajouté plus tard.
- **skill-creator** — à utiliser tôt pour créer un skill dédié, par exemple `dao-ivoirien`, encapsulant la connaissance du format national déjà documentée dans ce fichier (structure AAO/IS/DPAO/CCAG/CCAP, pièces administratives RCCM/CNPS/DFE, régulateur ARCOP/SIGMAP). Cela rend cette expertise réutilisable et versionnable indépendamment du code applicatif, mobilisable par toute session Claude Code travaillant sur ce projet ou sur d'autres missions K-Nowledge liées aux AO — y compris la V2 bailleurs le moment venu.

Aucun skill n'est nécessaire pour la stack applicative elle-même (Next.js, Supabase, Tailwind, shadcn/ui) — ce sont des choix d'implémentation, pas des tâches de génération ou de lecture de documents.

## Normalisation des documents en Markdown (avant tout traitement IA)

Tout document entrant (DAO uploadé, pièce administrative de la bibliothèque) doit être converti en Markdown avant d'être transmis à l'API Claude, plutôt que d'envoyer du texte brut non structuré. Ce n'est pas le format du fichier source qui coûte des tokens (`pdf-parse`/`mammoth` extraient déjà du texte, pas des binaires) — c'est l'absence de structure qui oblige à renvoyer des documents entiers pour que le modèle retrouve lui-même les sections. Le Markdown règle ce problème et permet un découpage par section fiable.

- **Pipeline** : fichier source → extraction (`mammoth` pour DOCX, `pdf-parse` pour PDF texte) → conversion en Markdown (`turndown` depuis le HTML de `mammoth` pour le DOCX ; détection heuristique des titres de sections connus pour le PDF, `pandoc` écarté — indisponible sur les fonctions serverless Vercel en production, validé au sous-projet 2 du module 3) → stockage du Markdown normalisé à côté du fichier source.
- **Fallback OCR obligatoire** : une partie des pièces administratives ivoiriennes (attestations, RCCM) sont des scans image, pas du PDF texte — `pdf-parse` n'en extrait rien. Prévoir `tesseract.js` ou l'envoi direct des pages scannées à l'API Claude (lecture d'image native) en repli automatique quand l'extraction texte renvoie un résultat vide ou trop court.
- **Point de risque à valider tôt** : les tableaux (offre financière, grille de pondération DPAO) se convertissent mal depuis un PDF scanné ou mal structuré. À tester sur un échantillon réel de DAO ivoiriens dès le module 3, pas supposé fonctionner par défaut.
- **Bénéfice pour le découpage (chunking)** : une fois en Markdown, découper par titre (`##`) pour n'envoyer à Claude que les sections pertinentes selon la tâche (ex. la section "critères d'évaluation" pour extraire la pondération, pas tout le CCAP) plutôt que le document complet à chaque appel — c'est ce découpage, plus que le format, qui réduit réellement la consommation de tokens.
- **Traçabilité** : conserver le Markdown normalisé permet aussi de diagnostiquer un problème d'extraction (relire ce que le modèle a effectivement reçu) sans reparser le fichier source à chaque debug.

## Modèle économique et paiement

- **Modèle retenu : SaaS par abonnement**, pas de licence perpétuelle. Raison principale : le produit a un coût variable récurrent (appels API Claude, hébergement) proportionnel à l'usage — une licence à paiement unique et usage illimité désaligne le revenu du coût réel et érode la marge à mesure que le client utilise l'outil.
- **Deux modes de facturation possibles sur un même modèle d'abonnement**, pour s'adapter aux habitudes d'achat locales (encore marquées par le réflexe licence + devis) sans renoncer au revenu récurrent :
  - Prélèvement mensuel en libre-service via CinetPay (Wave, Orange Money, MTN MoMo, carte).
  - Facture annuelle payée par virement, pour les entreprises qui préfèrent une démarche d'achat classique avec devis — avec une remise d'environ 15 % par rapport au mensuel, comme la plupart des SaaS par abonnement.
- **Licence perpétuelle** : non retenue en V1. À reconsidérer uniquement plus tard pour de grands comptes (grosses entreprises de BTP, intégrateurs) avec budget d'investissement plutôt que budget de fonctionnement — un segment différent de la cible principale (bureaux d'études et entreprises BTP/ingénierie/environnement/énergie sous-staffés).

### Structure des paliers, inspirée du modèle d'abonnement de Claude

Claude (Anthropic) structure ses abonnements ainsi : un palier gratuit très limité pour essayer, un palier payant de base avec un quota d'usage inclus, des paliers supérieurs qui sont des **multiples de ce quota** plutôt que des paliers à fonctionnalités différentes (Max 5x, Max 20x), et un palier Équipe facturé par utilisateur. Le principe sous-jacent : le prix suit le coût variable réel, qui pour Claude comme pour NoubinAO est directement lié au volume d'appels à l'API Claude.

NoubinAO reprend cette logique, avec le **nombre d'AO traités par mois** comme unité de mesure (c'est ce qui consomme réellement de l'API, pas le nombre de documents dans la bibliothèque ni le nombre d'utilisateurs). Les prix ci-dessous sont une **hypothèse de travail à valider avec de vrais prospects avant le lancement commercial**, pas des tarifs définitifs :

| Palier | Quota | Prix indicatif (mensuel) | Utilisateurs inclus | Logique |
|---|---|---|---|---|
| **Découverte** (gratuit) | 1 AO traité / mois | 0 FCFA | 1 | Essayer le moteur d'extraction sans risque, avant d'acheter — équivalent du Free de Claude |
| **Starter** | 5 AO / mois | ≈ 25 000 FCFA | 1 | Palier de base, prix aligné sur le coût réel + marge |
| **Croissance** | 25 AO / mois (5×) | ≈ 110 000 FCFA (≈ 4,4×) | 3 | Équivalent Max 5x : le prix croît moins vite que le quota, léger rabais volume |
| **Cabinet** | 60 AO / mois (12×) | ≈ 180 000 FCFA (≈ 7,2×) | Illimités | Équivalent Max 20x : meilleur rapport prix/usage, pensé pour les cabinets qui traitent beaucoup d'AO en parallèle |

- **Pas d'illimité réel, même sur le palier le plus haut** — contrairement à une appellation "illimité" qui exposerait la marge à un usage imprévisible, chaque palier a un plafond. Au-delà du quota, proposer un **dépassement facturé à l'AO supplémentaire** (ex. 4 000-5 000 FCFA/AO, hypothèse à valider) plutôt qu'un blocage brutal en milieu de mois, pour ne pas perdre le client au pire moment.
- **Garde-fou anti-abus sur le palier gratuit** : puisque chaque AO traité coûte réellement en appels API, limiter un palier Découverte par entreprise (vérification par RCCM ou domaine email professionnel), pour éviter qu'un même prospect ouvre plusieurs comptes gratuits.
- Prévoir dès le modèle de données un objet `abonnement` (plan, quota mensuel, compteur d'AO traités dans le mois en cours, statut, date de renouvellement, mode de facturation) lié à `entreprise`, pour ne pas avoir à le rajouter après coup une fois la logique de pipeline en place.

## Modules fonctionnels et ordre de construction recommandé

1. **Fondations** — auth, structure projet, modèle de données de base (Entreprise, Utilisateur), et coquille d'interface (sidebar en icônes avec info-bulles, mode sombre/clair, sélecteur de langue FR/EN) — voir "Design UI/UX professionnel". Cette coquille enveloppe tous les écrans construits ensuite, autant la poser correctement dès le départ plutôt que de la retrofiter plus tard.
2. **Bibliothèque documentaire** — upload et catégorisation des pièces administratives, références projets, CV équipe ; alertes d'expiration. C'est la brique qui apporte de la valeur même sans IA — à construire et valider en premier.
3. **Extraction de DAO** — upload d'un DAO, normalisation en Markdown (voir section dédiée), puis extraction automatique des exigences (pièces demandées, critères d'évaluation, sommaire, délai) à partir du Markdown découpé par section plutôt que du document entier. C'est le pari technique le plus risqué du produit : à tester tôt sur un échantillon réel de DAO ivoiriens avant de construire l'UI complète autour.
4. **Mapping et assemblage** — croisement des exigences extraites avec la bibliothèque, pré-remplissage du dossier, rédaction assistée des sections variables, export Word/PDF. Chaque contenu généré doit rester traçable à sa source (document ou référence d'origine).
5. **Pipeline / tableau de bord** — vue de tous les AO en cours avec statut (identifié, en préparation, soumis, en attente, gagné/perdu), échéances, responsable assigné.
6. **Intégration email** — connexion OAuth Gmail/Outlook, rattachement automatique des échanges à l'AO concerné (par règles simples au départ : objet, expéditeur, mots-clés — ne passer à une classification IA que si le rattachement par règles s'avère insuffisant).

## Modèle de données (entités principales)

- `entreprise` — profil, informations légales
- `abonnement` — lié à `entreprise` : plan (découverte / starter / croissance / cabinet), quota mensuel d'AO, compteur d'AO traités dans le mois en cours, statut, date de renouvellement, mode de facturation
- `utilisateur` — membre de l'équipe, rôle
- `document` — fichier, type (pièce administrative / référence projet / CV / agrément), date d'expiration, statut de validité, **contenu_markdown** (version normalisée, alimente la recherche pgvector et l'extraction IA), **source_ocr** (booléen — extraction texte directe ou passage par OCR)
- `appel_offres` — titre, acheteur, secteur, date limite, montant de caution, statut pipeline, fichier DAO source, **dao_markdown** (version normalisée découpée par section)
- `exigence_ao` — extraite du DAO : type de pièce requise, critère d'évaluation, pondération
- `email` — lié à un `appel_offres`, expéditeur, destinataire, date, contenu, pièces jointes
- `dossier_reponse` — sections générées, statut de relecture, export final

## Identité visuelle

- **Logo** : `logo-icon.svg` (icône seule, pour favicon/app icon) et `logo-full.svg` (icône + wordmark, pour l'en-tête et les documents exportés). Icône = aiguille de boussole (bleu primaire + pointe ambre) dans un carré arrondi, symbolisant le pilotage/la direction. Wordmark "Noubin" en régulier slate-900 + "AO" en gras bleu primaire (le "AO" reste systématiquement mis en évidence, pour rappeler "Appel d'Offres" au premier coup d'œil malgré le nom propre), avec la mention secondaire "K-Nowledge" en petit texte sous le wordmark dans `logo-full.svg` — pour rattacher le produit à la marque mère sans fusionner les deux identités visuelles (NoubinAO garde sa propre identité de confiance pour les clients, K-Nowledge reste identifiable pour ses propres relations bailleurs).
- **Thème de couleurs** : `theme.css` contient les variables shadcn/ui (mode clair et sombre) basées sur les palettes Tailwind blue (primaire), amber (accent) et slate (neutre), plus les couleurs sémantiques du pipeline AO (identifié/en préparation/soumis/gagné/perdu). À copier dans `app/globals.css` au moment du scaffold Next.js. Palette volontairement distincte de celle de K-Nowledge (navy/or) — un produit SaaS grand public a besoin de sa propre identité de confiance, le lien avec K-Nowledge se fait par la mention textuelle, pas par la couleur.
- Primaire : bleu `#1D4ED8` (confiance, sérieux — cohérent avec un produit qui gère des documents administratifs). Accent : ambre `#F59E0B` (échéances, actions prioritaires, boutons d'action).

## Design UI/UX professionnel

- **Système de design** : Tailwind CSS + shadcn/ui (composants accessibles basés sur Radix UI), gratuits et open-source. Couleurs et typographie définies une seule fois dans la config Tailwind — jamais de valeurs codées en dur dans les composants. Icônes : Lucide (déjà cohérent avec shadcn/ui).
- **Mobile-first impératif** : en Côte d'Ivoire, 98% des accès internet se font depuis un mobile. Chaque écran doit être conçu et testé d'abord en format mobile ; le desktop est l'adaptation, pas l'inverse.
- **Performance sur connexion limitée** : images optimisées (WebP, lazy loading), bundles JS légers, React Server Components par défaut plutôt que tout charger côté client.
- **Concevoir tous les états d'un écran, pas seulement le cas nominal** : chargement, vide (aucun AO/document), erreur, succès — particulièrement important pour l'extraction de DAO, qui prend quelques secondes de traitement.
- **Accessibilité** : contrastes conformes WCAG AA, navigation clavier complète, labels ARIA sur les formulaires. shadcn/ui couvre une bonne partie nativement, à vérifier quand même.
- **Langue et formats locaux** : interface bilingue français/anglais avec **français par défaut** (voir sous-section dédiée ci-dessous), montants en XOF, dates au format jour/mois/année.
- **Prototyper avant de coder** les écrans clés (tableau de bord pipeline, upload de DAO, vue d'un dossier) : maquette Figma (gratuit) ou maquette HTML/Tailwind à valider avec l'utilisateur avant de brancher la logique derrière.

### Référence d'interface : Supabase Studio

L'interface d'administration de Supabase (le tableau de bord que les développeurs utilisent pour gérer leurs projets) sert de référence esthétique et fonctionnelle pour NoubinAO. Éléments à reprendre concrètement :

- **Barre latérale de navigation en icônes, avec libellé au survol.** Sidebar étroite par défaut (icônes seules), qui affiche le nom de la section en infobulle (tooltip) au survol plutôt que d'occuper de l'espace en permanence — optionnellement extensible en mode "large" avec libellés visibles. À construire avec le composant `Sidebar` de shadcn/ui (mode `collapsible="icon"`) combiné au composant `Tooltip`.
- **Palette de commandes (Cmd/Ctrl+K).** Une fenêtre de recherche rapide accessible au clavier depuis n'importe quel écran, pour naviguer entre les AO, la bibliothèque et les réglages sans passer par la souris — composant `Command` de shadcn/ui (basé sur `cmdk`). Utile pour les utilisateurs qui traitent plusieurs AO en parallèle.
- **Fil d'Ariane (breadcrumbs) en haut de page**, indiquant où on se trouve dans la hiérarchie (ex. Pipeline > Appel d'offres XYZ > Dossier de réponse).
- **Notifications légères (toasts)** en bas à droite pour confirmer une action (document ajouté, extraction terminée, dossier exporté) sans bloquer l'écran — composant `Sonner` de shadcn/ui.
- **Menu utilisateur regroupé en haut à droite** : avatar, nom de l'entreprise, et à côté, groupés ensemble, le sélecteur de thème et le sélecteur de langue (voir points suivants) — exactement comme Supabase regroupe thème et compte au même endroit.
- **Densité d'information soignée** : tableaux avec en-têtes collants (sticky header), lignes compactes mais lisibles, bordures discrètes plutôt que des séparateurs lourds — cohérent avec un produit qui manipule des listes de documents et d'AO.

### Mode sombre / mode clair

- Bascule thème clair/sombre accessible en permanence (icône soleil/lune dans le menu utilisateur, voir ci-dessus). Implémentation avec `next-themes` (léger, standard avec Next.js + shadcn/ui, gère la persistance du choix et évite le flash de mauvais thème au chargement).
- **`theme.css` contient déjà les deux jeux de variables** (`:root` pour le clair, `.dark` pour le sombre) — il n'y a pas de palette à concevoir, seulement `next-themes` à brancher et la classe `.dark` à faire basculer sur `<html>`.
- Respecter la préférence système (`prefers-color-scheme`) au premier chargement, puis mémoriser le choix explicite de l'utilisateur s'il en fait un.

### Sélecteur de langue (Français / Anglais)

- Icône de traduction dans le menu utilisateur (à côté du sélecteur de thème), avec **français comme langue par défaut** — cohérent avec le marché cible ivoirien.
- Implémentation recommandée : `next-intl` (bien intégré à l'App Router de Next.js, gère le routage par locale et les fichiers de traduction séparés `fr.json` / `en.json`).
- **Scope réaliste pour le MVP** : construire l'architecture bilingue et le sélecteur dès le départ (plus coûteux à ajouter après coup qu'à prévoir dès la structure des composants), mais ne pas viser une traduction anglaise parfaite immédiatement — le français doit être complet et soigné en priorité, l'anglais peut être complété progressivement sans bloquer le lancement, puisque le marché prioritaire reste francophone.

## Développement professionnel

- **Qualité de code** : ESLint + Prettier dès le départ, TypeScript en mode strict, pas de merge avec un lint qui échoue.
- **Tests** : Vitest pour les tests unitaires, en priorité sur le moteur d'extraction/mapping et la validation Zod — ce sont les parties les plus critiques à ne pas casser silencieusement. Playwright pour quelques parcours end-to-end clés (upload DAO → dossier généré). Pas besoin de viser 100% de couverture dès le départ.
- **Intégration continue** : GitHub Actions (gratuit) pour lancer lint + tests à chaque pull request ; déploiement automatique via Vercel à chaque merge sur `main`.
- **Suivi des erreurs en production** : Sentry (tier gratuit), pour être alerté si l'extraction ou la génération échoue silencieusement — critique pour un produit qui manipule des documents à valeur légale.
- **Conventions Git** : commits conventionnels (`feat:`, `fix:`, `refactor:`...), une branche par fonctionnalité, se relire à froid avant de merger même en solo.
- **Documentation minimale mais réelle** : README à jour avec les étapes pour lancer le projet en local, commentaires sur toute logique d'extraction/mapping non évidente.
- **Sécurité** : valider toute entrée utilisateur et tout contenu extrait de document avant usage (Zod), ne jamais exposer `SUPABASE_SERVICE_ROLE_KEY` côté client, limiter le débit des appels à l'API Claude pour éviter une facture surprise.
- Next.js App Router, Server Actions pour les mutations plutôt que des routes API séparées quand possible.
- Variables sensibles dans `.env.local`, jamais commitées.
- Toute génération de contenu par IA doit conserver une référence à sa source (document, champ) pour permettre la traçabilité en relecture.

## Variables d'environnement prévues

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

## À ne pas faire

- Ne pas construire le module email avant que la bibliothèque documentaire et l'extraction de DAO soient validées sur des cas réels — c'est la partie la plus complexe côté intégration (OAuth, quotas API) et la moins urgente pour prouver la valeur du produit.
- Ne pas viser les formats bailleurs (Banque mondiale, BAD) en V1.
- Ne pas laisser le modèle générer une affirmation (certification, chiffre, référence) sans la relier à un document source vérifiable dans la bibliothèque.
- Ne pas élargir le ciblage commercial au-delà des secteurs BTP, ingénierie, environnement et énergie-climat sans validation explicite du Directeur — l'élargissement à "toutes les PME" est la dérive de positionnement identifiée comme risque dans le plan stratégique de K-Nowledge.
- Ne pas laisser le Directeur dépasser le plafond de temps fixé pour ce projet ; au premier signe de dépassement, prioriser le recrutement ou la sous-traitance de l'exécution technique plutôt que d'ajouter des fonctionnalités.
- Ne pas transformer la normalisation Markdown en projet à part entière : c'est une étape du module 3 (extraction de DAO), pas un nouveau module. Rester sur `mammoth`/`turndown` (DOCX) et l'heuristique de détection de titres (PDF), avec l'OCR en fallback ; ne pas construire de parseur maison tant que les outils existants n'ont pas été testés et jugés insuffisants sur un échantillon réel. `pandoc` a été essayé puis écarté (indisponible en production Vercel) — ne pas le réintroduire sans changer d'hypothèse d'hébergement.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
