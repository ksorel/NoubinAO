# Suggestion de CV pertinents par critère de qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classer les CV suggérés pour une pièce requise par pertinence réelle vis-à-vis des critères de qualification du DAO, en réutilisant le patron de scoring texte↔texte déjà éprouvé pour la correspondance email.

**Architecture:** Extraction de `extraireMotsCles` (Module 6, `lib/email/correspondance.ts`) vers un module partagé `lib/texte/mots-cles.ts`. Nouvelle fonction pure `classerCvParPertinence` dans `lib/appels-offres/suggestion-document.ts` qui infère les critères correspondant à une pièce CV par chevauchement de mots-clés, puis classe les CV de la bibliothèque par chevauchement avec leur `contenu_markdown`. Branchement client-side pur dans `documents-exigence.tsx` — aucune Server Action, aucun changement de schéma.

## Global Constraints

- Zéro appel IA — chevauchement de mots-clés uniquement.
- Aucun critère de qualification ne partage de mot-clé avec la pièce CV : la liste de CV reste inchangée (pas de tri sans signal réel).
- `lib/email/correspondance.ts` et `lib/email/correspondance.test.ts` doivent continuer de fonctionner **sans aucune modification de test** après le déplacement de `extraireMotsCles` — réexportation, pas de rupture.
- Reclassement strictement limité aux pièces de type CV (`deviserTypeDocumentPrefere(...) === "cv"`) — les autres types de pièces ne changent pas de comportement.
- Un CV avec `contenu_markdown` null score `0`, ne lève jamais d'exception.
- Vérifier `npx tsc --noEmit`, `npx vitest run`, `npx next build` avant de clore chaque tâche.
- Commits conventionnels (`feat:`, `refactor:`).

---

### Task 1: Module partagé de mots-clés + classement des CV (TDD)

**Files:**
- Create: `lib/texte/mots-cles.ts`
- Modify: `lib/email/correspondance.ts`
- Modify: `lib/appels-offres/suggestion-document.ts`
- Modify: `lib/appels-offres/suggestion-document.test.ts`

**Interfaces:**
- Produces: `extraireMotsCles(texte: string): string[]` (`lib/texte/mots-cles.ts`) — consommée par `lib/email/correspondance.ts` (réexport) et par `classerCvParPertinence` dans ce même task.
- Produces: `classerCvParPertinence(libelleExigence: string, criteresQualification: {libelle: string; description: string | null}[], cvs: Document[]): Document[]` (`lib/appels-offres/suggestion-document.ts`) — consommée par Task 2 dans `documents-exigence.tsx`.

- [ ] **Step 1: Créer le module partagé `lib/texte/mots-cles.ts`**

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

- [ ] **Step 2: Adapter `lib/email/correspondance.ts` pour réexporter depuis le module partagé**

État actuel du fichier (lignes 1-12) :

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

Remplacer par :

```ts
export { extraireMotsCles } from "@/lib/texte/mots-cles";
```

Le reste du fichier (`QUARANTE_CINQ_JOURS_MS`, les interfaces, `calculerScoreCorrespondanceDetaille`, `calculerScoreCorrespondance`) reste **strictement inchangé** — ces fonctions utilisent déjà `extraireMotsCles` par son nom.

- [ ] **Step 3: Lancer les tests du module email, vérifier l'absence de régression**

Run: `npx vitest run lib/email/correspondance.test.ts`
Expected: PASS, tous les tests existants verts, sans aucune modification du fichier de test (il importe `extraireMotsCles` depuis `"./correspondance"`, qui la réexporte désormais).

- [ ] **Step 4: Écrire les tests qui échouent pour `classerCvParPertinence`**

Le fichier `lib/appels-offres/suggestion-document.test.ts` existant (4 tests sur `deviserTypeDocumentPrefere`) reste inchangé. Ajouter un nouvel import et un nouveau bloc `describe` à la fin du fichier :

Import à ajouter en haut du fichier, après l'import existant :

```ts
import { describe, expect, it } from "vitest";
import { deviserTypeDocumentPrefere, classerCvParPertinence } from "./suggestion-document";
```

