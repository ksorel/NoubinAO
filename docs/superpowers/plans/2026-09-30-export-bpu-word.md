# Export BPU dans le Word Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le bouton "Exporter" existant sur la page détail AO produit
désormais un `.docx` qui inclut le BPU (bordereau des prix unitaires,
offre financière) sous forme de tables, en plus du contenu technique déjà
exporté — un seul bouton, un seul fichier.

**Architecture:** `PlanExport` (`lib/appels-offres/export/plan.ts`) gagne
un champ `bpu` construit par `construirePlanExport` à partir de
`listerBpu` (déjà existant). `genererDocumentWord`
(`lib/appels-offres/export/docx.ts`) rend ce champ en tables `docx` après
la section "Critères d'évaluation". `formaterMontant`, dupliquée
aujourd'hui dans `formulaires-standards.ts`, est déplacée vers
`lib/appels-offres/bpu.ts` pour être réutilisée par `docx.ts` sans
duplication.

**Tech Stack:** TypeScript, paquet npm `docx` (déjà une dépendance,
`Table`/`TableRow`/`TableCell`/`TextRun` — aucune nouvelle dépendance),
Vitest (TDD), `mammoth` (déjà une dépendance, utilisé en vérification
manuelle pour relire le texte brut d'un `.docx` généré).

## Global Constraints

- Aucune nouvelle table de base de données, aucune nouvelle dépendance
  npm.
- Ligne BPU non chiffrée (`prix_unitaire === null`) : les cellules Prix
  unitaire et Montant affichent le texte **« à compléter »**, jamais un
  nombre.
- Aucun blocage à l'export si des lignes restent non chiffrées —
  informationnel seulement.
- Section BPU **omise entièrement** du document si aucune section BPU
  n'existe pour l'AO (`plan.bpu === null`) — pas de titre vide.
- Pyramide de coût (déboursé sec, marge, frais de structure) jamais
  exportée.
- Commits conventionnels (`feat:`, `test:`), un commit par tâche.
- **Ne jamais créer, modifier ou supprimer de données réelles dans le
  projet Supabase de production pendant ce plan** — un client pilote
  réel utilise activement l'application en ce moment (voir contexte).
  Toute vérification manuelle doit rester en mémoire (pas de DB) ou
  utiliser exclusivement des données fabriquées localement.

---

### Task 1: Déplacer `formaterMontant` vers `bpu.ts` (TDD)

**Files:**
- Modify: `lib/appels-offres/bpu.ts`
- Modify: `lib/appels-offres/bpu.test.ts`
- Modify: `lib/appels-offres/formulaires-standards.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `export function formaterMontant(montant: number): string` —
  consommée en Tâche 3 (`docx.ts`) et déjà consommée en interne par
  `formulaires-standards.ts` après cette tâche.

- [ ] **Step 1: Écrire les tests (échouent, la fonction n'est pas encore exportée de `bpu.ts`)**

Ajouter à la fin de `lib/appels-offres/bpu.test.ts` :

```typescript
import { formaterMontant } from "./bpu";

describe("formaterMontant", () => {
  it("insère des espaces comme séparateurs de milliers", () => {
    expect(formaterMontant(1234567)).toBe("1 234 567");
  });

  it("ne modifie pas un nombre inférieur à 1000", () => {
    expect(formaterMontant(500)).toBe("500");
  });

  it("gère zéro", () => {
    expect(formaterMontant(0)).toBe("0");
  });
});
```

(Ajouter l'import `formaterMontant` à l'import existant en haut du
fichier plutôt qu'un second import séparé — le fichier importe déjà
`sommerMontants` etc. depuis `"./bpu"`.)

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `npx vitest run lib/appels-offres/bpu.test.ts`
Expected: FAIL — `formaterMontant` n'est pas exporté de `./bpu`

- [ ] **Step 3: Ajouter la fonction dans `bpu.ts`**

Ajouter à la fin de `lib/appels-offres/bpu.ts` :

```typescript
export function formaterMontant(montant: number): string {
  return montant.toLocaleString("fr-FR").replace(/[  ]/g, " ");
}
```

(Copier exactement les deux caractères d'espace dans la classe de
caractères de la regex depuis la version actuelle de
`lib/appels-offres/formulaires-standards.ts:29-31` — l'un est une
espace normale, l'autre une espace insécable fine produite par
`toLocaleString("fr-FR")` ; les copier tel quel évite une régression
d'encodage.)

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `npx vitest run lib/appels-offres/bpu.test.ts`
Expected: PASS (tous les tests existants + les 3 nouveaux)

- [ ] **Step 5: Retirer la duplication dans `formulaires-standards.ts`**

Dans `lib/appels-offres/formulaires-standards.ts`, supprimer la
définition locale (lignes 29-31 actuelles) :

```typescript
function formaterMontant(montant: number): string {
  return montant.toLocaleString("fr-FR").replace(/[  ]/g, " ");
}
```

et ajouter en haut du fichier, avec les imports existants :

```typescript
import { formaterMontant } from "./bpu";
```

Le reste du fichier (`genererLettreSoumission` notamment) n'a besoin
d'aucun autre changement — `formaterMontant` est utilisée exactement
comme avant.

- [ ] **Step 6: Lancer la suite complète des tests de ce module**

Run: `npx vitest run lib/appels-offres/bpu.test.ts lib/appels-offres/formulaires-standards.test.ts`
Expected: PASS (aucune régression sur les tests existants de
`formulaires-standards.test.ts`, qui exercent `genererLettreSoumission`
indirectement)

- [ ] **Step 7: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 8: Commit**

```bash
git add lib/appels-offres/bpu.ts lib/appels-offres/bpu.test.ts lib/appels-offres/formulaires-standards.ts
git commit -m "refactor(bpu): déplace formaterMontant vers bpu.ts, retire la duplication"
```

---

### Task 2: Étendre `PlanExport` avec le champ `bpu` (TDD)

**Files:**
- Modify: `lib/appels-offres/export/plan.ts`
- Modify: `lib/appels-offres/export/plan.test.ts`

**Interfaces:**
- Consumes: `SectionBpu`, `LigneBpu` (`lib/appels-offres/types.ts`,
  existants — champs `id`, `titre`, `ordre` pour `SectionBpu` ;
  `id`, `section_bpu_id`, `code_article`, `designation`, `unite`,
  `quantite`, `prix_unitaire` pour `LigneBpu`) ; `calculerMontantLigne`,
  `sommerMontants` (`lib/appels-offres/bpu.ts`, existants).
- Produces: `PlanExport.bpu` avec la forme ci-dessous, et
  `construirePlanExport` accepte deux paramètres optionnels
  supplémentaires (défaut `[]`/`{}` — les appels existants dans
  `plan.test.ts` et, avant la Tâche 4, dans `actions.ts` continuent de
  fonctionner sans modification et produisent `bpu: null`). Consommé en
  Tâche 3 (`docx.ts`, lit `plan.bpu`) et Tâche 4 (`actions.ts`, passe les
  deux nouveaux arguments).

- [ ] **Step 1: Écrire les tests (échouent, le champ n'existe pas encore)**

Ajouter en haut de `lib/appels-offres/export/plan.test.ts`, avec les
imports existants :

```typescript
import type { AppelOffres, ExigenceAo, SectionDossier, SectionBpu, LigneBpu } from "../types";
```

Ajouter ces deux fonctions utilitaires juste après `creerSection` (avant
le `describe("construirePlanExport", ...)` existant) :

```typescript
function creerSectionBpu(overrides: Partial<SectionBpu> = {}): SectionBpu {
  return {
    id: "sbpu-1",
    appel_offres_id: "ao-1",
    titre: "Installation de chantier",
    ordre: 0,
    created_by: null,
    created_at: "2026-09-16T00:00:00Z",
    ...overrides,
  };
}

function creerLigneBpu(overrides: Partial<LigneBpu> = {}): LigneBpu {
  return {
    id: "lbpu-1",
    section_bpu_id: "sbpu-1",
    code_article: null,
    designation: "Amenée et repli du matériel",
    unite: "Ens",
    quantite: 1,
    prix_unitaire: 500000,
    debourse_sec: null,
    taux_frais_structure: null,
    ordre: 0,
    created_by: null,
    created_at: "2026-09-16T00:00:00Z",
    ...overrides,
  };
}
```

Ajouter ce nouveau `describe` à la fin du fichier, avant la fermeture du
fichier :

```typescript
describe("construirePlanExport — bpu", () => {
  it("renvoie bpu à null si aucune section BPU n'existe", () => {
    const appelOffres = creerAppelOffres();

    const plan = construirePlanExport(appelOffres, [], {}, [], new Date("2026-09-10T12:00:00Z"));

    expect(plan.bpu).toBeNull();
  });

  it("construit une section avec ses lignes et son total", () => {
    const appelOffres = creerAppelOffres();
    const section = creerSectionBpu();
    const ligne1 = creerLigneBpu({ id: "l1", quantite: 2, prix_unitaire: 1000 });
    const ligne2 = creerLigneBpu({ id: "l2", quantite: 3, prix_unitaire: 2000 });

    const plan = construirePlanExport(
      appelOffres,
      [],
      {},
      [],
      new Date("2026-09-10T12:00:00Z"),
      [section],
      { [section.id]: [ligne1, ligne2] },
    );

    expect(plan.bpu).toEqual({
      sections: [
        {
          titre: "Installation de chantier",
          lignes: [
            {
              codeArticle: null,
              designation: "Amenée et repli du matériel",
              unite: "Ens",
              quantite: 2,
              prixUnitaire: 1000,
              montant: 2000,
            },
            {
              codeArticle: null,
              designation: "Amenée et repli du matériel",
              unite: "Ens",
              quantite: 3,
              prixUnitaire: 2000,
              montant: 6000,
            },
          ],
          totalSection: 8000,
        },
      ],
      totalGeneral: 8000,
    });
  });

  it("inclut une ligne non chiffrée avec montant null, exclue du total", () => {
    const appelOffres = creerAppelOffres();
    const section = creerSectionBpu();
    const ligneChiffree = creerLigneBpu({ id: "l1", quantite: 2, prix_unitaire: 1000 });
    const ligneNonChiffree = creerLigneBpu({ id: "l2", quantite: 5, prix_unitaire: null });

    const plan = construirePlanExport(
      appelOffres,
      [],
      {},
      [],
      new Date("2026-09-10T12:00:00Z"),
      [section],
      { [section.id]: [ligneChiffree, ligneNonChiffree] },
    );

    expect(plan.bpu?.sections[0].lignes[1]).toEqual({
      codeArticle: null,
      designation: "Amenée et repli du matériel",
      unite: "Ens",
      quantite: 5,
      prixUnitaire: null,
      montant: null,
    });
    expect(plan.bpu?.sections[0].totalSection).toBe(2000);
  });

  it("calcule le total général comme la somme des totaux de section", () => {
    const appelOffres = creerAppelOffres();
    const section1 = creerSectionBpu({ id: "s1", titre: "Section 1" });
    const section2 = creerSectionBpu({ id: "s2", titre: "Section 2" });
    const ligne1 = creerLigneBpu({ id: "l1", section_bpu_id: "s1", quantite: 1, prix_unitaire: 1000 });
    const ligne2 = creerLigneBpu({ id: "l2", section_bpu_id: "s2", quantite: 1, prix_unitaire: 3000 });

    const plan = construirePlanExport(
      appelOffres,
      [],
      {},
      [],
      new Date("2026-09-10T12:00:00Z"),
      [section1, section2],
      { s1: [ligne1], s2: [ligne2] },
    );

    expect(plan.bpu?.totalGeneral).toBe(4000);
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `npx vitest run lib/appels-offres/export/plan.test.ts`
Expected: FAIL — `construirePlanExport` n'accepte pas ces arguments /
`plan.bpu` est `undefined`

- [ ] **Step 3: Étendre `plan.ts`**

Dans `lib/appels-offres/export/plan.ts`, remplacer l'import de types en
haut du fichier :

```typescript
import type { AppelOffres, ExigenceAo, SectionDossier } from "../types";
```

par :

```typescript
import type { AppelOffres, ExigenceAo, SectionDossier, SectionBpu, LigneBpu } from "../types";
import { calculerMontantLigne, sommerMontants } from "../bpu";
```

Étendre l'interface `PlanExport` (ajouter après `criteresEvaluation`) :

```typescript
export interface PlanExport {
  titre: string;
  acheteur: string | null;
  secteur: string | null;
  dateExport: string;
  sommaireAttendu: string[] | null;
  sectionsRedigees: Array<{ titre: string; contenu: string }>;
  piecesRequises: Array<{
    libelle: string;
    documents: Array<{ nom: string; type: string }>;
  }>;
  criteresEvaluation: Array<{
    libelle: string;
    ponderation: number | null;
  }>;
  bpu: {
    sections: Array<{
      titre: string;
      lignes: Array<{
        codeArticle: string | null;
        designation: string;
        unite: string;
        quantite: number;
        prixUnitaire: number | null;
        montant: number | null;
      }>;
      totalSection: number;
    }>;
    totalGeneral: number;
  } | null;
}
```

Modifier la signature de `construirePlanExport` et son corps :

```typescript
export function construirePlanExport(
  appelOffres: AppelOffres,
  exigences: ExigenceAo[],
  documentsParExigence: Record<string, Document[]>,
  sections: SectionDossier[],
  dateExport: Date,
  sectionsBpu: SectionBpu[] = [],
  lignesParSectionBpu: Record<string, LigneBpu[]> = {},
): PlanExport {
  const piecesRequises = exigences
    .filter((e) => e.type_exigence === "piece_requise")
    .map((exigence) => ({
      libelle: exigence.libelle,
      documents: (documentsParExigence[exigence.id] ?? []).map((document) => ({
        nom: document.nom,
        type: LIBELLES_TYPE_DOCUMENT[document.type],
      })),
    }));

  const criteresEvaluation = exigences
    .filter((e) => e.type_exigence === "critere_evaluation")
    .map((exigence) => ({
      libelle: exigence.libelle,
      ponderation: exigence.ponderation,
    }));

  const sectionsRedigees = sections
    .filter((section) => section.statut === "validee" && section.contenu !== null)
    .map((section) => ({
      titre: section.titre,
      contenu: section.contenu as string,
    }));

  const bpu =
    sectionsBpu.length === 0
      ? null
      : {
          sections: sectionsBpu.map((section) => {
            const lignes = lignesParSectionBpu[section.id] ?? [];
            return {
              titre: section.titre,
              lignes: lignes.map((ligne) => ({
                codeArticle: ligne.code_article,
                designation: ligne.designation,
                unite: ligne.unite,
                quantite: ligne.quantite,
                prixUnitaire: ligne.prix_unitaire,
                montant: calculerMontantLigne(ligne),
              })),
              totalSection: sommerMontants(lignes),
            };
          }),
          totalGeneral: sommerMontants(
            sectionsBpu.flatMap((section) => lignesParSectionBpu[section.id] ?? []),
          ),
        };

  return {
    titre: appelOffres.titre ?? appelOffres.fichier_dao_nom_original ?? "Appel d'offres sans titre",
    acheteur: appelOffres.acheteur,
    secteur: appelOffres.secteur,
    dateExport: formaterDate(dateExport),
    sommaireAttendu: appelOffres.sommaire_attendu,
    sectionsRedigees,
    piecesRequises,
    criteresEvaluation,
    bpu,
  };
}
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `npx vitest run lib/appels-offres/export/plan.test.ts`
Expected: PASS (tous les tests existants inchangés + les 4 nouveaux)

- [ ] **Step 5: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/export/plan.ts lib/appels-offres/export/plan.test.ts
git commit -m "feat(export): étend PlanExport avec les sections BPU"
```

---

### Task 3: Rendre le BPU en tables dans le Word

**Files:**
- Modify: `lib/appels-offres/export/docx.ts`

**Interfaces:**
- Consumes: `PlanExport.bpu` (Tâche 2) ; `formaterMontant`
  (`lib/appels-offres/bpu.ts`, Tâche 1).
- Produces: rien consommé par une tâche ultérieure — le rendu est la
  dernière étape de la chaîne d'export.

Pas de test unitaire — cohérent avec le reste de ce fichier (jamais
testé directement, la logique de préparation des données est dans
`plan.ts`, déjà testée en Tâche 2). Vérification manuelle en Step 4
ci-dessous, sans toucher à la base de données réelle (voir contrainte
globale).

- [ ] **Step 1: Étendre les imports de `docx.ts`**

Remplacer la première ligne de `lib/appels-offres/export/docx.ts` :

```typescript
import { Document, HeadingLevel, Packer, Paragraph } from "docx";
```

par :

```typescript
import { Document, HeadingLevel, Packer, Paragraph, Table, TableRow, TableCell, TextRun } from "docx";
```

Ajouter, avec l'import de `PlanExport` :

```typescript
import { formaterMontant } from "../bpu";
```

- [ ] **Step 2: Ajouter le rendu du BPU**

Dans `genererDocumentWord`, juste après le bloc existant de rendu des
"Critères d'évaluation" (après la boucle `for (const critere of
plan.criteresEvaluation)` et avant `const document = new Document(...)`),
ajouter :

```typescript
  if (plan.bpu) {
    enfants.push(
      new Paragraph({ text: "Bordereau des prix unitaires", heading: HeadingLevel.HEADING_1 }),
    );

    for (const section of plan.bpu.sections) {
      enfants.push(new Paragraph({ text: section.titre, heading: HeadingLevel.HEADING_2 }));

      const avecCode = section.lignes.some((ligne) => ligne.codeArticle !== null);
      const entetes = avecCode
        ? ["Code", "Désignation", "Unité", "Quantité", "Prix unitaire", "Montant"]
        : ["Désignation", "Unité", "Quantité", "Prix unitaire", "Montant"];

      const ligneEntete = new TableRow({
        children: entetes.map(
          (texte) => new TableCell({ children: [new Paragraph({ text: texte })] }),
        ),
      });

      const lignesTable = section.lignes.map((ligne) => {
        const prixTexte =
          ligne.prixUnitaire !== null ? `${formaterMontant(ligne.prixUnitaire)} FCFA` : "à compléter";
        const montantTexte =
          ligne.montant !== null ? `${formaterMontant(ligne.montant)} FCFA` : "à compléter";
        const cellules = avecCode
          ? [ligne.codeArticle ?? "", ligne.designation, ligne.unite, String(ligne.quantite), prixTexte, montantTexte]
          : [ligne.designation, ligne.unite, String(ligne.quantite), prixTexte, montantTexte];
        return new TableRow({
          children: cellules.map((texte) => new TableCell({ children: [new Paragraph({ text: texte })] })),
        });
      });

      enfants.push(new Table({ rows: [ligneEntete, ...lignesTable] }));
      enfants.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Total section : ${formaterMontant(section.totalSection)} FCFA`,
              bold: true,
            }),
          ],
        }),
      );
    }

    enfants.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Total général : ${formaterMontant(plan.bpu.totalGeneral)} FCFA`,
            bold: true,
          }),
        ],
      }),
    );
  }
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Vérification manuelle (sans base de données réelle)**

Écrire un script `tsx` jetable qui appelle directement
`construirePlanExport` puis `genererDocumentWord` avec des données
entièrement fabriquées en mémoire (aucun accès Supabase), écrit le
`.docx` obtenu dans un fichier local, puis relit son texte brut avec
`mammoth` (déjà une dépendance du projet) pour vérifier que les
marqueurs attendus sont bien présents — sans avoir besoin de Word
installé sur la machine.

```bash
npx tsx -e "
import { construirePlanExport } from './lib/appels-offres/export/plan';
import { genererDocumentWord } from './lib/appels-offres/export/docx';
import { writeFileSync } from 'fs';
import mammoth from 'mammoth';

