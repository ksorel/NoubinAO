# Revue et édition des exigences DAO (Module 3, sous-projet 4B)

Date : 2026-09-01
Statut : approuvé par l'utilisateur, prêt pour le plan d'implémentation.

## Contexte

Second et dernier sous-sous-projet de l'UI du Module 3 (Extraction de DAO),
après le sous-projet 4A (upload + liste de suivi, terminé et mergé sur
main). La liste (`app/(app)/appels-offres/appel-offres-table.tsx`) montre
un résumé (titre, acheteur, statut, date) mais aucun lien vers un détail —
ce sous-projet construit la page de détail par AO, avec correction
manuelle des champs extraits.

C'est le premier sous-projet du Module 3 qui écrit en base sous session
utilisateur (RLS), après trois sous-projets qui n'utilisaient que
`select`/`insert`/`delete` (sous-projet 1), une transformation pure sans
accès DB (sous-projet 2), ou le service-role pour les écritures en
arrière-plan (sous-projet 3). La politique RLS `update` sur `appel_offres`,
dont l'ajout a été reporté deux fois (sous-projets 1 et 3), devient enfin
nécessaire ici.

## Décisions validées avec l'utilisateur

- **Édition limitée aux champs de l'AO** (`titre`, `acheteur`, `secteur`,
  `date_limite`, `montant_caution`) — les lignes `exigence_ao` restent en
  lecture seule dans ce sous-projet. L'édition individuelle des exigences
  (ajout/modification/suppression) est reportée à un sous-projet ultérieur
  si le besoin se confirme à l'usage réel. Conséquence directe : **aucune
  politique RLS `update` sur `exigence_ao`** n'est nécessaire ici.
- **Page de détail toujours accessible**, quel que soit `statut_traitement`
  — pas de redirection. Si `statut_traitement ≠ 'termine'` : badge de
  statut, message d'état (ou le message `erreur_traitement` si
  `'erreur'`), formulaire d'édition désactivé, section exigences vide.
- **`statut_pipeline` reste hors de portée** de cette page — cohérent avec
  le recadrage déjà validé au sous-projet 4A (le tableau de bord pipeline
  appartient au Module 5, pas au Module 3).

## Architecture

### Route

`/appels-offres/[id]`, nouvelle page dynamique (Server Component).

### Backend (`lib/appels-offres/`)

- **`queries.ts`** *(complété)* :

  ```ts
  export async function obtenirAppelOffres(
    id: string,
    entrepriseId: string,
  ): Promise<{ appelOffres: AppelOffres; exigences: ExigenceAo[] } | null>
  ```

  Charge l'AO et ses exigences en une fois. Retourne `null` si l'AO
  n'existe pas ou n'appartient pas à l'entreprise — protection en
  profondeur, en plus de RLS (filtre explicite `entreprise_id` dans la
  requête, pas seulement une dépendance à la policy).

- **`schema.ts`** *(complété)* : `modifierAppelOffresSchema` (Zod) —
  valide uniquement `titre`, `acheteur`, `secteur` (chaînes optionnelles,
  vides converties en `null`), `date_limite` (datetime ISO optionnelle),
  `montant_caution` (nombre optionnel). Aucun autre champ n'est accepté —
  `statut_traitement`, `statut_pipeline`, `fichier_dao_path`,
  `erreur_traitement`, `entreprise_id`, `created_by` restent hors de
  portée de cette action, contrôlés uniquement par le système (traitement
  en arrière-plan ou upload).

- **`actions.ts`** *(complété)* :
  - `modifierAppelOffres(appelOffresId: string, formData: FormData): Promise<{erreur: string} | {succes: true}>`.
  - `genererUrlTelechargementDao(cheminStockage: string): Promise<{erreur: string} | {url: string}>` —
    miroir de `genererUrlTelechargement` (`lib/documents/actions.ts`), même
    bucket `documents`.

### Migration SQL — politique RLS `update` sur `appel_offres`

Nouvelle migration, ajoutant uniquement cette politique (pas de nouvelle
table, pas de nouvelle colonne) :

