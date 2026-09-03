import { describe, expect, it } from "vitest";
import { calculerTailleCorpsTexte, construireTextePage, identifierEntetesRepetees } from "./pdf";
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
