# Spike : validation de l'extraction de DAO

Script autonome de validation (pas d'UI, pas de base de données) — voir
`docs/superpowers/specs/2026-08-25-spike-extraction-dao-design.md` pour le
contexte complet et `docs/superpowers/plans/2026-08-25-spike-extraction-dao.md`
pour le détail des tâches.

## État actuel

L'exécution complète (`npm run dao-spike`) n'a pas pu être menée à terme :
le compte Anthropic associé à `ANTHROPIC_API_KEY` n'avait plus de crédit
au moment du développement (erreur HTTP 400 réelle des serveurs
Anthropic, pas un bug de code). Ce qui a été vérifié malgré tout :

- La normalisation (`normaliserDao`) fonctionne pour DAO 1 et DAO 2 — voir
  `fixtures/dao/out/dao-1-propre.md` et `dao-2-tableau-complexe.md`.
- Le repli OCR de DAO 3 se déclenche correctement sur la page 1 (texte
  insuffisant détecté), mais l'appel Claude qui devrait transcrire l'image
  échoue sur le même manque de crédit — `dao-3-scanne.md` n'a donc pas pu
  être produit.
- Aucune extraction JSON n'existe encore pour aucun DAO — `extraireExigences()`
  échoue systématiquement sur le même crédit insuffisant.

## Pour reprendre

1. Recharger le crédit du compte Anthropic associé à `ANTHROPIC_API_KEY`
   dans `.env.local`.
2. Lancer `npm run dao-spike` — le script traite les 3 fixtures et
   sauvegarde Markdown + JSON dans `fixtures/dao/out/`.
3. Faire la relecture manuelle qualitative décrite à l'étape 5 de
   `docs/superpowers/plans/2026-08-25-spike-extraction-dao.md` (comparer
   les pièces/critères/pondérations/délai extraits à ce qui a été
   délibérément placé dans chaque fixture).

## Point d'attention déjà identifié

Le tableau de pondération à cellules fusionnées de DAO 2 (voir
`fixtures/dao/generer_dao_1_et_2.py`, fonction `generer_dao_2`) est
aplati en lignes de texte simples dans le Markdown normalisé (pandoc
indisponible sur cette machine, repli heuristique utilisé) : le lien
visuel entre un critère et ses sous-critères est perdu. C'est
exactement le risque de conversion de tableau que CLAUDE.md signalait —
à surveiller en priorité lors de la relecture qualitative : est-ce que
Claude parvient malgré tout à rattacher correctement chaque sous-critère
à son critère parent à partir du texte aplati ?