(remplace la ligne d'import existante `import { deviserTypeDocumentPrefere } from "./suggestion-document";`)

Nouveau bloc `describe`, ajouté après le `describe("deviserTypeDocumentPrefere", ...)` existant :

```ts
function creerCv(id: string, nom: string, contenuMarkdown: string | null) {
  return {
    id,
    entreprise_id: "e1",
    type: "cv" as const,
    nom,
    fichier_path: `documents/${id}.pdf`,
    fichier_nom_original: `${nom}.pdf`,
    mime_type: "application/pdf",
    taille_octets: 1024,
    date_expiration: null,
    contenu_markdown: contenuMarkdown,
    source_ocr: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("classerCvParPertinence", () => {
  it("ne change pas l'ordre quand aucun critère ne partage de mot-clé avec la pièce", () => {
    const cvs = [
      creerCv("cv1", "CV Kouassi", "Ingénieur électricité, 8 ans d'expérience"),
      creerCv("cv2", "CV Traoré", "Chef comptable, 5 ans d'expérience"),
    ];
    const criteres = [
      { libelle: "Chiffre d'affaires minimum", description: "500 000 000 FCFA sur 3 ans" },
    ];

    const resultat = classerCvParPertinence("CV du Directeur des travaux", criteres, cvs);
    expect(resultat).toEqual(cvs);
  });

  it("classe en premier le CV dont le contenu correspond le mieux au critère matché", () => {
    const cvGenieCivil = creerCv(
      "cv1",
      "CV Kouassi",
      "Ingénieur génie civil, spécialiste travaux routiers, 12 ans d'expérience",
    );
    const cvComptable = creerCv("cv2", "CV Traoré", "Chef comptable, 5 ans d'expérience");
    const criteres = [
      {
        libelle: "Directeur des travaux",
        description: "Ingénieur génie civil, minimum 10 ans d'expérience travaux routiers",
      },
    ];

    const resultat = classerCvParPertinence(
      "CV du Directeur des travaux",
      criteres,
      [cvComptable, cvGenieCivil],
    );
    expect(resultat[0].id).toBe("cv1");
  });

  it("combine le texte de plusieurs critères correspondants pour le scoring", () => {
    const cv = creerCv("cv1", "CV Kouassi", "Ingénieur génie civil, travaux routiers, 12 ans");
    const criteres = [
      { libelle: "Directeur des travaux", description: "Ingénieur génie civil requis" },
      { libelle: "Expérience travaux routiers", description: "Minimum 10 ans" },
    ];

    const resultat = classerCvParPertinence("CV du Directeur des travaux", criteres, [cv]);
    expect(resultat).toEqual([cv]);
  });

  it("attribue un score de 0 à un CV sans contenu_markdown, sans lever d'exception", () => {
    const cvSansContenu = creerCv("cv1", "CV Kouassi", null);
    const cvAvecContenu = creerCv(
      "cv2",
      "CV Traoré",
      "Ingénieur génie civil, travaux routiers, 10 ans",
    );
    const criteres = [
      { libelle: "Directeur des travaux", description: "Ingénieur génie civil, travaux routiers" },
    ];

    expect(() =>
      classerCvParPertinence("CV du Directeur des travaux", criteres, [cvSansContenu, cvAvecContenu]),
    ).not.toThrow();

    const resultat = classerCvParPertinence(
      "CV du Directeur des travaux",
      criteres,
      [cvSansContenu, cvAvecContenu],
    );
    expect(resultat[0].id).toBe("cv2");
  });

  it("retourne la liste inchangée quand il n'y a aucun critère de qualification du tout", () => {
    const cvs = [creerCv("cv1", "CV Kouassi", "Ingénieur génie civil")];
    const resultat = classerCvParPertinence("CV du Directeur des travaux", [], cvs);
    expect(resultat).toEqual(cvs);
  });
});
```

- [ ] **Step 5: Lancer les tests, vérifier l'échec**

Run: `npx vitest run lib/appels-offres/suggestion-document.test.ts`
Expected: FAIL — `classerCvParPertinence` n'existe pas encore (erreur d'import).

