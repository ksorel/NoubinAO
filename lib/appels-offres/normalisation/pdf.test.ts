import { describe, expect, it, vi, beforeEach } from "vitest";

// Pages simulées consommées par le mock pdfjs-dist ci-dessous — un objet
// muni de vi.hoisted() pour rester modifiable depuis chaque test malgré le
// hoisting de vi.mock en tête de fichier.
const pagesSimulees = vi.hoisted(() => ({ textes: [] as string[] }));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: pagesSimulees.textes.length,
      getPage: async (numero: number) => ({
        getTextContent: async () => ({
          items: [{ str: pagesSimulees.textes[numero - 1], transform: [10, 0, 0, 10, 0, 700] }],
        }),
      }),
    }),
  }),
}));

const { mockRendreImagePage, mockLireImageParClaude } = vi.hoisted(() => ({
  mockRendreImagePage: vi.fn(async () => Buffer.from("image-fictive")),
  mockLireImageParClaude: vi.fn(async () => "texte OCR"),
}));

vi.mock("./ocr", () => ({
  initialiserWorkerSrc: vi.fn(),
  rendreImagePage: mockRendreImagePage,
  lireImageParClaude: mockLireImageParClaude,
}));

import {
  calculerTailleCorpsTexte,
  construireTextePage,
  identifierEntetesRepetees,
  extrairePagesPdf,
} from "./pdf";
import type { LignePdf } from "./pdf";

describe("calculerTailleCorpsTexte", () => {
  it("retourne la taille de police la plus fréquente parmi toutes les pages", () => {
    const pages = [
      {
        lignes: [
          { texte: "Un titre", taillePolice: 16 },
          { texte: "Corps de texte", taillePolice: 10 },
          { texte: "Corps de texte", taillePolice: 10 },
        ],
      },
      {
        lignes: [
          { texte: "Corps de texte", taillePolice: 10 },
          { texte: "Encore du corps", taillePolice: 10 },
        ],
      },
    ];

    expect(calculerTailleCorpsTexte(pages)).toBe(10);
  });

  it("arrondit les tailles avant de compter les occurrences", () => {
    const pages = [
      {
        lignes: [
          { texte: "a", taillePolice: 10.4 },
          { texte: "b", taillePolice: 9.6 },
          { texte: "c", taillePolice: 10.2 },
        ],
      },
    ];

    expect(calculerTailleCorpsTexte(pages)).toBe(10);
  });

  it("retourne 10 par défaut si aucune ligne n'est fournie", () => {
    expect(calculerTailleCorpsTexte([])).toBe(10);
  });
});

describe("construireTextePage", () => {
  it("marque comme titre une ligne dont la police dépasse le ratio du corps de texte", () => {
    const lignes: LignePdf[] = [
      { texte: "AVIS D'APPEL D'OFFRES", taillePolice: 16 },
      { texte: "Contenu de l'avis.", taillePolice: 10 },
    ];

    const resultat = construireTextePage(lignes, 10);

    expect(resultat).toContain("## AVIS D'APPEL D'OFFRES");
    expect(resultat).toContain("Contenu de l'avis.");
    expect(resultat).not.toContain("## Contenu de l'avis.");
  });

  it("ne marque pas comme titre une ligne à peine plus grande que le corps de texte", () => {
    const lignes: LignePdf[] = [{ texte: "Légèrement plus grand", taillePolice: 11 }];

    const resultat = construireTextePage(lignes, 10);

    expect(resultat).not.toContain("##");
  });

  it("ne marque pas comme titre une ligne longue même en grande police", () => {
    const lignes: LignePdf[] = [
      {
        texte:
          "Ceci est un paragraphe entier rédigé exceptionnellement dans une police plus grande que le corps de texte habituel du document, ce qui ne doit pas être confondu avec un titre de section.",
        taillePolice: 16,
      },
    ];

    const resultat = construireTextePage(lignes, 10);

    expect(resultat).not.toContain("##");
  });

  it("ne marque pas comme titre un en-tête répété présent dans entetesRepetees", () => {
    const lignes: LignePdf[] = [{ texte: "Section II. Données particulières36", taillePolice: 16 }];
    const entetesRepetees = new Set(["Section II. Données particulières"]);

    const resultat = construireTextePage(lignes, 10, entetesRepetees);

    expect(resultat).not.toContain("##");
    expect(resultat).toContain("Section II. Données particulières36");
  });
});

