# Upload et liste de suivi DAO (Module 3, sous-projet 4A)

Date : 2026-09-01
Statut : approuvé par l'utilisateur, prêt pour le plan d'implémentation.

## Contexte

Premier des deux sous-sous-projets composant l'UI du Module 3 (Extraction
de DAO), après :

1. Modèle de données (`appel_offres`/`exigence_ao`, RLS `select`/`insert`/
   `delete` uniquement).
2. Pipeline de normalisation (`lib/appels-offres/normalisation/`).
3. Upload + orchestration (`televerserDao` en Server Action, `traiterDao`
   exécuté en arrière-plan via QStash avec client service-role,
   `statut_traitement` progresse `en_attente → normalisation → extraction
   → termine` ou `erreur`).

Ce sous-projet construit la première UI de tout le Module 3 : upload d'un
DAO et suivi de son traitement, validant pour la première fois le pipeline
complet visible depuis le navigateur.

**Recadrage de périmètre par rapport à la demande initiale** : CLAUDE.md
prévoit un Module 5 dédié ("Pipeline / tableau de bord — vue de tous les
AO en cours avec statut identifié/en préparation/soumis/gagné/perdu"). Ce
sous-projet reste strictement dans le périmètre du Module 3 : suivi du
**statut de traitement technique** (`statut_traitement`), pas le pipeline
métier complet (`statut_pipeline`), qui reste pour le Module 5.

**Décomposition de l'UI du Module 3** : ce sous-projet (A) couvre upload +
liste de suivi. Un second sous-projet (B, à brainstormer séparément)
couvrira la page de revue et d'édition manuelle des exigences extraites,
et c'est à ce moment que la politique RLS `update` sur `appel_offres`
deviendra nécessaire — pas dans ce sous-projet.

## Décisions validées avec l'utilisateur

- **Suivi de la progression par polling côté client**, pas de Supabase
  Realtime (jamais utilisé dans ce projet, complexité non justifiée pour
  un traitement qui prend déjà 30-60s dans le pire cas) ni de
  rafraîchissement manuel uniquement (moins fluide).
- **Suppression d'un AO incluse dans ce sous-projet**, en miroir direct de
  `supprimerDocument` — pas reportée au sous-projet B.

## Architecture

### Route

`/appels-offres`, nouvelle page (Server Component pour le chargement
initial), miroir structurel de `/bibliotheque`.

### Backend (`lib/appels-offres/`)

- **`queries.ts`** *(nouveau fichier)* : `listerAppelsOffres(entrepriseId:
  string): Promise<AppelOffres[]>` — miroir de `listerDocuments`
  (`lib/documents/queries.ts`), lecture pure pour le rendu serveur
  initial.
- **`actions.ts`** *(complété)* :
  - `supprimerAppelOffres(appelOffresId: string, cheminStockage: string):
    Promise<{erreur: string} | {succes: true}>` — miroir de
    `supprimerDocument` : suppression de la ligne `appel_offres` (cascade
    sur `exigence_ao`) puis du fichier dans le bucket `documents`.
  - `obtenirAppelsOffresActualises(): Promise<AppelOffres[]>` — petit
    wrapper `"use server"` dédié au polling client, appelle
    `listerAppelsOffres` en interne après avoir résolu l'entreprise de
    l'utilisateur courant via `obtenirUtilisateurCourant`. Retourne un
    tableau vide si l'utilisateur n'est plus authentifié (dégradation
    silencieuse, cohérent avec un contexte de polling en arrière-plan).
  - `televerserDao` *(existant, modifié)* : ajout d'un appel
    `revalidatePath("/appels-offres")` sur succès — non fait au
    sous-projet 3 faute de route à invalider à l'époque.

### Polling

Le composant client de la liste appelle `obtenirAppelsOffresActualises()`
toutes les 4 secondes tant qu'au moins un AO affiché a `statut_traitement`
dans `('en_attente', 'normalisation', 'extraction')`. Dès que tous les AO
affichés sont `termine` ou `erreur` (ou que la liste est vide), le
minuteur s'arrête — pas de polling qui tourne indéfiniment en arrière-plan.
La condition d'arrêt est extraite en fonction pure testable (voir
"Tests").

### Suppression et course avec un job en cours