- [ ] **Step 6: Implémenter `classerCvParPertinence`**

Ajouter à la fin de `lib/appels-offres/suggestion-document.ts` (le fichier garde son import et sa fonction `deviserTypeDocumentPrefere` existants, inchangés) :

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

Le fichier `lib/appels-offres/suggestion-document.ts` complet doit maintenant contenir, dans cet ordre : l'import de `TypeDocument` existant, `deviserTypeDocumentPrefere` (inchangée), puis les nouveaux imports (`extraireMotsCles`, `Document`), l'interface `CritereQualification`, `classerCvParPertinence`, et `scoreCv`.

- [ ] **Step 7: Lancer les tests, vérifier le succès**

Run: `npx vitest run lib/appels-offres/suggestion-document.test.ts`
Expected: PASS — les 4 tests existants sur `deviserTypeDocumentPrefere` et les 5 nouveaux sur `classerCvParPertinence`, 9/9.

- [ ] **Step 8: Vérifier l'ensemble**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

Run: `npx vitest run`
Expected: suite complète verte (module email inclus, aucune régression).

- [ ] **Step 9: Commit**

```bash
git add lib/texte/mots-cles.ts lib/email/correspondance.ts lib/appels-offres/suggestion-document.ts lib/appels-offres/suggestion-document.test.ts
git commit -m "feat: classement des CV par pertinence via mots-clés partagés (TDD)"
```

---

### Task 2: Branchement dans l'interface

**Files:**
- Modify: `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`
- Modify: `app/(app)/appels-offres/[id]/documents-exigence.tsx`

**Interfaces:**
- Consumes: `classerCvParPertinence` (Task 1, `lib/appels-offres/suggestion-document.ts`).

- [ ] **Step 1: Passer `criteresEvaluation` à `DocumentsExigence`**

Dans `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`, le rendu de `<DocumentsExigence>` (dans le bloc `piecesRequises.map`) est actuellement :

```tsx
                        <div className="mt-2">
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
                          />
                        </div>
```

Remplacer par (ajoute `criteresQualification={criteresEvaluation}`) :

```tsx
                        <div className="mt-2">
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
                        </div>
```

`criteresEvaluation` est déjà calculé juste au-dessus dans ce fichier (ligne 145 : `const criteresEvaluation = exigences.filter((e) => e.type_exigence === "critere_evaluation");`) — aucun nouveau calcul nécessaire, `ExigenceAo` a déjà les champs `libelle`/`description` requis par la prop.

- [ ] **Step 2: Accepter la nouvelle prop et brancher le classement dans `documents-exigence.tsx`**

État actuel des imports (lignes 17-27) :

```tsx
import {
  associerDocumentAExigence,
  dissocierDocumentAExigence,
  genererCvTransforme,
  genererUrlTelechargementCvTransforme,
} from "@/lib/appels-offres/actions";
import { deviserTypeDocumentPrefere } from "@/lib/appels-offres/suggestion-document";
import type { Document } from "@/lib/documents/types";
import type { CvTransforme, SectionDossier } from "@/lib/appels-offres/types";
import type { TypeFormulaireStandard } from "@/lib/appels-offres/formulaires-standards";
import { FormulaireStandard } from "./formulaire-standard";
```

Remplacer la ligne d'import de `suggestion-document` :

```tsx
import { deviserTypeDocumentPrefere, classerCvParPertinence } from "@/lib/appels-offres/suggestion-document";
```

État actuel de la signature du composant (lignes 29-64) — ajouter `criteresQualification` à la destructuration et au type, juste après `sectionFormulaire` :

