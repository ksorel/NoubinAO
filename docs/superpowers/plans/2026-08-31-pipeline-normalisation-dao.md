# Pipeline de normalisation DAO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer le pipeline de normalisation/extraction de DAO validé par le spike (`scripts/dao-spike/`) vers du code `lib/` réutilisable et testé, en étendant l'extraction aux champs `titre`/`acheteur`/`secteur`/`montant_caution`/`date_limite` (ISO 8601) et en ajoutant le support DOCX en plus du PDF — sans upload, sans Server Action, sans écriture en base.

**Architecture:** Un nouveau dossier `lib/appels-offres/normalisation/` avec sept fichiers à responsabilité unique (types partagés, structuration Markdown, schéma Zod, extraction PDF+OCR, conversion DOCX, point d'entrée de normalisation, extraction IA). Le chemin `pandoc` du spike est abandonné (indisponible en production Vercel). Un script de vérification qualitative manuelle remplace `scripts/dao-spike/`, qui est supprimé en fin de plan.

**Tech Stack:** TypeScript, Zod, `pdf-parse`, `pdfjs-dist`, `@napi-rs/canvas`, `@anthropic-ai/sdk`, `mammoth` (nouveau), `turndown` (nouveau), Vitest.

## Global Constraints

- L'extraction couvre `titre`, `acheteur`, `secteur`, `montant_caution`, `date_limite` (format ISO 8601 UTC, ex. `2026-11-03T12:00:00Z`) en plus de `sommaire_attendu` et des exigences — champs jamais extraits par le spike, à vérifier qualitativement (voir Task 7).
- Le schéma Zod de sortie utilise directement les noms de champs de `AppelOffres`/`ExigenceAo` (`lib/appels-offres/types.ts`) : un tableau `exigences` plat discriminé par `type_exigence`, pas deux tableaux séparés.
- `pandoc` est définitivement retiré du pipeline (indisponible sur les fonctions serverless Vercel en production) — ne pas le réintroduire.
- Support DOCX ajouté (`mammoth` + `turndown`), limité au `.docx` moderne — le `.doc` legacy n'est pas supporté par `mammoth`.
- Tout le nouveau code vit dans `lib/appels-offres/normalisation/`.
- Ce sous-projet ne fait aucune Server Action, aucun upload réel, aucune écriture en base — pure transformation `buffer + mimeType → données extraites`.
- `scripts/dao-spike/` est supprimé en fin de plan (Task 7), remplacé par `scripts/verification-dao/`.

---

### Task 1: `types.ts` + `markdown.ts` — types partagés et structuration Markdown

**Files:**
- Create: `lib/appels-offres/normalisation/types.ts`
- Create: `lib/appels-offres/normalisation/markdown.ts`
- Test: `lib/appels-offres/normalisation/markdown.test.ts`

**Interfaces:**
- Consumes: rien (première tâche, aucune dépendance interne).
- Produces:
  - `types.ts` : `export interface PageTexte { numero: number; texte: string }` — consommé par Task 3 (`pdf.ts`).
  - `markdown.ts` : `export interface SectionMarkdown { titre: string; contenu: string }`, `export function insererMarqueursTitres(texte: string): string`, `export function structurerEnMarkdownHeuristique(pages: PageTexte[]): string`, `export function decouperParSection(markdown: string): SectionMarkdown[]` — consommés par Task 3 (`pdf.ts` importe `PageTexte`), Task 4 (`docx.ts` n'importe rien d'ici), Task 5 (`normaliser.ts`), Task 6 (`extraire.ts` importe `SectionMarkdown`).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `lib/appels-offres/normalisation/markdown.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
  decouperParSection,
  insererMarqueursTitres,
  structurerEnMarkdownHeuristique,
} from "./markdown";
import type { PageTexte } from "./types";

describe("insererMarqueursTitres", () => {
  it("insère un marqueur ## devant chaque titre connu rencontré", () => {
    const resultat = insererMarqueursTitres("AVIS D'APPEL D'OFFRES Contenu de l'avis.");
    expect(resultat).toContain("## AVIS D'APPEL D'OFFRES");
  });

  it("insère un marqueur pour plusieurs titres dans le même texte", () => {
    const resultat = insererMarqueursTitres(
      "AVIS D'APPEL D'OFFRES Contenu. DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES Autre contenu.",
    );
    expect(resultat).toContain("## AVIS D'APPEL D'OFFRES");
    expect(resultat).toContain("## DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES");
  });

  it("laisse le texte inchangé si aucun titre connu n'est présent", () => {
    const resultat = insererMarqueursTitres("Texte sans titre connu.");
    expect(resultat).toBe("Texte sans titre connu.");
  });
});

describe("structurerEnMarkdownHeuristique", () => {
  it("applique l'insertion de marqueurs à chaque page et les concatène", () => {
    const pages: PageTexte[] = [
      { numero: 1, texte: "AVIS D'APPEL D'OFFRES Contenu de l'avis." },
      { numero: 2, texte: "DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES Contenu du DPAO." },
    ];

    const markdown = structurerEnMarkdownHeuristique(pages);

    expect(markdown).toContain("## AVIS D'APPEL D'OFFRES");
    expect(markdown).toContain("## DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES");
  });
});

describe("decouperParSection", () => {
  it("découpe un Markdown en sections par titre ##", () => {
    const markdown = [
      "## AVIS D'APPEL D'OFFRES",
      "Contenu de l'AAO.",
      "## DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES",
      "Contenu du DPAO.",
    ].join("\n");

    const sections = decouperParSection(markdown);

    expect(sections).toHaveLength(2);
    expect(sections[0].titre).toBe("AVIS D'APPEL D'OFFRES");
    expect(sections[0].contenu).toContain("Contenu de l'AAO.");
    expect(sections[1].titre).toBe("DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES");
  });

  it("place le contenu avant le premier titre dans une section Introduction", () => {
    const markdown = "Texte avant tout titre.\n## PREMIER TITRE\nContenu.";
    const sections = decouperParSection(markdown);
    expect(sections[0].titre).toBe("Introduction");
    expect(sections[0].contenu).toContain("Texte avant tout titre.");
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run lib/appels-offres/normalisation/markdown.test.ts`

Expected: FAIL — `./markdown` et `./types` n'existent pas encore.

- [ ] **Step 3: Créer `lib/appels-offres/normalisation/types.ts`**

```ts
export interface PageTexte {
  numero: number;
  texte: string;
}
```

- [ ] **Step 4: Créer `lib/appels-offres/normalisation/markdown.ts`**

```ts
import type { PageTexte } from "./types";

export interface SectionMarkdown {
  titre: string;
  contenu: string;
}

const TITRES_CONNUS = [
  "AVIS D'APPEL D'OFFRES",
  "INSTRUCTIONS AUX SOUMISSIONNAIRES",
  "DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES",
  "CAHIER DES CLAUSES ADMINISTRATIVES GÉNÉRALES",
  "CAHIER DES CLAUSES ADMINISTRATIVES PARTICULIÈRES",
  "SOMMAIRE ATTENDU DE L'OFFRE",
];

export function insererMarqueursTitres(texte: string): string {
  let resultat = texte;
  for (const titre of TITRES_CONNUS) {
    resultat = resultat.split(titre).join(`\n## ${titre}\n`);
  }
  return resultat;
}