Un AO peut être supprimé à tout moment, y compris pendant son traitement.
Si le job QStash associé se déclenche après la suppression, `traiterDao`
échouera proprement à retrouver la ligne (déjà supprimée par cascade) et
QStash abandonnera après ses tentatives de retry — cas limite accepté,
sans impact utilisateur visible, non traité spécifiquement dans ce
sous-projet.

## Interface utilisateur

### Badges de statut de traitement

Réutilisation des tokens CSS du pipeline AO déjà définis dans
`app/globals.css` (`--status-identifie`, `--status-preparation`,
`--status-gagne`, `--status-perdu`) — déjà repris pour un concept
différent par `ExpirationBadge` (`app/(app)/bibliotheque/expiration-badge.tsx`),
confirmant que ces tokens sont traités comme des couleurs sémantiques
génériques (gris/bleu/vert/rouge) dans ce projet, pas strictement liées à
`statut_pipeline`. Aucune nouvelle variable CSS.

| `statut_traitement` | Token couleur | Icône (lucide-react) | Libellé (FR) |
|---|---|---|---|
| `en_attente` | `--status-identifie` | `Clock` | En attente |
| `normalisation` | `--status-preparation` | `Loader2` (animé) | Normalisation en cours |
| `extraction` | `--status-preparation` | `Loader2` (animé) | Extraction en cours |
| `termine` | `--status-gagne` | `CheckCircle2` | Terminé |
| `erreur` | `--status-perdu` | `AlertCircle` | Erreur (infobulle : `erreur_traitement`) |

Le mapping `statut_traitement → {couleur, icône, clé de libellé}` est
extrait en fonction pure testable (voir "Tests"), même principe que
`calculerStatutExpiration` (`lib/documents/expiration.ts`).

### Colonnes de la liste

Titre/nom du fichier (`titre` si renseigné, sinon
`fichier_dao_nom_original`), Acheteur (`—` si pas encore extrait), Statut
(badge ci-dessus), Ajouté le (`created_at`), Actions (Supprimer).

### Dialog d'upload

`TeleverserDaoDialog`, miroir direct de `AjouterDocumentDialog`
(`app/(app)/bibliotheque/ajouter-document-dialog.tsx`) mais avec un seul
champ fichier (`accept=".pdf,.docx"`), appelle `televerserDao`.

### État vide

Miroir de la bibliothèque : message "Aucun appel d'offres" + bouton
"Ajouter le premier".

### Barre latérale

Nouvelle entrée "Appels d'offres" dans `components/app-sidebar.tsx`,
pointant vers `/appels-offres`, icône `FileSearch` (lucide-react), ajoutée
à côté de l'entrée "Bibliothèque" existante.

### Internationalisation

Nouveau namespace `AppelsOffres` dans `messages/fr.json`/`en.json`,
structuré comme `Bibliotheque` (`page`, `table`, `badge`, `dialog`).
Français complet et soigné en priorité, anglais complété sans bloquer
(cohérent avec CLAUDE.md).

## Tests

- **Fonctions pures, testées sans mock** : `obtenirConfigStatutTraitement(statut)`
  (mapping couleur/icône/libellé) et `tousLesAoStabilises(appelsOffres)`
  (condition d'arrêt du polling — tous les statuts sont `termine`/`erreur`).
- **`queries.ts` et les nouvelles fonctions d'`actions.ts`** : pas de test
  automatisé, même convention que `listerDocuments`/`ajouterDocument`/
  `supprimerDocument` — jamais testés unitairement dans ce projet
  (dépendances réelles Storage/DB trop lourdes à mocker utilement).
  Vérification manuelle : upload réel d'un DAO, observation du polling
  jusqu'à `termine`.

## Hors périmètre

- Page de détail/revue des exigences extraites, édition manuelle — sous-projet B.
- Politique RLS `update` sur `appel_offres`/`exigence_ao` — sous-projet B
  (aucune écriture sous session utilisateur autre qu'upload/suppression
  dans ce sous-projet, déjà couvertes par les politiques `insert`/`delete`
  existantes).
- Tableau de bord pipeline (`statut_pipeline`, vue kanban
  identifié/préparation/soumis/gagné/perdu) — Module 5.
- Suivi temps réel via Supabase Realtime — écarté au profit du polling.
- Traitement spécial de la course suppression/job QStash en cours — cas
  limite accepté sans garde particulière.
- Formats bailleurs (Banque mondiale, BAD) — hors V1 du produit entier.