```tsx
export function DocumentsExigence({
  appelOffresId,
  exigenceId,
  libelleExigence,
  documentsAssocies: documentsAssociesInitial,
  bibliotheque,
  modeleCvDisponible,
  cvTransformeParDocument,
  onCvTransforme,
  documentIdEnCours,
  onDocumentIdEnCoursChange,
  typeFormulaireStandard,
  sectionFormulaire,
  criteresQualification,
}: {
  appelOffresId: string;
  exigenceId: string;
  libelleExigence: string;
  documentsAssocies: Document[];
  bibliotheque: Document[];
  modeleCvDisponible: boolean;
  cvTransformeParDocument: Record<string, CvTransforme>;
  onCvTransforme: (documentId: string, cv: CvTransforme) => void;
  // Levé au parent (et non local à cette instance) : un même CV peut être
  // associé à plusieurs exigences, donc plusieurs instances de
  // DocumentsExigence peuvent rendre le même document. Sans cet état
  // partagé, une instance ne sait pas qu'une autre a déjà déclenché une
  // génération pour ce document, et peut redéclencher un second appel
  // Claude payant pour la même transformation pendant que le premier est
  // encore en cours.
  documentIdEnCours: string | null;
  onDocumentIdEnCoursChange: (documentId: string | null) => void;
  // Calculé par le parent (identifierFormulaireStandard(exigence.libelle))
  // pour éviter de dupliquer l'import de détection dans ce composant.
  typeFormulaireStandard: TypeFormulaireStandard | null;
  sectionFormulaire: SectionDossier | undefined;
  // Utilisé uniquement quand cette pièce est de type CV, pour classer
  // les suggestions par pertinence — voir classerCvParPertinence.
  criteresQualification: { libelle: string; description: string | null }[];
}) {
```

État actuel du calcul de `suggeres` (lignes 94-98) :

```tsx
  const idsAssocies = new Set(documentsAssocies.map((d) => d.id));
  const disponibles = bibliotheque.filter((d) => !idsAssocies.has(d.id));
  const typePrefere = deviserTypeDocumentPrefere(libelleExigence);
  const suggeres = disponibles.filter((d) => d.type === typePrefere);
  const autres = disponibles.filter((d) => d.type !== typePrefere);
```

Remplacer par :

```tsx
  const idsAssocies = new Set(documentsAssocies.map((d) => d.id));
  const disponibles = bibliotheque.filter((d) => !idsAssocies.has(d.id));
  const typePrefere = deviserTypeDocumentPrefere(libelleExigence);
  const suggeresBrut = disponibles.filter((d) => d.type === typePrefere);
  const suggeres =
    typePrefere === "cv"
      ? classerCvParPertinence(libelleExigence, criteresQualification, suggeresBrut)
      : suggeresBrut;
  const autres = disponibles.filter((d) => d.type !== typePrefere);
```

- [ ] **Step 3: Vérifier l'ensemble**

Run: `npx tsc --noEmit`
Expected: aucune erreur (la nouvelle prop `criteresQualification` doit être fournie par tous les appelants de `DocumentsExigence` — un seul dans le code de production, mis à jour au Step 1).

Run: `npx vitest run`
Expected: suite complète verte, aucune régression.

Run: `npx next build`
Expected: build réussi.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/appels-offres/\[id\]/appel-offres-detail.tsx app/\(app\)/appels-offres/\[id\]/documents-exigence.tsx
git commit -m "feat: branche le classement des CV par pertinence dans le détail AO"
```

---

## Self-Review Notes

- **Spec coverage** : les 4 changements de la spec (module partagé, réexport email, fonction de classement + tests, branchement UI) sont couverts par les 2 tâches. Aucun requirement de la spec sans tâche correspondante.
- **Placeholder scan** : aucun — chaque étape porte le code exact avant/après.
- **Type consistency** : `criteresQualification: { libelle: string; description: string | null }[]` est identique dans la spec, la signature de `classerCvParPertinence` (Task 1) et la prop de `DocumentsExigence` (Task 2) — `ExigenceAo[]` (type réel de `criteresEvaluation` dans `appel-offres-detail.tsx`) satisfait structurellement ce type, aucune conversion nécessaire.
- **Rétrocompatibilité module email vérifiée** : Task 1 Step 3 exécute la suite de tests email existante avant même d'écrire le nouveau code de `suggestion-document.ts`, isolant explicitement tout risque de régression du déplacement.
- **Fichier de test existant préservé** : Task 1 confirmé que `lib/appels-offres/suggestion-document.test.ts` existe déjà (4 tests sur `deviserTypeDocumentPrefere`) — le plan ajoute, ne recrée pas.