export function structurerEnMarkdownHeuristique(pages: PageTexte[]): string {
  return pages.map((page) => insererMarqueursTitres(page.texte)).join("\n\n");
}

export function decouperParSection(markdown: string): SectionMarkdown[] {
  const sections: SectionMarkdown[] = [];
  const lignes = markdown.split("\n");
  let titreCourant = "Introduction";
  let contenuCourant: string[] = [];

  for (const ligne of lignes) {
    const correspondance = ligne.match(/^##\s+(.+)/);
    if (correspondance) {
      sections.push({ titre: titreCourant, contenu: contenuCourant.join("\n").trim() });
      titreCourant = correspondance[1].trim();
      contenuCourant = [];
    } else {
      contenuCourant.push(ligne);
    }
  }
  sections.push({ titre: titreCourant, contenu: contenuCourant.join("\n").trim() });

  return sections.filter((s) => s.contenu.length > 0 || s.titre !== "Introduction");
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run lib/appels-offres/normalisation/markdown.test.ts`

Expected: PASS, 6/6.

- [ ] **Step 6: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add lib/appels-offres/normalisation/types.ts lib/appels-offres/normalisation/markdown.ts lib/appels-offres/normalisation/markdown.test.ts
git commit -m "feat(dao): structuration Markdown et types partagés"
```

---

### Task 2: `schema.ts` — schéma Zod d'extraction aligné sur le modèle de données

**Files:**
- Create: `lib/appels-offres/normalisation/schema.ts`
- Test: `lib/appels-offres/normalisation/schema.test.ts`

**Interfaces:**
- Consumes: `TYPES_EXIGENCE_AO` de `lib/appels-offres/types.ts` (déjà créé au sous-projet 1 : `["piece_requise", "critere_evaluation"] as const`).
- Produces: `export const ExtractionAoSchema`, `export type ExtractionAo`, `export const ExigenceExtraiteSchema`, `export type ExigenceExtraite` — consommés par Task 6 (`extraire.ts`).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `lib/appels-offres/normalisation/schema.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { ExtractionAoSchema } from "./schema";

describe("ExtractionAoSchema", () => {
  it("valide un objet d'extraction complet", () => {
    const resultat = ExtractionAoSchema.parse({
      titre: "Construction d'un pont",
      acheteur: "Ministère des Infrastructures",
      secteur: "BTP",
      date_limite: "2026-11-03T12:00:00Z",
      montant_caution: 5000000,
      sommaire_attendu: ["Présentation de l'entreprise"],
      exigences: [
        {
          type_exigence: "piece_requise",
          libelle: "RCCM",
          description: "Registre du Commerce",
          ponderation: null,
          source_section: "DPAO",
        },
        {
          type_exigence: "critere_evaluation",
          libelle: "Conformité administrative",
          description: null,
          ponderation: 20,
          source_section: "DPAO",
        },
      ],
    });

    expect(resultat.titre).toBe("Construction d'un pont");
    expect(resultat.exigences).toHaveLength(2);
    expect(resultat.exigences[1].ponderation).toBe(20);
  });

  it("accepte des champs nuls quand l'information est absente", () => {
    const resultat = ExtractionAoSchema.parse({
      titre: null,
      acheteur: null,
      secteur: null,
      date_limite: null,
      montant_caution: null,
      sommaire_attendu: [],
      exigences: [],
    });

    expect(resultat.titre).toBeNull();
    expect(resultat.date_limite).toBeNull();
  });

  it("rejette un type_exigence hors énumération", () => {
    expect(() =>
      ExtractionAoSchema.parse({
        titre: null,
        acheteur: null,
        secteur: null,
        date_limite: null,
        montant_caution: null,
        sommaire_attendu: [],
        exigences: [
          {
            type_exigence: "invalide",
            libelle: "X",
            description: null,
            ponderation: null,
            source_section: "DPAO",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejette une date_limite qui n'est pas au format ISO 8601", () => {
    expect(() =>
      ExtractionAoSchema.parse({
        titre: null,
        acheteur: null,
        secteur: null,
        date_limite: "3 novembre 2026",
        montant_caution: null,
        sommaire_attendu: [],
        exigences: [],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run lib/appels-offres/normalisation/schema.test.ts`

Expected: FAIL — `./schema` n'existe pas encore.

- [ ] **Step 3: Créer `lib/appels-offres/normalisation/schema.ts`**

```ts
import { z } from "zod";
import { TYPES_EXIGENCE_AO } from "../types";

export const ExigenceExtraiteSchema = z.object({
  type_exigence: z.enum(TYPES_EXIGENCE_AO),
  libelle: z.string(),
  description: z.string().nullable(),
  ponderation: z.number().nullable(),
  source_section: z.string(),
});

export const ExtractionAoSchema = z.object({
  titre: z.string().nullable(),
  acheteur: z.string().nullable(),
  secteur: z.string().nullable(),
  date_limite: z.string().datetime().nullable(),
  montant_caution: z.number().nullable(),
  sommaire_attendu: z.array(z.string()),
  exigences: z.array(ExigenceExtraiteSchema),
});

export type ExtractionAo = z.infer<typeof ExtractionAoSchema>;
export type ExigenceExtraite = z.infer<typeof ExigenceExtraiteSchema>;
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run lib/appels-offres/normalisation/schema.test.ts`

Expected: PASS, 4/4.

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/normalisation/schema.ts lib/appels-offres/normalisation/schema.test.ts
git commit -m "feat(dao): schéma Zod d'extraction aligné sur AppelOffres/ExigenceAo"
```

---

### Task 3: `pdf.ts` + `ocr.ts` — extraction texte PDF avec repli OCR

**Files:**
- Create: `lib/appels-offres/normalisation/pdf.ts`
- Create: `lib/appels-offres/normalisation/ocr.ts`
- Test: `lib/appels-offres/normalisation/ocr.test.ts`

**Interfaces:**
- Consumes: `PageTexte` de `./types` (Task 1).
- Produces: `export async function extrairePagesPdf(buffer: Buffer): Promise<PageTexte[]>` (`pdf.ts`, avec repli OCR déjà intégré) — consommé par Task 5 (`normaliser.ts`). `export async function rendreImagePage(buffer: Buffer, numeroPage: number): Promise<Buffer>` et `export async function lireImageParClaude(imageBuffer: Buffer): Promise<string>` (`ocr.ts`) — consommés uniquement par `pdf.ts` dans ce sous-projet.

Ces deux fichiers migrent `scripts/dao-spike/pdf-texte.ts` et `scripts/dao-spike/ocr.ts`, déjà validés par le spike sur 3 DAO réels (dont un cas OCR). Aucun changement de logique, seulement le renommage de fichier et l'intégration de la boucle de repli OCR (auparavant dans `scripts/dao-spike/normaliser.ts`) directement dans `pdf.ts`, pour que `extrairePagesPdf` soit un point d'entrée unique qui gère toujours le repli OCR — pas d'API partielle qui l'omettrait par erreur.

- [ ] **Step 1: Créer `lib/appels-offres/normalisation/ocr.ts`**

```ts
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import Anthropic from "@anthropic-ai/sdk";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const anthropic = new Anthropic();

// `pdf-parse` (utilisé par pdf.ts) embarque sa propre copie (plus ancienne)
// de pdfjs-dist en dépendance imbriquée. Les deux copies partagent un état
// global côté pdfjs-dist (fake worker Node) : sans fixer explicitement
// `workerSrc` sur NOTRE copie (résolu en URL file://, requis par le loader
// ESM de Node sous Windows), le fake worker peut se retrouver résolu vers
// celle de pdf-parse, provoquant "API version does not match Worker
// version".
const require = createRequire(import.meta.url);
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;

export async function rendreImagePage(buffer: Buffer, numeroPage: number): Promise<Buffer> {
  // Si `pdf.ts` (pdf-parse) a déjà tourné dans ce process, il a laissé
  // `globalThis.pdfjsWorker` pointer vers SA copie (plus ancienne) de
  // pdfjs-dist — pdfjs-dist réutilise ce global sans revérifier `workerSrc`.
  // On le vide pour forcer le rechargement depuis notre propre `workerSrc`.
  delete (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker;

  const document = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await document.getPage(numeroPage);
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const contexte = canvas.getContext("2d");

  await page.render({
    canvas: null,
    canvasContext: contexte as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;

  return canvas.toBuffer("image/png");
}

export async function lireImageParClaude(imageBuffer: Buffer): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageBuffer.toString("base64"),
            },
          },
          {
            type: "text",
            text: "Transcris fidèlement tout le texte visible sur cette image de document administratif, sans commentaire ni reformulation.",
          },
        ],
      },
    ],
  });

  const bloc = message.content.find((b) => b.type === "text");
  return bloc && bloc.type === "text" ? bloc.text : "";
}
```

- [ ] **Step 2: Écrire le test de `lireImageParClaude`**

`ocr.ts` est une migration directe et sans changement de logique de
`scripts/dao-spike/ocr.ts` (déjà validé par le spike) — ce test n'est donc
pas un cycle rouge/vert classique : `ocr.ts` existe déjà depuis le Step 1,
le test passe dès son écriture. Son rôle est de figer ce comportement dans
la suite automatisée, pas de guider une implémentation qui n'existe pas
encore.

Créer `lib/appels-offres/normalisation/ocr.test.ts` :

```ts
import { describe, expect, it, vi } from "vitest";

const creerMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: creerMock },
  })),
}));

import { lireImageParClaude } from "./ocr";

describe("lireImageParClaude", () => {
  it("retourne le texte transcrit par Claude", async () => {
    creerMock.mockResolvedValue({
      content: [{ type: "text", text: "Texte transcrit de l'image." }],
    });

    const resultat = await lireImageParClaude(Buffer.from("image-fictive"));

    expect(resultat).toBe("Texte transcrit de l'image.");
  });

  it("retourne une chaîne vide si la réponse ne contient aucun bloc texte", async () => {
    creerMock.mockResolvedValue({ content: [] });

    const resultat = await lireImageParClaude(Buffer.from("image-fictive"));

    expect(resultat).toBe("");
  });
});
```

- [ ] **Step 3: Lancer le test**

Run: `npx vitest run lib/appels-offres/normalisation/ocr.test.ts`

Expected: PASS, 2/2.

- [ ] **Step 4: Créer `lib/appels-offres/normalisation/pdf.ts`**

```ts
import { PDFParse } from "pdf-parse";
import type { PageTexte } from "./types";
import { rendreImagePage, lireImageParClaude } from "./ocr";

const SEUIL_TEXTE_INSUFFISANT = 20;

// NOTE : la version installée (pdf-parse ^2.4.5) expose une API différente
// de l'API v1 historique : classe `PDFParse` avec `getText()` retournant
// déjà un texte par page (`{ num, text }`).
async function extraireTexteParPage(buffer: Buffer): Promise<PageTexte[]> {
  // Garde symétrique à celle de `ocr.ts::rendreImagePage`. `pdf-parse`
  // embarque SA PROPRE copie imbriquée de pdfjs-dist, distincte de la copie
  // top-level utilisée par `ocr.ts`. Les deux copies partagent
  // `globalThis.pdfjsWorker` : le vider avant chaque appel force chaque
  // copie à se réenregistrer proprement avec son propre worker, quel que
  // soit ce qui a tourné avant dans ce process.
  delete (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker;

  const parser = new PDFParse({ data: buffer });
  try {
    const resultat = await parser.getText();
    return resultat.pages.map((page) => ({ numero: page.num, texte: page.text }));
  } finally {
    await parser.destroy();
  }
}

export async function extrairePagesPdf(buffer: Buffer): Promise<PageTexte[]> {
  const pages = await extraireTexteParPage(buffer);

  for (const page of pages) {
    if (page.texte.trim().length < SEUIL_TEXTE_INSUFFISANT) {
      const imagePage = await rendreImagePage(buffer, page.numero);
      page.texte = await lireImageParClaude(imagePage);
    }
  }

  return pages;
}
```

Pas de test automatisé pour `extrairePagesPdf` (ni pour `rendreImagePage`) : ce sont des fonctions d'intégration réelle avec `pdf-parse`/`pdfjs-dist`/`@napi-rs/canvas`, déjà validées manuellement par le spike sur 3 PDF réels. La vérification qualitative se fait via le script de Task 7, pas via Vitest — cohérent avec le spec.

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/normalisation/pdf.ts lib/appels-offres/normalisation/ocr.ts lib/appels-offres/normalisation/ocr.test.ts
git commit -m "feat(dao): extraction PDF avec repli OCR"
```

---

### Task 4: `docx.ts` — conversion DOCX → Markdown

**Files:**
- Create: `lib/appels-offres/normalisation/docx.ts`
- Test: `lib/appels-offres/normalisation/docx.test.ts`
- Create (fixture) : `fixtures/dao/normalisation-docx-test.docx`
- Modify: `package.json` (ajout des dépendances `mammoth`, `turndown`)

**Interfaces:**
- Consumes: rien (indépendant des autres tâches).
- Produces: `export async function extraireMarkdownDocx(buffer: Buffer): Promise<string>` — consommé par Task 5 (`normaliser.ts`).

- [ ] **Step 1: Installer les dépendances**

Run: `npm install mammoth turndown`

Expected: `mammoth` et `turndown` ajoutés à `dependencies` dans `package.json`.

- [ ] **Step 2: Générer la fixture de test DOCX**

Invoquer le skill `docx` pour créer le fichier `fixtures/dao/normalisation-docx-test.docx`, contenant exactement les 4 paragraphes suivants, dans l'ordre, chacun en style de paragraphe normal/standard (sans style de titre Word — un DAO ivoirien réel utilise typiquement du texte en gras/centré via mise en forme directe, pas les styles sémantiques Heading1/Heading2, et ce fichier doit refléter ce cas réaliste) :

1. `AVIS D'APPEL D'OFFRES`
2. `Contenu de l'avis en DOCX.`
3. `DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES`
4. `Contenu du DPAO en DOCX.`

Vérifier ensuite que le fichier existe : `ls fixtures/dao/normalisation-docx-test.docx` (ou équivalent) doit le lister.

- [ ] **Step 3: Écrire le test qui échoue**

Créer `lib/appels-offres/normalisation/docx.test.ts` :

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extraireMarkdownDocx } from "./docx";

