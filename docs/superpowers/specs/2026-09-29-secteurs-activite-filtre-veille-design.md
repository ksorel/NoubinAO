# Secteurs d'activité entreprise + filtre `/veille`

Date : 2026-09-29
Statut : décisions validées avec l'utilisateur (section par section, brainstorming).

## Contexte

Une entreprise cliente peut exercer dans plusieurs des secteurs ciblés par
NoubinAO (BTP, ingénierie, environnement, énergie-climat — voir CLAUDE.md,
ciblage commercial déjà restreint à ces quatre secteurs, ne pas élargir).
Elle veut choisir lesquels l'intéressent et que `/veille` ne lui montre que
les avis correspondants.

**Premier sous-projet (A) d'un ensemble plus large.** L'utilisateur a
aussi demandé des notifications (email + in-app) quand un avis pertinent
apparaît — décomposé en un second sous-projet (B), à brainstormer et
spécifier séparément une fois A validé et implémenté, puisque B dépend
directement du secteur d'un avis pour décider qui notifier.

Ce sous-projet **réouvre deux décisions explicitement reportées** dans la
spec `2026-09-29-veille-marches-publics-design.md` (« Hors périmètre » :
classification IA du secteur, notifications) — normal, ces décisions
étaient conditionnées à l'usage réel, que l'utilisateur a maintenant.

## Décisions validées avec l'utilisateur

- **Référentiel fermé à 4 secteurs**, exactement ceux déjà nommés dans
  CLAUDE.md — pas de liste ouverte ni élargie. Une entreprise peut en
  choisir 0 à 4.
- **Classification par mots-clés, déterministe** — même patron que
  `classifierTypeFichierDao`/`identifierFormulaireStandard` déjà dans le
  projet. Pas d'appel IA, malgré un volume réel désormais connu comme très
  faible (~1 avis encore ouvert sur 1216 extraits observés en un jour) qui
  aurait pu justifier de revenir sur ce choix — la cohérence avec le reste
  du projet (préférer le déterministe à l'IA quand c'est possible) prime.
- **Classification faite une seule fois, à l'insertion** d'un nouvel avis
  scrapé — jamais réécrite sur un avis déjà en base, même si la liste de
  mots-clés évolue plus tard (évite un reclassement silencieux).
- **Filtre strict côté serveur** : un avis hors des secteurs configurés
  par l'entreprise n'est **jamais renvoyé au navigateur** — pas un simple
  toggle d'affichage. Cohérent avec le principe déjà appliqué ailleurs
  dans le projet (ne pas faire traverser au client des données qu'il ne
  doit pas voir, voir mémoire `noubinao_module6_integration_email`).
- **Avis non classé (`secteur` null) : visible par toutes les
  entreprises**, quel que soit leur paramétrage — évite qu'un faux négatif
  de classification mots-clés fasse perdre une vraie opportunité.
- **Entreprise sans secteur configuré (0 sur 4) : voit tout**, comme
  aujourd'hui — évite un écran vide au premier lancement, pas de blocage.

## Modèle de données

```sql
alter table entreprise
  add column secteurs_activite text[] not null default '{}';
```

Pas de table séparée : 4 valeurs fixes possibles, un simple tableau
suffit (cohérent avec le principe du projet de ne pas construire
d'abstraction pour un besoin qui n'en a pas). Valeurs attendues dans ce
tableau : `"btp"`, `"ingenierie"`, `"environnement"`, `"energie_climat"`
— validation Zod côté Server Action, pas de contrainte SQL `check`
(cohérent avec `appel_offres.secteur`, déjà `text` libre sans contrainte).

`avis_ao_national.secteur` (colonne existante, déjà `text` nullable,
migration `20260923090000_veille_bomp.sql`) — réutilisée telle quelle,
aucune migration nécessaire côté avis.

## Classification des avis par secteur

Nouveau module `lib/veille/classification-secteur.ts`.

```typescript
export const SECTEURS_CIBLES = [
  "btp",
  "ingenierie",
  "environnement",
  "energie_climat",
] as const;
export type SecteurCible = (typeof SECTEURS_CIBLES)[number];
```

`classifierSecteur(objet: string): SecteurCible | null` — premier secteur
du registre dont un mot-clé apparaît dans `objet` (comparaison
insensible à la casse, même patron que `classifierTypeFichierDao`).
Renvoie `null` si aucun mot-clé ne matche.

**Mots-clés de départ (à affiner en plan d'implémentation contre un
échantillon réel d'avis, pas supposés corrects par construction — même
discipline que le reste du projet pour ce genre de heuristique)** :

```
btp: construction, bâtiment, voirie, génie civil, réhabilitation,
     édifice, salle de classe, logement, route, pont, dallage
ingenierie: étude, ingénierie, conception, supervision,
     contrôle technique, maîtrise d'œuvre, bureau d'études,
     assistance technique
environnement: assainissement, environnement, déchets, eau potable,
     impact environnemental, reboisement, gestion des déchets
energie_climat: électrification, solaire, photovoltaïque,
     climatisation, réseau électrique, éclairage public,
     groupe électrogène
```

