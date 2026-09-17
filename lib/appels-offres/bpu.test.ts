import { describe, expect, it } from "vitest";
import {
  calculerMontantLigne,
  calculerPyramideCout,
  compterLignesNonChiffrees,
  sommerMontants,
} from "./bpu";

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

describe("calculerPyramideCout", () => {
  it("calcule frais de structure et marge quand tout est renseigné", () => {
    const resultat = calculerPyramideCout({
      prix_unitaire: 10000,
      debourse_sec: 6000,
      taux_frais_structure: 15,
    });
    expect(resultat).toEqual({
      fraisDeStructure: 900,
      marge: 3100,
      margePourcentage: 31,
    });
  });

  it("retourne null quand debourse_sec est null", () => {
    expect(
      calculerPyramideCout({ prix_unitaire: 10000, debourse_sec: null, taux_frais_structure: 15 }),
    ).toBeNull();
  });

  it("retourne null quand prix_unitaire est null", () => {
    expect(
      calculerPyramideCout({ prix_unitaire: null, debourse_sec: 6000, taux_frais_structure: 15 }),
    ).toBeNull();
  });

  it("traite taux_frais_structure null comme 0", () => {
    const resultat = calculerPyramideCout({
      prix_unitaire: 10000,
      debourse_sec: 6000,
      taux_frais_structure: null,
    });
    expect(resultat).toEqual({
      fraisDeStructure: 0,
      marge: 4000,
      margePourcentage: 40,
    });
  });

  it("traite taux_frais_structure à 0 explicite comme null (même résultat)", () => {
    const resultat = calculerPyramideCout({
      prix_unitaire: 10000,
      debourse_sec: 6000,
      taux_frais_structure: 0,
    });
    expect(resultat).toEqual({
      fraisDeStructure: 0,
      marge: 4000,
      margePourcentage: 40,
    });
  });

  it("accepte une marge négative sans lever d'erreur", () => {
    const resultat = calculerPyramideCout({
      prix_unitaire: 5000,
      debourse_sec: 6000,
      taux_frais_structure: 10,
    });
    expect(resultat).toEqual({
      fraisDeStructure: 600,
      marge: -1600,
      margePourcentage: -32,
    });
  });

  it("retourne margePourcentage à 0 (pas NaN) quand prix_unitaire vaut 0", () => {
    const resultat = calculerPyramideCout({
      prix_unitaire: 0,
      debourse_sec: 500,
      taux_frais_structure: 10,
    });
    expect(resultat?.margePourcentage).toBe(0);
  });
});
