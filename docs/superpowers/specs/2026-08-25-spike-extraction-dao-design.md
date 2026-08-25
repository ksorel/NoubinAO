# Spike : validation de l'extraction de DAO

Date : 2026-08-25
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Premier sous-projet du Module 3 (Extraction de DAO), après le Module 1
(Fondations, terminé) et le Module 2 (Bibliothèque documentaire, en
production). CLAUDE.md décrit ce module comme "le pari technique le plus
risqué du produit : à tester tôt sur un échantillon réel de DAO ivoiriens
avant de construire l'UI complète autour."

Ce sous-projet est donc un **spike de validation**, pas une brique
d'infrastructure : il ne construit ni UI, ni schéma de base de données, ni
connexion à l'app Next.js. Un script autonome, rejouable, qui prend des
DAO de test, les normalise en Markdown, en extrait les exigences via
l'API Claude, et produit des résultats à juger manuellement avant de
décider de la suite.

## Décisions validées avec l'utilisateur

- **Sous-projet 1 = spike de validation**, pas le pipeline complet — pour
  apprendre tôt si l'approche est viable avant d'investir dans
  l'infrastructure (upload, stockage, modèle de données, UI).
- **Fixtures DAO générées synthétiquement** via le skill `pdf`, pas de
  vrais DAO disponibles pour l'instant. À rejouer sur de vrais DAO dès
  qu'ils seront disponibles.
- **Format PDF** (pas Word) pour les fixtures — représentatif des vrais
  DAO SIGMAP, et volontairement le chemin le plus incertain du pipeline
  documenté dans CLAUDE.md (`pdf-parse` ne renvoie pas de HTML structuré,
  contrairement à `mammoth` pour le Word).

## Fixtures DAO

Trois DAO PDF fictifs mais réalistes, suivant la structure nationale
ivoirienne déjà documentée dans CLAUDE.md (AAO, IS, DPAO, CCAG, CCAP,
offre technique, offre financière), générés via le skill `pdf` et
commités dans le dépôt (`fixtures/dao/`) pour pouvoir rejouer le test
plus tard :

- **DAO 1 — cas propre** : texte numérique bien structuré, secteur BTP,
  un tableau simple de critères d'évaluation avec pondération.
- **DAO 2 — tableau complexe** : grille de pondération multi-colonnes
  dans le DPAO, pour stresser la conversion Markdown des tableaux (point
  de risque explicitement signalé par CLAUDE.md).
- **DAO 3 — pièce scannée** : au moins une page simulant un scan (image
  plutôt que texte sélectionnable), pour exercer le repli OCR
  obligatoire.

## Pipeline de normalisation testé

Pour chaque DAO PDF :

1. **Extraction texte** via `pdf-parse`.
2. **Repli OCR** : si le texte extrait est vide ou anormalement court
   pour une page donnée, envoi de cette page en image directement à
   l'API Claude pour lecture native (pas `tesseract.js` — plus simple à
   mettre en œuvre pour ce spike, CLAUDE.md liste les deux options comme
   valables).
3. **Structuration en Markdown** — deux approches testées en parallèle
   sur les mêmes fixtures, pour comparer et retenir la meilleure (c'est
   une question que ce spike doit trancher, pas une décision prise à
   l'avance) :
   - (a) détection heuristique des titres de section connus
     (AAO/IS/DPAO/CCAG/CCAP/Offre technique/Offre financière) pour
     injecter des `##` dans le texte brut de `pdf-parse` ;
   - (b) `pandoc` en CLI directement sur le PDF.
4. **Découpage** du Markdown obtenu par `##`, pour isoler les sections
   pertinentes avant l'étape d'extraction.

## Extraction IA des exigences

- **Modèle** : Claude Haiku (le moins cher de la famille), conformément à
  la note de CLAUDE.md sur le développement sans frais excessifs. Montée
  en gamme de modèle repoussée à la mise en production.
- **Découpage par tâche** : la section DPAO/IS (où vivent généralement
  les critères d'évaluation et les pièces requises) est envoyée pour
  l'extraction "exigences" ; l'AAO pour le délai de dépôt et l'acheteur.
  Le CCAG (clauses standard, peu variables) n'est pas envoyé à Claude.
- **Sortie structurée demandée** :

  ```json
  {
    "pieces_requises": [{ "type": "string", "description": "string" }],
    "criteres_evaluation": [{ "critere": "string", "ponderation": number | null }],
    "sommaire_attendu": ["string"],
    "delai_depot": "string"
  }
  ```

- **Validation** : schéma Zod appliqué à la réponse de Claude avant de la
  considérer exploitable, conformément à la consigne de CLAUDE.md de
  valider tout contenu extrait de document avant usage.
- **Traçabilité minimale** : chaque élément extrait garde une référence
  au nom de la section Markdown d'origine (ex. `"source": "DPAO"`), pour
  respecter dès maintenant l'exigence de CLAUDE.md qu'aucune affirmation
  générée ne reste sans lien vers sa source — l'UI de relecture complète
  viendra dans un sous-projet ultérieur, mais la donnée de traçabilité
  est capturée dès ce spike.

## Sortie et critères de succès

Pour chaque fixture, le script sauvegarde dans un dossier de sortie
(`fixtures/dao/out/`) :

- le Markdown normalisé intermédiaire (pour inspection manuelle) ;
- le JSON extrait (validé par le schéma Zod).

Comme le contenu des fixtures est connu à l'avance (on l'a écrit), le
jugement de succès se fait par comparaison directe avec ce qui a été
délibérément placé dans chaque DAO :

- Les pièces/critères/pondérations/délai attendus sont-ils retrouvés,
  sans invention d'éléments absents du document ?
- Le tableau de pondération du DAO 2 est-il correctement rattaché aux
  bons critères ?
- Le contenu de la page "scannée" du DAO 3 remonte-t-il bien dans
  l'extraction finale ?

Pas de seuil chiffré strict pour ce spike — jugement qualitatif partagé
sur les 3 résultats à l'issue de l'exécution, débouchant sur une décision
explicite : (a) l'approche est assez solide pour construire l'infrastructure
dessus (sous-projets suivants du Module 3), ou (b) le pipeline doit être
ajusté (autre stratégie de chunking, prompt différent, etc.) avant de
continuer.

## Hors périmètre

- Upload UI, table `appel_offres`/`exigence_ao`, connexion à la
  bibliothèque documentaire, ou toute autre brique d'infrastructure de
  l'app Next.js.
- Formats bailleurs (Banque mondiale, BAD) — hors périmètre V1 du produit
  entier, pas seulement de ce spike.
- `tesseract.js` — non testé dans ce spike ; la lecture d'image native de
  Claude suffit pour valider l'approche OCR. À reconsidérer uniquement si
  le coût API devient un problème à l'échelle en production.
