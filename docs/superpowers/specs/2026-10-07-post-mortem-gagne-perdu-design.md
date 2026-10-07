# Post-mortem gagné/perdu — design

Date : 2026-10-07
Module roadmap : Tiers P2, "post-mortem gagné/perdu" (voir `noubinao_roadmap_le_cap`)

## Problème

`statut_pipeline` admet déjà `gagne`/`perdu`/`sans_suite` (`lib/appels-offres/types.ts`), changeable en un clic dans `StatutPipelineSelect` (`app/(app)/pipeline/statut-pipeline-select.tsx`). Aucune raison, aucune note n'est capturée nulle part — une fois un AO marqué gagné ou perdu, l'information de "pourquoi" n'existe que dans la mémoire de la personne qui a fait le changement.

## Décisions de cadrage (validées avec Sorel)

- **Capture seule, pas de dashboard d'agrégation.** Une case "raison" + une note libre par AO, visibles sur sa fiche. Pas d'écran de statistiques (taux de réussite, raisons fréquentes...) en V1 — pas assez d'AO clos dans le pilote pour que ce soit exploitable tout de suite, et ça peut venir plus tard en consultant directement les lignes `appel_offres` si besoin.
- **Déclenchement : boîte de dialogue au changement de statut.** Dès que `StatutPipelineSelect` reçoit `gagne` ou `perdu` comme nouvelle valeur, une `Dialog` s'ouvre avant d'écrire quoi que ce soit en base — pas pour les 5 autres valeurs de statut, comportement actuel inchangé pour elles.
- **Non bloquant.** Bouton "Passer" disponible dans la boîte de dialogue : ferme la boîte et change le statut quand même, sans raison ni note. Aucune autre action du produit n'est bloquante ; pas de précédent à casser ici.
- **Champs : raison (liste fermée) + note libre, les deux optionnels.** La liste fermée dépend du statut choisi :
  - Perdu : prix trop élevé, délai manqué, critères techniques non respectés, concurrent mieux positionné, sans réponse de l'acheteur, autre.
  - Gagné : prix compétitif, références solides, relation acheteur, qualité technique, autre.
- **Pas de montant final remporté.** Le montant de l'offre existe déjà potentiellement dans le bordereau BPU de l'AO ; un champ "montant final" séparé créerait une deuxième source de vérité à maintenir sans demande explicite pour ça.
- **Modifiable a posteriori.** Sur la page détail de l'AO (onglet "Vue d'ensemble"), une carte "Résultat" apparaît uniquement quand `statut_pipeline` est `gagne` ou `perdu` : affiche la raison/note déjà saisies avec un bouton "Modifier", ou un bouton "Ajouter la raison" si rien n'a été saisi (couvre le cas où la boîte de dialogue a été passée). Rouvre la même boîte de dialogue, pré-remplie si une valeur existe déjà.
- **Pas de nettoyage automatique.** Si le statut change puis revient à gagné/perdu, l'ancienne raison/note reste en base telle quelle (simplement pas affichée tant que le statut n'est pas gagné/perdu). Pas de logique de remise à zéro — YAGNI, aucun cas d'usage ne la demande.

## Modèle de données

### Migration : deux colonnes sur `appel_offres`

```sql
alter table appel_offres add column raison_resultat text;
alter table appel_offres add column note_resultat text;

alter table appel_offres add constraint appel_offres_raison_resultat_check
  check (
    raison_resultat is null
    or raison_resultat in (
      'prix_trop_eleve', 'delai_manque', 'criteres_techniques_non_respectes',
      'concurrent_mieux_positionne', 'sans_reponse_acheteur',
      'prix_competitif', 'references_solides', 'relation_acheteur',
      'qualite_technique', 'autre'
    )
  );
```

