import { describe, expect, it } from "vitest";
import { calculerTailleCorpsTexte, construireTextePage } from "./pdf";
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
});
