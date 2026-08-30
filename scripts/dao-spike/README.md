# Spike : validation de l'extraction de DAO

Script autonome de validation (pas d'UI, pas de base de données) — voir
`docs/superpowers/specs/2026-08-25-spike-extraction-dao-design.md` pour le
contexte complet et `docs/superpowers/plans/2026-08-25-spike-extraction-dao.md`
pour le détail des tâches.

## Résultat : hypothèse validée

Le spike a été exécuté de bout en bout sur les 3 fixtures (`npm run dao-spike`)
et relu qualitativement contre le contenu réellement placé dans chaque DAO.
Résultat global :

- **Pièces requises** : exactes sur les 3 DAO, aucune invention.
- **Délai de dépôt** : exact sur les 3 DAO.
- **Critères d'évaluation** : exacts sur DAO 1 et DAO 3 (tableaux simples).
  Sur DAO 2 (tableau à cellules fusionnées), Claude a retrouvé les 7
  sous-critères individuellement avec les bonnes valeurs (et a même
  correctement appliqué le coefficient ×2 sur "Projets similaires" :
  15 × 2 = 30) — mais sans reconstituer le regroupement critère/sous-critère
  à 2 niveaux, perdu lors de l'aplatissement du tableau en Markdown
  (repli heuristique, pandoc indisponible). Aucune donnée n'est perdue,
  seule la hiérarchie disparaît — ce que le schéma actuel ne modélise de
  toute façon pas.
- **Repli OCR (DAO 3)** : fonctionne réellement. La page "scannée" (aucun
  texte sélectionnable) a été correctement transcrite par lecture d'image
  Claude — acheteur, secteur, délai, montant de la caution tous exacts.
- **Sommaire attendu** : un premier passage a révélé que `extraireExigences()`
  n'envoyait à Claude que les sections AAO et DPAO, jamais la section
  "SOMMAIRE ATTENDU DE L'OFFRE" — `sommaire_attendu` revenait donc vide sur
  les 3 DAO. Corrigé dans `extraire.ts` (la section sommaire est maintenant
  incluse) ; après correction, `sommaire_attendu` est exact sur les 3 DAO.

**Conclusion** : l'approche (normalisation → découpage par section → OCR de
repli → extraction Haiku) est assez fiable pour construire l'infrastructure
réelle du Module 3 (upload, stockage, tables `appel_offres`/`exigence_ao`,
UI) dessus.

## Point ouvert pour la suite

Décider si la hiérarchie critère/sous-critère (visible dans des grilles de
pondération réelles comme celle du DAO 2) mérite d'être modélisée dans le
schéma `exigence_ao` du Module 3, ou si le comportement actuel de Claude
(aplatir en critères indépendants, en appliquant les coefficients quand ils
sont explicites) est suffisant pour l'usage réel.

## Pour rejouer

```bash
npm run dao-spike
```

Traite les 3 fixtures de `fixtures/dao/`, sauvegarde Markdown + JSON dans
`fixtures/dao/out/`. Nécessite `ANTHROPIC_API_KEY` dans `.env.local` avec du
crédit disponible.