Une seule contrainte `check` couvrant l'union des deux listes (gagné + perdu) plutôt que deux colonnes séparées ou une validation côté base dépendante de `statut_pipeline` — `statut_pipeline` dit déjà sans ambiguïté dans quel contexte une valeur a été choisie, inutile de dupliquer cette logique en SQL. La distinction gagné/perdu dans la liste affichée est uniquement une responsabilité de l'UI (zod + le composant React), pas de la contrainte base.

Pas de nouvelle policy RLS : `appel_offres` a déjà des policies `update` couvrant toute colonne de la table (`appel_offres_update_membres`), ces deux colonnes en bénéficient automatiquement.

### Type TypeScript

`lib/appels-offres/types.ts`, `AppelOffres` gagne deux champs :

```ts
raison_resultat: string | null;
note_resultat: string | null;
```

Pas de type littéral fermé côté TS pour `raison_resultat` (contrairement à `StatutPipelineAo`) — la liste affichée dépend du statut (gagné vs perdu), donc le composant React porte la liste, pas le type de la colonne. Le `check` SQL reste le seul garde-fou sur les valeurs possibles en base.

## Flux côté changement de statut (`StatutPipelineSelect`)

- `onValueChange` : si la nouvelle valeur est `gagne` ou `perdu`, ouvrir une `Dialog` (état local `dialogueOuvert`, mémorise aussi la valeur choisie) au lieu d'appeler `modifierStatutPipeline` immédiatement. Pour toute autre valeur, comportement actuel inchangé (appel direct, comme aujourd'hui).
- Dans la boîte de dialogue : `Select` pour la raison (liste dépendant du statut choisi, option vide "Aucune raison" en tête — cohérent avec le fait que le champ est optionnel), `Textarea` pour la note.
- Bouton "Passer" : appelle `modifierStatutPipeline(appelOffresId, statutChoisi)` sans raison ni note (signature existante, inchangée dans ce cas), ferme la boîte.
- Bouton "Enregistrer" : appelle `modifierStatutPipeline(appelOffresId, statutChoisi, raison, note)` (nouveaux paramètres optionnels), ferme la boîte.
- Si l'utilisateur ferme la boîte autrement (Échap, clic extérieur) : revert le `Select` à la valeur précédente, comme le fait déjà le `catch`/erreur actuel de `onValueChange` — ne pas changer le statut sans action explicite de l'utilisateur dans la boîte.

## Server Actions (`lib/appels-offres/actions.ts`)

### `modifierStatutPipeline` étendue

```ts
export async function modifierStatutPipeline(
  appelOffresId: string,
  statutPipeline: StatutPipelineAo,
  raisonResultat?: string | null,
  noteResultat?: string | null,
): Promise<{ erreur: string } | { succes: true }>
```

- zod (`modifierStatutPipelineSchema` étendu) valide `raisonResultat` optionnel contre la liste fermée complète (union gagné+perdu — le filtrage "cette raison correspond bien au statut" reste une responsabilité de l'UI, pas de la validation serveur, comme la contrainte SQL) et `noteResultat` optionnel (trim, max 1000 caractères, cohérent avec la limite déjà choisie pour les notes Go/No-Go).
- La requête `UPDATE` inclut `raison_resultat`/`note_resultat` seulement quand ils sont fournis (`undefined` ≠ `null` : un appel "Passer" ne doit pas écraser une raison déjà saisie lors d'un changement de statut antérieur — n'inclure ces clés dans l'objet `update()` que si le paramètre n'est pas `undefined`).
- `revalidatePath` : ajouter `revalidatePath(`/appels-offres/${appelOffresId}`)` en plus du `revalidatePath("/pipeline")` existant — cette action peut maintenant aussi modifier des données affichées sur la fiche détail.

### Nouvelle action `modifierResultatAo`

```ts
export async function modifierResultatAo(
  appelOffresId: string,
  raisonResultat: string | null,
  noteResultat: string | null,
): Promise<{ erreur: string } | { succes: true }>
```

Pour l'édition a posteriori depuis la carte "Résultat" de la fiche détail — ne touche jamais `statut_pipeline`. Même validation zod que ci-dessus pour les deux champs. `revalidatePath(`/appels-offres/${appelOffresId}`)` seulement (n'affecte pas la liste `/pipeline`).