describe("extraireMarkdownDocx", () => {
  it("convertit le contenu texte d'un DOCX en Markdown", async () => {
    const buffer = await readFile(
      path.join("fixtures", "dao", "normalisation-docx-test.docx"),
    );

    const markdown = await extraireMarkdownDocx(buffer);

    expect(markdown).toContain("AVIS D'APPEL D'OFFRES");
    expect(markdown).toContain("Contenu de l'avis en DOCX.");
    expect(markdown).toContain("DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES");
    expect(markdown).toContain("Contenu du DPAO en DOCX.");
  });
});
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run lib/appels-offres/normalisation/docx.test.ts`

Expected: FAIL — `./docx` n'existe pas encore.

- [ ] **Step 5: Créer `lib/appels-offres/normalisation/docx.ts`**

```ts
import mammoth from "mammoth";
import TurndownService from "turndown";

const turndownService = new TurndownService();

export async function extraireMarkdownDocx(buffer: Buffer): Promise<string> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  return turndownService.turndown(html);
}
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run lib/appels-offres/normalisation/docx.test.ts`

Expected: PASS, 1/1.

- [ ] **Step 7: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur. Si `tsc` signale une absence de déclarations de types pour le module `"turndown"`, installer `npm install -D @types/turndown` puis relancer `npx tsc --noEmit` pour confirmer que l'erreur disparaît. `mammoth` fournit ses propres déclarations de types, aucun paquet `@types` supplémentaire n'est nécessaire pour lui.

- [ ] **Step 8: Commit**

```bash
git add lib/appels-offres/normalisation/docx.ts lib/appels-offres/normalisation/docx.test.ts fixtures/dao/normalisation-docx-test.docx package.json package-lock.json
git commit -m "feat(dao): conversion DOCX vers Markdown"
```

---

### Task 5: `normaliser.ts` — point d'entrée de normalisation

**Files:**
- Create: `lib/appels-offres/normalisation/normaliser.ts`
- Test: `lib/appels-offres/normalisation/normaliser.test.ts`

**Interfaces:**
- Consumes: `decouperParSection`, `insererMarqueursTitres`, `structurerEnMarkdownHeuristique`, `SectionMarkdown` de `./markdown` (Task 1) ; `extrairePagesPdf` de `./pdf` (Task 3) ; `extraireMarkdownDocx` de `./docx` (Task 4).
- Produces: `export const MIME_PDF: string`, `export const MIME_DOCX: string`, `export const MIME_TYPES_DAO_SUPPORTES: readonly string[]`, `export async function normaliserDao(buffer: Buffer, mimeType: string): Promise<{ markdown: string; sections: SectionMarkdown[] }>` — consommé par le sous-projet 3 (upload/orchestration) et par Task 7 (script de vérification).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `lib/appels-offres/normalisation/normaliser.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { normaliserDao } from "./normaliser";