Ordre du registre = ordre de priorité en cas de chevauchement (ex. un
objet contenant à la fois "construction" et "solaire" tombe sur le
premier match trouvé, comme `classifierTypeFichierDao`).

**Point d'appel** : `construireLigneInsertion` dans
`lib/veille/marches-publics.ts` (Tâche 5 de la spec veille) — ajoute
`secteur: classifierSecteur(avis.objet)` à l'objet retourné.
`construireLigneMiseAJour` (avis déjà connu) **n'est pas modifiée** —
un avis déjà en base garde son `secteur` (ou son absence) tel quel.

## Configuration côté entreprise

`app/(app)/parametres/profil-entreprise-card.tsx` (carte existante,
étendue — pas de nouvelle carte) :

- 4 `<Checkbox>` (BTP / Ingénierie / Environnement / Énergie-climat),
  état local `secteursActivite: string[]`, initialisé depuis
  `entreprise.secteurs_activite`.
- `modifierProfilEntreprise` (Server Action existante,
  `lib/utilisateur/actions.ts`) étend son schéma Zod d'entrée pour
  accepter `secteursActivite: z.array(z.enum(SECTEURS_CIBLES))`, écrit
  dans la nouvelle colonne.
- Aucune case cochée par défaut pour un compte neuf — cohérent avec la
  décision « aucun secteur configuré = tout visible ».
- Même bouton d'enregistrement unique que le reste de la carte (pas de
  bouton séparé pour les secteurs) — même patron d'erreur/succès
  (toast) que l'existant.

## Filtre côté `/veille`

`listerAvisNational` (`lib/veille/queries.ts`) — nouvelle signature :

```typescript
export async function listerAvisNational(
  secteursEntreprise: string[],
): Promise<AvisAoNational[]>
```

- `secteursEntreprise.length === 0` → requête inchangée, aucun filtre
  (comportement actuel, tout visible).
- Sinon → filtre Supabase ajouté à la requête existante :
  `.or(\`secteur.in.(${secteursEntreprise.join(",")}),secteur.is.null\`)`
  — un avis hors des secteurs choisis et déjà classé n'est jamais inclus
  dans la réponse ; un avis non classé (`secteur` null) reste inclus,
  conformément aux décisions validées.

`app/(app)/veille/page.tsx` : récupère `entreprise.secteurs_activite`
(déjà chargée via `obtenirEntreprise`, ou requête additionnelle légère
si ce champ n'y est pas encore inclus) et la passe à
`listerAvisNational`.

`VeilleTable` (`app/(app)/veille/veille-table.tsx`) : **aucun
changement de code**. Son filtre « secteur » existant (`select` peuplé
depuis `avis.map(a => a.secteur)`) continue de fonctionner tel quel —
les options qu'il propose se limitent naturellement aux secteurs
présents dans les données déjà filtrées côté serveur, sans logique
supplémentaire à écrire côté client.

## États et erreurs

- `classifierSecteur` : fonction pure de correspondance texte, aucun
  échec possible — pas de gestion d'erreur à prévoir.
- Échec de sauvegarde des secteurs entreprise : même patron que le
  reste de `ProfilEntrepriseCard` (toast d'erreur, aucun changement
  d'état local si `modifierProfilEntreprise` échoue).
- `listerAvisNational` avec un tableau de secteurs invalide (valeur hors
  `SECTEURS_CIBLES`) : ne peut pas arriver en pratique — la Server
  Action de sauvegarde valide déjà via Zod avant écriture en base,
  `entreprise.secteurs_activite` ne peut donc contenir que des valeurs
  valides.

## Tests

- `classifierSecteur` : TDD, un cas par secteur avec un objet réaliste
  (français, vocabulaire d'AO ivoirien — pas des exemples inventés
  triviaux), plus un cas sans correspondance → `null`, plus un cas de
  chevauchement pour vérifier l'ordre de priorité du registre.
- `listerAvisNational` : **non testée unitairement** — cohérent avec le
  reste de `lib/veille/queries.ts`, aucune fonction de requête n'y est
  testée directement dans ce projet (nécessiterait une base réelle),
  seule la logique pure (`classifierSecteur`) l'est.
- Pas de test sur `ProfilEntrepriseCard` ni `VeilleTable` — cohérent
  avec le reste du projet (aucun test sur les composants UI).

## Hors périmètre (ce sous-projet A)

- **Notifications email/in-app** — sous-projet B, brainstormé et
  spécifié séparément une fois A implémenté et validé (dépend du
  `secteur` d'un avis, que ce sous-projet met en place).
- Reclassement rétroactif des avis déjà en base sans secteur détecté.
- Secteur multiple par avis — un avis a au plus un secteur, jamais
  plusieurs (contrairement à une entreprise, qui peut en choisir
  plusieurs).
- Élargissement du référentiel au-delà des 4 secteurs déjà actés dans
  CLAUDE.md.
