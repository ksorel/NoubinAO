# Tableau de bord pipeline (Module 5, sous-projet 1)

Date : 2026-09-01
Statut : approuvé par l'utilisateur, prêt pour le plan d'implémentation.

## Contexte

Premier sous-projet du Module 5 (Pipeline / tableau de bord), après la
complétion du Module 3 (Extraction de DAO — modèle de données, pipeline de
normalisation, upload+orchestration, liste de suivi technique,
revue/édition des exigences). CLAUDE.md décrit ce module ainsi : "vue de
tous les AO en cours avec statut (identifié, en préparation, soumis, en
attente, gagné/perdu), échéances, responsable assigné."

La table `appel_offres` a déjà une colonne `statut_pipeline` (enum
`statut_pipeline_ao` : `identifie`/`en_preparation`/`soumis`/
`en_attente`/`gagne`/`perdu`, défaut `identifie`), délibérément laissée de
côté par le Module 3 à plusieurs reprises, avec la mention explicite
"reste dans le périmètre du Module 5". Ce sous-projet l'exploite enfin.

## Décisions validées avec l'utilisateur

- **Assignation de responsable reportée.** La table `utilisateur` n'a
  actuellement qu'un seul rôle (`admin`, contrainte `check (role in
  ('admin'))`) et aucun flux d'invitation d'équipier n'existe. Assigner un
  AO à un "responsable" n'a pas de sens fonctionnel réel tant qu'une seule
  personne par entreprise utilise le produit. Reporté à un futur module de
  gestion d'équipe.
- **Liste filtrable par onglets, pas de kanban.** Un tableau kanban à
  glisser-déposer serait visuellement plus proche d'un outil pipeline
  classique, mais introduirait une bibliothèque de drag-and-drop hors
  stack et une expérience tactile notoirement pénible — à contre-courant
  du principe mobile-first de CLAUDE.md (98% des accès depuis un mobile en
  Côte d'Ivoire). Le pattern retenu (Tabs de filtrage + Select en ligne
  pour changer le statut) reprend directement celui déjà utilisé pour le
  filtrage par type de document en bibliothèque.
- **Nouvelle page dédiée `/pipeline`**, pas d'extension de `/appels-offres`
  existant. Cohérent avec la séparation délibérée et répétée pendant le
  Module 3 entre suivi technique (`statut_traitement`, "où en est le
  traitement de ce dossier") et pipeline métier (`statut_pipeline`, "où en
  est cette affaire commercialement").

## Architecture

### Route

`/pipeline`, nouvelle page (Server Component), nouvelle entrée dans la
barre latérale (icône `Kanban` de lucide-react, confirmée disponible dans
la version installée).

### Données

Réutilisation directe de `listerAppelsOffres` (`lib/appels-offres/queries.ts`,
déjà créé au Module 3) — même source de données que `/appels-offres`,
aucune nouvelle requête de lecture nécessaire.

**Pas de polling.** Contrairement à `/appels-offres`, `statut_pipeline` ne
change jamais en arrière-plan (seul un humain le modifie via cette page) —
rendu serveur classique, revalidé via `revalidatePath("/pipeline")` après
chaque changement de statut.

### Changement de statut

Nouvelle Server Action dans `lib/appels-offres/actions.ts` :

```ts
export async function modifierStatutPipeline(
  appelOffresId: string,
  statutPipeline: StatutPipelineAo,
): Promise<{ erreur: string } | { succes: true }>
```

Valide `statutPipeline` contre `STATUTS_PIPELINE_AO` (Zod `z.enum`, déjà
exporté par `lib/appels-offres/types.ts`). **Aucune nouvelle migration
SQL** : la politique RLS `update` sur `appel_offres`, ajoutée au Module 3
(sous-projet 4B, `appel_offres_update_membres`), couvre déjà toute la
ligne via `using`/`with check` scopés par entreprise — pas seulement les
champs extraits qu'elle visait initialement.

### Échéances

Réutilisation directe de `calculerStatutExpiration` (`lib/documents/expiration.ts`,
déjà construite et testée pour les pièces administratives) appliquée à
`appel_offres.date_limite` — même logique rouge/orange/vert de proximité
d'échéance, aucune nouvelle fonction de calcul de date à écrire.

## Interface utilisateur

### Colonnes

Titre (lien vers `/appels-offres/[id]`, même comportement que la liste
existante), Acheteur, Statut pipeline (badge + `Select` pour changer
directement en ligne), Échéance (date + badge d'urgence rouge/orange/vert
via `calculerStatutExpiration`), Montant de la caution.

### Filtrage par onglets

`Tabs` en haut — Tous / Identifié / En préparation / Soumis / En attente /
Gagné / Perdu — même pattern que les onglets de type de document en
bibliothèque (`document-table.tsx`).

### Badge de statut pipeline

Composant `StatutPipelineBadge`, réutilise directement les tokens CSS
`--status-identifie`/`--status-preparation`/`--status-soumis`/
`--status-gagne`/`--status-perdu` déjà définis dans `app/globals.css`.
Correspondance directe cette fois (contrairement à `StatutTraitementBadge`
du Module 3, qui fait une indirection vers un enum différent) : un mapping
`statut_pipeline → couleur` est nécessaire uniquement parce qu'il existe 6
valeurs de `statut_pipeline` pour 5 tokens couleur disponibles —
`en_attente` n'a pas de token dédié et réutilise `identifie` (gris
neutre). Ce mapping est extrait en fonction pure testée (voir "Tests").

### Barre latérale

Nouvelle entrée "Pipeline" pointant vers `/pipeline`, icône `Kanban`
(lucide-react), ajoutée à côté des entrées existantes ("Bibliothèque",
"Appels d'offres") dans `components/app-sidebar.tsx`.

### État vide

Message adapté si aucun AO du tout ; message différent si le filtre par
onglet ne retourne aucun résultat.

### Internationalisation

Nouveau namespace `Pipeline` (`page`, `table`, `badge`) dans
`messages/fr.json`/`messages/en.json`, structuré comme les namespaces
existants. Français complet et soigné en priorité, anglais fonctionnel.

## Tests

- **`obtenirCouleurStatutPipeline(statut: StatutPipelineAo): CouleurBadge`**
  — fonction pure extraite (mapping des 6 valeurs de `statut_pipeline` vers
  les 5 couleurs disponibles, avec le repli `en_attente → identifie`),
  testée sans mock, même principe que `obtenirConfigStatutTraitement`
  (Module 3).
- **`listerAppelsOffres`** (réutilisé, déjà non testé au Module 3) et
  **`modifierStatutPipeline`** (nouvelle Server Action), **composants
  React** : pas de test automatisé, même convention que le reste de
  `lib/appels-offres/` — jamais testés unitairement dans ce projet.
  Vérification manuelle : ouvrir `/pipeline`, changer le statut d'un AO
  via le `Select` en ligne, recharger la page, confirmer la persistance ;
  vérifier le filtrage par onglet.

## Hors périmètre

- Assignation de responsable — reportée à un futur module de gestion
  d'équipe (invitation, rôles différenciés).
- Vue kanban / glisser-déposer — écartée au profit de la liste filtrable.
- Modification de `/appels-offres` (Module 3) — page séparée, non touchée
  par ce sous-projet.
- Notifications proactives de rappel d'échéance (email, push) —
  uniquement un badge visuel sur le tableau de bord ici, pas de système
  d'alerte (cohérent avec CLAUDE.md, qui prévoit ce type de rappel comme
  une brique séparée — Edge Function/pg_cron/QStash — pour une itération
  future, pas ce sous-projet).
- Formats bailleurs (Banque mondiale, BAD) — hors V1 du produit entier.