describe("normaliserDao", () => {
  it("rejette un type de fichier non supporté", async () => {
    await expect(normaliserDao(Buffer.from(""), "text/plain")).rejects.toThrow(
      "Type de fichier non supporté pour un DAO : text/plain",
    );
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run lib/appels-offres/normalisation/normaliser.test.ts`

Expected: FAIL — `./normaliser` n'existe pas encore.

- [ ] **Step 3: Créer `lib/appels-offres/normalisation/normaliser.ts`**

```ts
import {
  decouperParSection,
  insererMarqueursTitres,
  structurerEnMarkdownHeuristique,
} from "./markdown";
import type { SectionMarkdown } from "./markdown";
import { extrairePagesPdf } from "./pdf";
import { extraireMarkdownDocx } from "./docx";

export const MIME_PDF = "application/pdf";
export const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MIME_TYPES_DAO_SUPPORTES = [MIME_PDF, MIME_DOCX] as const;

export async function normaliserDao(
  buffer: Buffer,
  mimeType: string,
): Promise<{ markdown: string; sections: SectionMarkdown[] }> {
  let markdown: string;

  if (mimeType === MIME_PDF) {
    const pages = await extrairePagesPdf(buffer);
    markdown = structurerEnMarkdownHeuristique(pages);
  } else if (mimeType === MIME_DOCX) {
    const texteBrut = await extraireMarkdownDocx(buffer);
    markdown = insererMarqueursTitres(texteBrut);
  } else {
    throw new Error(`Type de fichier non supporté pour un DAO : ${mimeType}`);
  }

  const sections = decouperParSection(markdown);
  return { markdown, sections };
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run lib/appels-offres/normalisation/normaliser.test.ts`

Expected: PASS, 1/1.

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/normalisation/normaliser.ts lib/appels-offres/normalisation/normaliser.test.ts
git commit -m "feat(dao): point d'entrée normaliserDao (PDF/DOCX)"
```

---

### Task 6: `extraire.ts` — extraction des informations via Claude

**Files:**
- Create: `lib/appels-offres/normalisation/extraire.ts`
- Test: `lib/appels-offres/normalisation/extraire.test.ts`

**Interfaces:**
- Consumes: `SectionMarkdown` de `./markdown` (Task 1) ; `ExtractionAoSchema`, `ExtractionAo` de `./schema` (Task 2).
- Produces: `export async function extraireInformationsAo(sections: SectionMarkdown[]): Promise<ExtractionAo>` — consommé par le sous-projet 3 et par Task 7.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `lib/appels-offres/normalisation/extraire.test.ts` :

```ts
import { describe, expect, it, vi } from "vitest";

const creerMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: creerMock },
  })),
}));

import { extraireInformationsAo } from "./extraire";
import type { SectionMarkdown } from "./markdown";

const sections: SectionMarkdown[] = [
  { titre: "AVIS D'APPEL D'OFFRES", contenu: "Construction d'un pont, par le Ministère X." },
];

describe("extraireInformationsAo", () => {
  it("construit un prompt demandant les champs étendus (titre, acheteur, date ISO)", async () => {
    creerMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            titre: null,
            acheteur: null,
            secteur: null,
            date_limite: null,
            montant_caution: null,
            sommaire_attendu: [],
            exigences: [],
          }),
        },
      ],
    });

    await extraireInformationsAo(sections);

    const promptEnvoye = creerMock.mock.calls[0][0].messages[0].content as string;
    expect(promptEnvoye).toContain("titre");
    expect(promptEnvoye).toContain("acheteur");
    expect(promptEnvoye).toContain("date_limite");
    expect(promptEnvoye).toContain("ISO 8601");
  });

  it("parse une réponse JSON valide en objet ExtractionAo", async () => {
    creerMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            titre: "Construction d'un pont",
            acheteur: "Ministère X",
            secteur: "BTP",
            date_limite: "2026-11-03T12:00:00Z",
            montant_caution: 5000000,
            sommaire_attendu: ["Méthodologie"],
            exigences: [
              {
                type_exigence: "piece_requise",
                libelle: "RCCM",
                description: null,
                ponderation: null,
                source_section: "DPAO",
              },
            ],
          }),
        },
      ],
    });

    const resultat = await extraireInformationsAo(sections);

    expect(resultat.titre).toBe("Construction d'un pont");
    expect(resultat.exigences).toHaveLength(1);
  });

  it("propage une erreur si la réponse ne respecte pas le schéma", async () => {
    creerMock.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ titre: 42 }) }],
    });

    await expect(extraireInformationsAo(sections)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/appels-offres/normalisation/extraire.test.ts`

Expected: FAIL — `./extraire` n'existe pas encore.

- [ ] **Step 3: Créer `lib/appels-offres/normalisation/extraire.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { ExtractionAoSchema, type ExtractionAo } from "./schema";
import type { SectionMarkdown } from "./markdown";

const anthropic = new Anthropic();

function trouverSection(sections: SectionMarkdown[], motCle: string): SectionMarkdown | undefined {
  return sections.find((s) => s.titre.toUpperCase().includes(motCle.toUpperCase()));
}

export async function extraireInformationsAo(sections: SectionMarkdown[]): Promise<ExtractionAo> {
  const sectionAao = trouverSection(sections, "AVIS D'APPEL D'OFFRES");
  const sectionDpao = trouverSection(sections, "DONNÉES PARTICULIÈRES");
  const sectionSommaire = trouverSection(sections, "SOMMAIRE ATTENDU");

  const contenuPertinent = [sectionAao, sectionDpao, sectionSommaire]
    .filter((s): s is SectionMarkdown => s !== undefined)
    .map((s) => `## ${s.titre}\n${s.contenu}`)
    .join("\n\n");

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Voici des sections extraites d'un dossier d'appel d'offres (DAO) ivoirien :

${contenuPertinent}

Extrait les informations suivantes et réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, au format exact suivant :

{
  "titre": "string ou null (objet/intitulé de l'appel d'offres)",
  "acheteur": "string ou null (nom de l'autorité contractante)",
  "secteur": "string ou null (secteur d'activité concerné)",
  "date_limite": "string ou null (date et heure limite de dépôt, au format ISO 8601 UTC, ex. 2026-11-03T12:00:00Z)",
  "montant_caution": nombre ou null (montant de la caution de soumission, en chiffres, sans devise),
  "sommaire_attendu": ["string"],
  "exigences": [
    { "type_exigence": "piece_requise", "libelle": "string", "description": "string ou null", "ponderation": null, "source_section": "nom de la section d'origine" },
    { "type_exigence": "critere_evaluation", "libelle": "string", "description": null, "ponderation": nombre ou null, "source_section": "nom de la section d'origine" }
  ]
}

N'invente aucune information absente du texte fourni. Si une information n'est pas présente, utilise null ou un tableau vide selon le cas.`,
      },
    ],
  });

  const bloc = message.content.find((b) => b.type === "text");
  const texteJson = bloc && bloc.type === "text" ? bloc.text : "{}";

  const debut = texteJson.indexOf("{");
  const fin = texteJson.lastIndexOf("}");
  const jsonBrut = texteJson.slice(debut, fin + 1);

  return ExtractionAoSchema.parse(JSON.parse(jsonBrut));
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run lib/appels-offres/normalisation/extraire.test.ts`

Expected: PASS, 3/3.

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/normalisation/extraire.ts lib/appels-offres/normalisation/extraire.test.ts
git commit -m "feat(dao): extraction des informations AO via Claude"
```

---

### Task 7: Script de vérification qualitative manuelle et nettoyage de `scripts/dao-spike/`

**Files:**
- Create: `fixtures/dao/dao-4-modele.docx`
- Create: `scripts/verification-dao/run.ts`
- Modify: `package.json:11` (script `dao-spike`)
- Delete: `scripts/dao-spike/` (dossier complet)

**Interfaces:**
- Consumes: `normaliserDao`, `MIME_PDF`, `MIME_DOCX` de `lib/appels-offres/normalisation/normaliser` (Task 5) ; `extraireInformationsAo` de `lib/appels-offres/normalisation/extraire` (Task 6).
- Produces: rien consommé par un sous-projet suivant — outil de vérification manuelle uniquement.

- [ ] **Step 1: Générer la fixture DAO réaliste en DOCX**

Invoquer le skill `docx` pour créer `fixtures/dao/dao-4-modele.docx`, un DAO complet en paragraphes de style normal (pas de styles Heading Word — cohérent avec Task 4), avec exactement ce contenu, dans l'ordre :

1. `AVIS D'APPEL D'OFFRES`
2. `N° AAO-2026-0087/MSHP`
3. `Construction d'un centre de santé communautaire dans la commune de Yopougon, Abidjan.`
4. `Acheteur : Ministère de la Santé et de l'Hygiène Publique`
5. `Secteur : Bâtiments et Travaux Publics`
6. `Date limite de dépôt des offres : 20 décembre 2026 à 12h00`
7. `Montant de la caution de soumission : 3 000 000 FCFA`
8. `INSTRUCTIONS AUX SOUMISSIONNAIRES`
9. `Les présentes instructions définissent les modalités de préparation, de dépôt et d'évaluation des offres.`
10. `DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES`
11. `Pièces administratives requises :`
12. `– Registre du Commerce et du Crédit Mobilier (RCCM)`
13. `– Attestation de régularité fiscale`
14. `– Attestation de la Caisse Nationale de Prévoyance Sociale (CNPS)`
15. `– Identifiant Unique (IDU)`
16. `Critères d'évaluation des offres :`
17. `– Conformité administrative : 20%`
18. `– Expérience du soumissionnaire : 25%`
19. `– Méthodologie proposée : 35%`
20. `– Délai d'exécution : 20%`
21. `SOMMAIRE ATTENDU DE L'OFFRE`
22. `– Présentation de l'entreprise`
23. `– Méthodologie d'exécution`
24. `– Planning des travaux`
25. `– Bordereau des prix unitaires`

Vérité terrain à comparer au Step 5 : `titre` = la phrase du paragraphe 3, `acheteur` = "Ministère de la Santé et de l'Hygiène Publique", `secteur` = "Bâtiments et Travaux Publics", `date_limite` = `2026-12-20T12:00:00Z`, `montant_caution` = `3000000`, 4 pièces requises, 4 critères (20/25/35/20), 4 items de sommaire attendu.

- [ ] **Step 2: Créer `scripts/verification-dao/run.ts`**

```ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  normaliserDao,
  MIME_PDF,
  MIME_DOCX,
} from "../../lib/appels-offres/normalisation/normaliser";
import { extraireInformationsAo } from "../../lib/appels-offres/normalisation/extraire";

const FIXTURES: { fichier: string; mimeType: string }[] = [
  { fichier: "dao-1-propre.pdf", mimeType: MIME_PDF },
  { fichier: "dao-2-tableau-complexe.pdf", mimeType: MIME_PDF },
  { fichier: "dao-3-scanne.pdf", mimeType: MIME_PDF },
  { fichier: "dao-4-modele.docx", mimeType: MIME_DOCX },
];

async function main() {
  const dossierSortie = path.join("fixtures", "dao", "out");
  await mkdir(dossierSortie, { recursive: true });

  for (const { fichier, mimeType } of FIXTURES) {
    console.log(`\n=== ${fichier} ===`);
    const cheminFichier = path.join("fixtures", "dao", fichier);
    const buffer = await readFile(cheminFichier);

    const { markdown, sections } = await normaliserDao(buffer, mimeType);
    const nomBase = fichier.replace(/\.(pdf|docx)$/, "");

    await writeFile(path.join(dossierSortie, `${nomBase}.md`), markdown, "utf-8");
    console.log(`Markdown sauvegardé : out/${nomBase}.md (${sections.length} sections)`);

    const extraction = await extraireInformationsAo(sections);
    await writeFile(
      path.join(dossierSortie, `${nomBase}.json`),
      JSON.stringify(extraction, null, 2),
      "utf-8",
    );
    console.log(`Extraction sauvegardée : out/${nomBase}.json`);
    console.log(`  Titre : ${extraction.titre}`);
    console.log(`  Acheteur : ${extraction.acheteur}`);
    console.log(`  Secteur : ${extraction.secteur}`);
    console.log(`  Date limite : ${extraction.date_limite}`);
    console.log(`  Montant caution : ${extraction.montant_caution}`);
    console.log(`  Sommaire attendu : ${extraction.sommaire_attendu.length}`);
    console.log(`  Exigences : ${extraction.exigences.length}`);
  }
}

main().catch((erreur) => {
  console.error("Erreur:", erreur);
  process.exit(1);
});
```

- [ ] **Step 3: Mettre à jour le script npm `dao-spike`**

Dans `package.json`, remplacer la ligne :

```json
"dao-spike": "tsx --env-file-if-exists=.env.local scripts/dao-spike/run.ts"
```

par :

```json
"dao-spike": "tsx --env-file-if-exists=.env.local scripts/verification-dao/run.ts"
```

- [ ] **Step 4: Lancer la vérification**

Run: `npm run dao-spike`

Expected: le script traite les 4 fixtures (3 PDF + 1 DOCX) et écrit leurs sorties dans `fixtures/dao/out/`. Nécessite `ANTHROPIC_ACCESS_TOKEN`/`ANTHROPIC_API_KEY` avec du crédit disponible dans `.env.local`. Si la commande échoue pour une raison liée aux identifiants ou au crédit (erreur d'authentification, crédit insuffisant), rapporter en `BLOCKED` plutôt que de tenter une configuration non documentée ici — la vérification qualitative pourra être rejouée plus tard, exactement comme cela s'est produit pour le spike original.

- [ ] **Step 5: Comparer les résultats à la vérité terrain**

Ouvrir `fixtures/dao/out/dao-4-modele.json` et le comparer à la vérité terrain listée au Step 1. Ouvrir aussi `fixtures/dao/out/dao-1-propre.json`, `dao-2-tableau-complexe.json`, `dao-3-scanne.json` et vérifier que leurs nouveaux champs (`titre`, `acheteur`, `secteur`, `montant_caution`, `date_limite`) sont cohérents avec le contenu des PDF sources (déjà connu du spike : acheteur "Direction Générale des Infrastructures Routières" pour dao-1, etc. — voir `fixtures/dao/generer_dao_1_et_2.py`/`generer_dao_3.py` pour la vérité terrain complète de ces 3 fixtures).

Si un champ diffère significativement de la vérité terrain (valeur inventée, absente alors que présente dans la source, ou mal formée), documenter précisément l'écart dans le rapport et le signaler comme `DONE_WITH_CONCERNS` plutôt que de modifier le prompt de `extraire.ts` sans validation — un ajustement du prompt sera traité comme un correctif ciblé une fois le contrôleur/l'utilisateur d'accord sur le diagnostic, exactement comme le trou du sommaire l'a été au sous-projet du spike.

- [ ] **Step 6: Supprimer `scripts/dao-spike/`**

```bash
git rm -r scripts/dao-spike/
```

Expected: le dossier et son contenu (`extraire.ts`, `markdown.test.ts`, `markdown.ts`, `normaliser.ts`, `ocr.ts`, `pdf-texte.ts`, `README.md`, `run.ts`, `schema.test.ts`, `schema.ts`) sont supprimés — sa logique est entièrement absorbée par `lib/appels-offres/normalisation/`, son historique reste consultable via Git.

- [ ] **Step 7: Vérifier que le projet compile et que la suite de tests passe**

Run: `npx tsc --noEmit && npx vitest run`

Expected: aucune erreur TypeScript ; tous les tests Vitest passent (les anciens tests de `scripts/dao-spike/` ont été supprimés avec le dossier, les nouveaux de `lib/appels-offres/normalisation/` passent).

- [ ] **Step 8: Commit**

```bash
git add fixtures/dao/dao-4-modele.docx fixtures/dao/out/ scripts/verification-dao/ package.json
git commit -m "feat(dao): script de vérification manuelle et retrait du spike"
```

---