async function main() {
  const appelOffres = {
    id: 'ao-1', entreprise_id: 'ent-1', titre: 'AO de test', acheteur: 'Acheteur test',
    secteur: 'btp', date_limite: null, montant_caution: null, contact_retrait: null,
    statut_pipeline: 'identifie', statut_traitement: 'termine', erreur_traitement: null,
    fichier_dao_path: null, fichier_dao_nom_original: null, modele_cv_path: null,
    modele_cv_nom_original: null, modele_cv_markdown: null, dao_markdown: null,
    sommaire_attendu: null, assigne_a: null, created_by: null, created_at: '2026-09-30T00:00:00Z',
  };

  const sectionBpu = { id: 's1', appel_offres_id: 'ao-1', titre: 'Installation de chantier', ordre: 0, created_by: null, created_at: '2026-09-30T00:00:00Z' };
  const ligneChiffree = { id: 'l1', section_bpu_id: 's1', code_article: 'A1', designation: 'Amenée matériel', unite: 'Ens', quantite: 1, prix_unitaire: 500000, debourse_sec: null, taux_frais_structure: null, ordre: 0, created_by: null, created_at: '2026-09-30T00:00:00Z' };
  const ligneNonChiffree = { id: 'l2', section_bpu_id: 's1', code_article: 'A2', designation: 'Repli matériel', unite: 'Ens', quantite: 1, prix_unitaire: null, debourse_sec: null, taux_frais_structure: null, ordre: 1, created_by: null, created_at: '2026-09-30T00:00:00Z' };

  const plan = construirePlanExport(appelOffres as any, [], {}, [], new Date('2026-09-30T00:00:00Z'), [sectionBpu as any], { s1: [ligneChiffree as any, ligneNonChiffree as any] });
  const buffer = await genererDocumentWord(plan);
  writeFileSync('test-export-bpu-verification.docx', buffer);

  const { value: texte } = await mammoth.extractRawText({ buffer });
  console.log('--- Texte extrait ---');
  console.log(texte);

  const marqueurs = ['Bordereau des prix unitaires', 'Installation de chantier', 'Amenée matériel', '500 000 FCFA', 'à compléter', 'Total section : 500 000 FCFA', 'Total général : 500 000 FCFA'];
  for (const marqueur of marqueurs) {
    console.log(texte.includes(marqueur) ? \`OK: \${marqueur}\` : \`MANQUANT: \${marqueur}\`);
  }
}

main();
"
```

Expected: chaque marqueur listé affiche `OK:` — en particulier
`à compléter` doit apparaître (ligne non chiffrée) et **aucun montant
à 0 FCFA** ne doit apparaître pour cette ligne. Si un `MANQUANT:`
apparaît, corriger le rendu avant de continuer.

Aucune donnée n'est écrite en base — ce script n'importe que des
fonctions pures/de rendu, jamais de client Supabase.

Supprimer le fichier généré une fois la vérification faite (ne jamais le
committer) :

```bash
rm test-export-bpu-verification.docx
```

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/export/docx.ts
git commit -m "feat(export): rend le BPU en tables dans le document Word"
```

---

### Task 4: Brancher `listerBpu` dans `exporterDossierReponse` + vérification finale

**Files:**
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: `listerBpu` (déjà importée dans ce fichier, ligne 29) ;
  `construirePlanExport` avec sa nouvelle signature (Tâche 2).
- Produces: rien — dernière tâche du plan.

- [ ] **Step 1: Brancher `listerBpu` dans `exporterDossierReponse`**

Dans `lib/appels-offres/actions.ts`, localiser `exporterDossierReponse`
(autour de la ligne 397) et remplacer :

```typescript
  const plan = construirePlanExport(
    resultat.appelOffres,
    resultat.exigences,
    resultat.documentsParExigence,
    resultat.sections,
    new Date(),
  );
```

par :

```typescript
  const { sections: sectionsBpu, lignesParSection: lignesParSectionBpu } =
    await listerBpu(appelOffresId);

  const plan = construirePlanExport(
    resultat.appelOffres,
    resultat.exigences,
    resultat.documentsParExigence,
    resultat.sections,
    new Date(),
    sectionsBpu,
    lignesParSectionBpu,
  );
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Vérifier le lint**

Run: `npx eslint lib/appels-offres/actions.ts lib/appels-offres/export/docx.ts lib/appels-offres/export/plan.ts lib/appels-offres/bpu.ts lib/appels-offres/formulaires-standards.ts`
Expected: aucune erreur.

- [ ] **Step 4: Lancer la suite de tests complète**

Run: `npx vitest run`
Expected: tous les tests passent, y compris les 3 nouveaux de
`bpu.test.ts` (Tâche 1) et les 4 nouveaux de `plan.test.ts` (Tâche 2).

- [ ] **Step 5: Vérification manuelle — IMPORTANT, lire avant d'agir**

**Ne pas créer, modifier ou supprimer de données dans le projet
Supabase de production** — un client pilote réel utilise activement
l'application (voir contrainte globale du plan). La vérification de
bout en bout du bouton "Exporter" contre un AO réel avec du vrai BPU
rempli (connexion, clic sur le bouton, téléchargement, ouverture du
`.docx`) est **déférée au contrôleur/humain**, qui choisira un compte
qui n'interfère pas avec le client pilote (compte de test dédié, ou
moment où le pilote n'est pas en session).

À la place, vérifier uniquement que le code compile et que
`exporterDossierReponse` appelle bien `listerBpu` avec le bon
`appelOffresId` par une relecture attentive du diff (pas d'exécution) —
la logique métier elle-même (mapping DB → `PlanExport.bpu` → rendu
Word) est déjà entièrement vérifiée par les Tâches 1-3 (tests
automatisés + script de vérification hors-DB).

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/actions.ts
git commit -m "feat(export): inclut le BPU dans le dossier de réponse exporté"
```
