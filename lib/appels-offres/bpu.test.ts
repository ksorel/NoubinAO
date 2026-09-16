import { describe, expect, it } from "vitest";
import { calculerMontantLigne, compterLignesNonChiffrees, sommerMontants } from "./bpu";

describe("calculerMontantLigne", () => {
  it("multiplie quantité et prix unitaire", () => {
    expect(calculerMontantLigne({ quantite: 12, prix_unitaire: 5000 })).toBe(60000);
  });

  it("retourne null quand le prix unitaire est null", () => {
    expect(calculerMontantLigne({ quantite: 12, prix_unitaire: null })).toBeNull();
  });

  it("retourne 0 (pas null) quand le prix unitaire vaut 0", () => {
    expect(calculerMontantLigne({ quantite: 12, prix_unitaire: 0 })).toBe(0);
  });
});

describe("sommerMontants", () => {
  it("additionne les montants de plusieurs lignes chiffrées", () => {
    const lignes = [
      { quantite: 2, prix_unitaire: 1000 },
      { quantite: 3, prix_unitaire: 2000 },
    ];
    expect(sommerMontants(lignes)).toBe(8000);
  });

  it("ignore les lignes non chiffrées dans la somme", () => {
    const lignes = [
      { quantite: 2, prix_unitaire: 1000 },
      { quantite: 5, prix_unitaire: null },
    ];
    expect(sommerMontants(lignes)).toBe(2000);
  });

  it("retourne 0 sur un tableau vide", () => {
    expect(sommerMontants([])).toBe(0);
  });
});

describe("compterLignesNonChiffrees", () => {
  it("compte les lignes à prix_unitaire null", () => {
    const lignes = [
      { quantite: 1, prix_unitaire: null },
      { quantite: 2, prix_unitaire: 500 },
      { quantite: 3, prix_unitaire: null },
    ];
    expect(compterLignesNonChiffrees(lignes)).toBe(2);
  });

  it("retourne 0 sur un tableau vide", () => {
    expect(compterLignesNonChiffrees([])).toBe(0);
  });

  it("ne compte pas une ligne à prix_unitaire 0 comme non chiffrée", () => {
    expect(compterLignesNonChiffrees([{ quantite: 1, prix_unitaire: 0 }])).toBe(0);
  });
});
