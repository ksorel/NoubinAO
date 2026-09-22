# Suggestion de CV pertinents par critère de qualification

Date : 2026-09-22
Statut : approuvé par l'utilisateur.

## Contexte

Priorité P1 de la feuille de route stratégique (artefact "Le Cap
NoubinAO", tier P1 — « ce qui fait gagner, pas seulement soumettre »).

`exigence_ao.type_exigence` a deux valeurs : `piece_requise` et
`critere_evaluation` (`lib/appels-offres/types.ts:20-28`). Un CV requis
apparaît comme une `piece_requise` (ex. « CV du Directeur des travaux »),
tandis que les exigences de qualification (expérience du personnel clé,
diplômes, années d'expérience minimales) apparaissent comme des
`critere_evaluation` séparées, avec `ponderation` mais **aucun lien
structurel** vers la pièce CV correspondante — deux listes indépendantes
affichées côte à côte dans `appel-offres-detail.tsx`.

`document.type === "cv"` (`lib/documents/types.ts`) n'a aucun champ
structuré de spécialité/domaine/années d'expérience — seulement `nom`,
`contenu_markdown` (texte brut extrait), etc. Le mapping CV↔exigence
existant (`documents-exigence.tsx`) utilise déjà
`deviserTypeDocumentPrefere(libelle)` pour choisir le **type** de
document à suggérer, groupé en `groupeSuggestions`/`groupeAutres` — mais
si l'entreprise a plusieurs CV du même type, tous apparaissent mélangés
sans classement par pertinence.

Le vrai gap : parmi plusieurs CV de la bibliothèque, lequel correspond
le mieux au poste/profil précis exigé par ce DAO — un classement par
pertinence texte↔texte, pas une classification binaire par mots-clés
comme `deviserTypeDocumentPrefere`.

Patron déjà existant pour ce type de scoring : `extraireMotsCles` et
`calculerScoreCorrespondanceDetaille` (`lib/email/correspondance.ts`,
Module 6) — extraction de mots-clés + comptage de chevauchements pour
scorer un email contre un AO. Réutilisé ici plutôt que réinventé.

## Décisions validées avec l'utilisateur

- **Corrélation critère↔pièce CV par inférence automatique de mots-clés**
  — pas de nouveau champ, pas d'action utilisateur. Pour une pièce CV
  donnée (ex. « CV du Directeur des travaux »), on retient les critères
  de qualification dont le libellé/description partagent au moins un
  mot-clé avec le libellé de la pièce. Aucun critère ne matche → aucun
  reclassement, la liste reste dans son ordre actuel (pas de tri
  hasardeux sans signal réel).
- **Affichage : réordonnancement de `groupeSuggestions` existant**, pas
  de nouvel élément d'interface. Les CV les plus pertinents apparaissent
  en premier dans le `<Select>` déjà en place.
- **`extraireMotsCles` déplacé vers un module partagé**
  (`lib/texte/mots-cles.ts`) — fonction générique, pas spécifique aux
  emails, maintenant nécessaire dans un second domaine (appels d'offres).
  `lib/email/correspondance.ts` la réexporte, aucun changement de
  comportement ni de test pour le module email.
- **Zéro appel IA** — chevauchement de mots-clés suffit, cohérent avec
  la philosophie du projet (IA seulement si les règles simples s'avèrent
  insuffisantes).
- **Portée strictement CV** — le reclassement ne s'applique qu'aux
  pièces dont `deviserTypeDocumentPrefere` retourne `"cv"` ; les autres
  types de pièces (références, agréments, administratif) ne changent
  pas, aucun critère de qualification équivalent n'existe pour eux.

## Modèle de données

Aucun changement de schéma. Aucune nouvelle Server Action — tout le
calcul est client-side dans un composant déjà `"use client"`, à partir
de données déjà chargées (`exigences`, `bibliotheque`).

## Changement 1 — nouveau module partagé `lib/texte/mots-cles.ts`

Déplacement verbatim (aucune logique modifiée) depuis
`lib/email/correspondance.ts` :

```ts
const MOTS_VIDES = new Set([
  "de", "la", "le", "les", "des", "du", "un", "une", "et", "ou", "pour",
  "avec", "dans", "sur", "au", "aux", "en", "à", "d", "l", "par",
]);

export function extraireMotsCles(texte: string): string[] {
  return texte
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((mot) => mot.length >= 4 && !MOTS_VIDES.has(mot));
}
```

## Changement 2 — `lib/email/correspondance.ts`

Retire la définition locale de `MOTS_VIDES`/`extraireMotsCles` (lignes
1-12 actuelles), la remplace par une réexportation :

```ts
export { extraireMotsCles } from "@/lib/texte/mots-cles";
```

Le reste du fichier (`calculerScoreCorrespondanceDetaille`,
`calculerScoreCorrespondance`, les interfaces) reste identique — ces
fonctions utilisent déjà `extraireMotsCles` par son nom, indifférentes à
sa provenance. `lib/email/correspondance.test.ts` (qui importe
`extraireMotsCles` depuis `"./correspondance"`) continue de fonctionner
sans modification grâce à la réexportation.

## Changement 3 — `lib/appels-offres/suggestion-document.ts`

Nouvelle fonction, à côté de `deviserTypeDocumentPrefere` (fichier déjà
existant, inchangé) :

```ts
import { extraireMotsCles } from "@/lib/texte/mots-cles";
import type { Document } from "@/lib/documents/types";

interface CritereQualification {
  libelle: string;
  description: string | null;
}

// Classe les CV de la bibliothèque par pertinence pour une pièce CV
// donnée, en s'appuyant sur les critères de qualification du DAO dont
// le libellé/description partagent au moins un mot-clé avec le libellé
// de la pièce (ex. pièce "CV du Directeur des travaux" ↔ critère
// "Directeur des travaux : 10 ans d'expérience minimum"). Aucun critère
// ne matche : retourne la liste inchangée plutôt que de trier au hasard
// sans signal réel.
export function classerCvParPertinence(
  libelleExigence: string,
  criteresQualification: CritereQualification[],
  cvs: Document[],
): Document[] {
  const motsExigence = new Set(extraireMotsCles(libelleExigence));

  const criteresCorrespondants = criteresQualification.filter((critere) => {
    const motsCritere = extraireMotsCles(
      [critere.libelle, critere.description ?? ""].join(" "),
    );
    return motsCritere.some((mot) => motsExigence.has(mot));
  });

  if (criteresCorrespondants.length === 0) return cvs;

  const texteRequis = criteresCorrespondants
    .map((c) => [c.libelle, c.description ?? ""].join(" "))
    .join(" ");
  const motsRequis = [...new Set(extraireMotsCles(texteRequis))];

  return [...cvs].sort((a, b) => scoreCv(b, motsRequis) - scoreCv(a, motsRequis));
}

function scoreCv(cv: Document, motsRequis: string[]): number {
  if (!cv.contenu_markdown) return 0;
  const motsCv = new Set(extraireMotsCles(cv.contenu_markdown));
  return motsRequis.filter((mot) => motsCv.has(mot)).length;
}
```

`motsRequis` est dédupliqué (`Set`) avant le scoring pour éviter qu'un
mot répété dans plusieurs critères correspondants ne gonfle
artificiellement le score. Un CV sans `contenu_markdown` (extraction
jamais faite ou échouée) score `0` et se retrouve naturellement en fin
de liste — jamais d'exception.

## Changement 4 — Interface

**`appel-offres-detail.tsx`** : dans le bloc `piecesRequises.map`,
transmet en plus les critères de qualification (déjà calculés en
`criteresEvaluation` juste au-dessus, ligne 145) :

```tsx
<DocumentsExigence
  appelOffresId={appelOffres.id}
  exigenceId={exigence.id}
  libelleExigence={exigence.libelle}
  documentsAssocies={documentsParExigence[exigence.id] ?? []}
  bibliotheque={bibliotheque}
  modeleCvDisponible={appelOffres.modele_cv_path !== null}
  cvTransformeParDocument={cvTransformes}
  onCvTransforme={(documentId, cv) =>
    setCvTransformes((carte) => ({ ...carte, [documentId]: cv }))
  }
  documentIdEnCours={documentIdEnCours}
  onDocumentIdEnCoursChange={setDocumentIdEnCours}
  typeFormulaireStandard={identifierFormulaireStandard(exigence.libelle)}
  sectionFormulaire={sections.find((s) => s.titre === exigence.libelle)}
  criteresQualification={criteresEvaluation}
/>
```

**`documents-exigence.tsx`** : nouvelle prop `criteresQualification`, et
le calcul de `suggeres` passe par `classerCvParPertinence` uniquement
quand `typePrefere === "cv"` :

```tsx
const typePrefere = deviserTypeDocumentPrefere(libelleExigence);
const suggeresBrut = disponibles.filter((d) => d.type === typePrefere);
const suggeres =
  typePrefere === "cv"
    ? classerCvParPertinence(libelleExigence, criteresQualification, suggeresBrut)
    : suggeresBrut;
const autres = disponibles.filter((d) => d.type !== typePrefere);
```

Nouvel import : `import { classerCvParPertinence } from "@/lib/appels-offres/suggestion-document";`
(fichier déjà importé pour `deviserTypeDocumentPrefere`, un seul import
groupé).

Nouvelle prop dans la signature du composant :

```tsx
criteresQualification: { libelle: string; description: string | null }[];
```

## États et erreurs

- Aucun critère de qualification ne partage de mot-clé avec la pièce CV
  en cours : `suggeres` reste dans l'ordre actuel (celui de
  `bibliotheque`), comportement strictement identique à aujourd'hui.
- CV avec `contenu_markdown` null (extraction jamais faite/échouée) :
  score `0`, apparaît en fin de `groupeSuggestions`, jamais d'erreur.
- Exigence de type autre que `piece_requise`/CV : aucun changement,
  `classerCvParPertinence` n'est jamais appelée.
- Aucun `critere_evaluation` sur l'AO (`criteresEvaluation` vide) :
  `criteresCorrespondants` est toujours vide, `suggeres` reste inchangé.

## Tests

- `classerCvParPertinence` (TDD, ajouté au fichier existant
  `lib/appels-offres/suggestion-document.test.ts`, qui teste déjà
  `deviserTypeDocumentPrefere` — nouveau bloc `describe`, tests existants
  inchangés) :
  - Aucun critère ne partage de mot-clé avec `libelleExigence` : la
    liste de CV retournée est identique (même ordre) à celle passée en
    entrée.
  - Un critère correspond, deux CV en entrée dont un seul partage des
    mots-clés avec le critère : le CV pertinent est classé en premier.
  - Plusieurs critères correspondent : leur texte est combiné pour le
    scoring (un CV ne matchant qu'un des deux critères score quand même
    positivement).
  - CV avec `contenu_markdown` null : score `0`, ne lève pas d'exception,
    se retrouve en dernière position.
- `extraireMotsCles`/`calculerScoreCorrespondance*`
  (`lib/email/correspondance.test.ts`) : suite existante, doit passer
  sans aucune modification après le déplacement (Changement 1-2) —
  test de non-régression du module email.
- Aucun test sur `documents-exigence.tsx`/`appel-offres-detail.tsx`,
  cohérent avec le reste du projet (pas de test sur les composants UI).

## Hors périmètre

- Champ structuré de spécialité/domaine sur `document` (type CV) — le
  scoring reste texte↔texte sur `contenu_markdown`, pas de nouveau
  modèle de données.
- Lien manuel explicite critère↔pièce CV — l'inférence automatique par
  mots-clés est jugée suffisante pour ce sous-projet.
- Nouveau sous-groupe visuel « Meilleure correspondance » dans le
  `<Select>` — le réordonnancement de `groupeSuggestions` existant
  suffit.
- Tout appel IA pour affiner le score — mots-clés suffisent, à
  reconsidérer seulement si jugé insuffisant sur un cas réel.