## Carte "Résultat" sur la fiche AO (`app/(app)/appels-offres/[id]/resultat-card.tsx`)

Nouveau composant, même emplacement dans l'onglet "Vue d'ensemble" que `GoNoGo`/`GroupementCard` (`appel-offres-detail.tsx`), rendu conditionnellement :

```tsx
{(appelOffres.statut_pipeline === "gagne" || appelOffres.statut_pipeline === "perdu") && (
  <ResultatCard
    appelOffresId={appelOffres.id}
    statutPipeline={appelOffres.statut_pipeline}
    raisonInitiale={appelOffres.raison_resultat}
    noteInitiale={appelOffres.note_resultat}
  />
)}
```

- Affiche la raison (libellé traduit) et la note si `raisonInitiale`/`noteInitiale` non nulles, avec un bouton "Modifier".
- Sinon, un texte "Aucune raison renseignée." + bouton "Ajouter la raison".
- Les deux boutons ouvrent la même boîte de dialogue que celle de `StatutPipelineSelect` (liste de raisons dépendant de `statutPipeline`, déjà connu — pas de sélecteur de statut ici), pré-remplie avec les valeurs initiales. Au clic sur "Enregistrer" : appelle `modifierResultatAo`, pas `modifierStatutPipeline`.
- La boîte de dialogue (`Select` raison + `Textarea` note + boutons Passer/Enregistrer) est factorisée dans un composant partagé (`resultat-dialogue.tsx` ou équivalent) réutilisé par `StatutPipelineSelect` ET `ResultatCard`, pour ne pas dupliquer la liste de raisons et le balisage deux fois.

## i18n

Nouvelles clés, `messages/fr.json` et `messages/en.json` :
- `Pipeline.postMortem.*` : titre de la boîte de dialogue, libellés des raisons (perdu + gagné), label du champ note, boutons Passer/Enregistrer, option "Aucune raison".
- `AppelsOffres.detail.resultat.*` : titre de la carte, "Aucune raison renseignée.", boutons "Ajouter la raison"/"Modifier", toast de confirmation.

Les libellés de raison (ex. "Prix trop élevé", "Concurrent mieux positionné") sont écrits une seule fois et réutilisés par les deux emplacements (boîte de dialogue dans `StatutPipelineSelect` et dans `ResultatCard`) via le même namespace `Pipeline.postMortem.raisons.*`.

## Hors scope (confirmé)

- Pas de dashboard d'agrégation (taux de réussite, raisons fréquentes par secteur/période).
- Pas de champ montant final remporté.
- Pas de blocage/obligation de remplir la raison.
- Pas de nettoyage automatique de la raison/note si le statut change puis revient à gagné/perdu.
- Pas de nouvelle policy RLS (les policies `update` existantes sur `appel_offres` couvrent déjà ces colonnes).

## Tests

- Unitaires (Vitest) : schéma zod étendu de `modifierStatutPipeline` (raison valide/invalide, note trop longue, raison/note absentes acceptées) ; schéma de `modifierResultatAo`.
- Vérification manuelle navigateur (parcours complet) : changer un AO à "Perdu" → boîte de dialogue s'ouvre → "Passer" → statut change sans raison ; changer un autre AO à "Gagné" → remplir raison + note → "Enregistrer" → vérifier l'affichage sur la fiche détail ; depuis la fiche détail, "Ajouter la raison" sur l'AO passé via "Passer" → vérifier la pré-sélection de la liste correcte (gagné vs perdu) ; repasser un AO gagné à "En préparation" puis à nouveau "Gagné" → vérifier que l'ancienne raison n'a pas disparu de la base (même si pas réaffichée entre-temps).