describe("identifierEntetesRepetees", () => {
  it("identifie un texte détecté comme titre sur au moins trois pages distinctes", () => {
    // Reproduit un DAO réel : un en-tête de section est imprimé sur chaque
    // page avec un numéro de page collé à la fin ("...offres36", "...offres37"...).
    const pages = [
      { numero: 1, lignes: [{ texte: "Section II. Données particulières36", taillePolice: 16 }] },
      { numero: 2, lignes: [{ texte: "Section II. Données particulières37", taillePolice: 16 }] },
      { numero: 3, lignes: [{ texte: "Section II. Données particulières38", taillePolice: 16 }] },
      { numero: 4, lignes: [{ texte: "Contenu normal du corps de texte.", taillePolice: 10 }] },
    ];

    const entetesRepetees = identifierEntetesRepetees(pages, 10);

    expect(entetesRepetees.has("Section II. Données particulières")).toBe(true);
  });

  it("ne considère pas comme en-tête répété un titre présent sur moins de trois pages", () => {
    const pages = [
      { numero: 1, lignes: [{ texte: "AVIS D'APPEL D'OFFRES", taillePolice: 16 }] },
      { numero: 2, lignes: [{ texte: "Contenu de la section.", taillePolice: 10 }] },
    ];

    const entetesRepetees = identifierEntetesRepetees(pages, 10);

    expect(entetesRepetees.size).toBe(0);
  });

  it("ignore les lignes qui ne sont pas des candidats titres", () => {
    const pages = [
      { numero: 1, lignes: [{ texte: "Corps de texte normal.", taillePolice: 10 }] },
      { numero: 2, lignes: [{ texte: "Corps de texte normal.", taillePolice: 10 }] },
      { numero: 3, lignes: [{ texte: "Corps de texte normal.", taillePolice: 10 }] },
    ];

    const entetesRepetees = identifierEntetesRepetees(pages, 10);

    expect(entetesRepetees.size).toBe(0);
  });
});

describe("extrairePagesPdf", () => {
  beforeEach(() => {
    pagesSimulees.textes = [];
    mockRendreImagePage.mockClear();
    mockLireImageParClaude.mockClear();
  });

  it("plafonne l'OCR à maxPagesOcr : les pages suivantes qui en auraient besoin restent non OCRisées", async () => {
    // 4 pages, toutes avec un texte trop court (< SEUIL_TEXTE_INSUFFISANT)
    // pour être exploitable sans OCR.
    pagesSimulees.textes = ["P1", "P2", "P3", "P4"];

    const pages = await extrairePagesPdf(Buffer.from("pdf-fictif"), 2);

    expect(mockRendreImagePage).toHaveBeenCalledTimes(2);
    expect(mockLireImageParClaude).toHaveBeenCalledTimes(2);

    expect(pages[0].ocr).toBe(true);
    expect(pages[0].texte).toBe("texte OCR");
    expect(pages[1].ocr).toBe(true);
    expect(pages[1].texte).toBe("texte OCR");

    // Au-delà du plafond : pas OCRisées, texte d'origine (court) conservé
    // tel quel — pas "OCRisées avec un résultat vide".
    expect(pages[2].ocr).toBe(false);
    expect(pages[2].texte).toBe("P3");
    expect(pages[3].ocr).toBe(false);
    expect(pages[3].texte).toBe("P4");
  });

  it("sans maxPagesOcr (comportement par défaut) : toutes les pages nécessitant l'OCR sont traitées", async () => {
    pagesSimulees.textes = ["P1", "P2", "P3", "P4"];

    const pages = await extrairePagesPdf(Buffer.from("pdf-fictif"));

    expect(mockRendreImagePage).toHaveBeenCalledTimes(4);
    expect(mockLireImageParClaude).toHaveBeenCalledTimes(4);
    expect(pages.every((page) => page.ocr === true)).toBe(true);
    expect(pages.every((page) => page.texte === "texte OCR")).toBe(true);
  });
});
