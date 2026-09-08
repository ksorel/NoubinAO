# Responsable assigné (Module 5, complément)

Date : 2026-09-08
Statut : approuvé par l'utilisateur (cycle allégé, urgence démo partenaires).

## Contexte

Le pipeline (Module 5, sous-projet 5.1) couvre déjà statut, échéance et
montant de caution. Il manquait le dernier point du périmètre Module 5
défini dans `CLAUDE.md` : "responsable assigné". Ce complément l'ajoute.

## Décision validée

Un seul responsable par AO (pas de multi-assignation), choisi parmi les
membres de l'entreprise (`utilisateur`), modifiable directement depuis une
colonne `Select` dans le tableau pipeline existant — même interaction que
`StatutPipelineSelect` déjà en place.

## Modèle de données

```sql
alter table appel_offres
  add column assigne_a uuid references utilisateur(id) on delete set null;
```

Aucune nouvelle policy RLS : la policy `appel_offres_update_membres`
existante (scopée par appartenance à l'entreprise) couvre déjà l'écriture
de cette nouvelle colonne comme toute autre colonne d'`appel_offres`.
`on delete set null` : si un utilisateur est supprimé, l'AO redevient
non assigné plutôt que de bloquer la suppression.

## Lecture de l'équipe

Nouvelle fonction `listerUtilisateurs(entrepriseId): Promise<{ id: string; nom: string }[]>`
dans `lib/utilisateur/queries.ts`, simple `select("id, nom")` scopé par
entreprise, triée par nom.

## Server Action

`assignerResponsable(appelOffresId: string, utilisateurId: string | null)`
dans `lib/appels-offres/actions.ts` — même défense en profondeur que
`modifierStatutPipeline` (`.select("id")` après `.update()`, vérification
de rowcount), `revalidatePath("/pipeline")` sur succès.

## UI

- Nouveau composant `app/(app)/pipeline/responsable-select.tsx`, copie du
  pattern de `statut-pipeline-select.tsx` (état local optimiste, rollback
  + toast sur échec). Option "Non assigné" en tête de liste pour permettre
  la désassignation.
- Nouvelle colonne "Responsable" dans `pipeline-table.tsx`, entre Statut et
  Échéance.
- `PipelineTable` reçoit une nouvelle prop `equipe: { id: string; nom: string }[]`.
- `page.tsx` charge `listerUtilisateurs` en plus de `listerAppelsOffres`.

## Hors périmètre

- Multi-assignation, notifications à l'assignation, filtre du tableau par
  responsable — non demandés, à ajouter plus tard si besoin exprimé.