```sql
create policy "appel_offres_update_membres" on appel_offres
  for update using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = appel_offres.entreprise_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = appel_offres.entreprise_id and u.id = auth.uid()
    )
  );
```

`using` et `with check` portent la même condition d'appartenance à
l'entreprise — `with check` empêche spécifiquement qu'une mise à jour
réassigne la ligne à une autre entreprise.

### Comportement selon `statut_traitement`

La page charge toujours, sans redirection.
- `statut_traitement ∈ {en_attente, normalisation, extraction}` : badge de
  statut + message "traitement en cours", formulaire désactivé, pas de
  section exigences.
- `statut_traitement = 'erreur'` : badge d'erreur + message
  `erreur_traitement`, formulaire désactivé, pas de section exigences.
- `statut_traitement = 'termine'` : formulaire actif (pré-rempli avec les
  valeurs actuelles) + liste des exigences affichée.

### Lien depuis la liste

Le titre de chaque ligne dans `AppelOffresTable` (sous-projet 4A) devient
un lien `<Link href={`/appels-offres/${ao.id}`}>` — seule modification de
ce composant existant.

## Interface utilisateur

### Formulaire d'édition

Un seul mode (pas de bascule vue/édition séparée) — champs directement
modifiables, un bouton "Enregistrer" :
- `titre`, `acheteur`, `secteur` : champs texte.
- `date_limite` : `<Input type="datetime-local">`, pas un simple sélecteur
  de date. `date_limite` porte une heure limite significative dans les DAO
  ivoiriens (ex. "12h00") — un champ date-only écraserait silencieusement
  cette précision si l'utilisateur corrige un autre champ sans y penser.
- `montant_caution` : `<Input type="number">`.
- Un champ vidé est enregistré comme `null` (permet de corriger une
  extraction erronée en l'effaçant plutôt que de forcer une valeur).

### Affichage des exigences (lecture seule)

Deux groupes, discriminés par `type_exigence` :
- **Pièces requises** : `libelle` + `description`.
- **Critères d'évaluation** : `libelle` + `ponderation`.

Chaque ligne affiche `source_section` en petit texte discret en dessous —
conforme à l'exigence de traçabilité de CLAUDE.md (aucune affirmation
générée par l'IA sans référence à sa source vérifiable).

### Autres éléments

- **Téléchargement du fichier source** : bouton "Télécharger le DAO",
  utilise `genererUrlTelechargementDao`.
- **Sommaire attendu** : liste simple en lecture seule (`sommaire_attendu`).
- **Fil d'Ariane** : "Appels d'offres > [titre ou nom de fichier]".

### Internationalisation

Nouveau sous-namespace `AppelsOffres.detail` (`page`, `form`, `exigences`,
`error`), même structure que les namespaces existants. Français complet et
soigné en priorité, anglais fonctionnel.

## Tests

- **`versValeurDatetimeLocal(dateIso: string | null): string`** — fonction
  pure extraite (conversion ISO 8601 → format attendu par
  `<input type="datetime-local">`), testée sans mock, même principe que
  les autres fonctions pures déjà testées dans ce module
  (`obtenirConfigStatutTraitement`, `tousLesAoStabilises`).
- **`queries.ts`, `actions.ts`, composants React** : pas de test
  automatisé, même convention que le reste de `lib/appels-offres/` et
  `lib/documents/` — jamais testés unitairement dans ce projet.
  Vérification manuelle : ouvrir le détail d'un AO terminé, modifier un
  champ, enregistrer, recharger et confirmer la persistance ; ouvrir le
  détail d'un AO non terminé et confirmer que le formulaire est désactivé.

## Hors périmètre

- Édition/ajout/suppression individuelle des lignes `exigence_ao` —
  reporté à un futur sous-projet si le besoin se confirme à l'usage réel.
- Politique RLS `update` sur `exigence_ao` — non nécessaire ici (exigences
  en lecture seule dans ce sous-projet).
- Édition de `statut_pipeline` depuis cette page — reste dans le périmètre
  du Module 5 (tableau de bord pipeline).
- Formats bailleurs (Banque mondiale, BAD) — hors V1 du produit entier.
