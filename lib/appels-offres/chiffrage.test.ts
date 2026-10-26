import { describe, expect, it } from "vitest";
import { calculerChiffrage } from "./chiffrage";

describe("calculerChiffrage", () => {
  it("applique achat x change x approche puis marge et frais fixes", () => {
    const resultat = calculerChiffrage({
      prixAchat: 100,
      tauxChange: 650,
      coefficientApproche: 1.2,
      margePct: 20,
      fraisFixesPct: 10,
    });
    // débourse = 100 * 650 * 1.2 = 78000
    // PU = 78000 * 1.2 * 1.1 = 102960
    expect(resultat).toEqual({ debourseSec: 78000, prixUnitaire: 102960 });
  });

  it("traite marge et frais fixes à 0 comme aucune majoration", () => {
    const resultat = calculerChiffrage({
      prixAchat: 1000,
      tauxChange: 1,
      coefficientApproche: 1,
      margePct: 0,
      fraisFixesPct: 0,
    });
    expect(resultat).toEqual({ debourseSec: 1000, prixUnitaire: 1000 });
  });

  it("arrondit le prix unitaire au multiple demandé", () => {
    const resultat = calculerChiffrage(
      { prixAchat: 100, tauxChange: 1, coefficientApproche: 1, margePct: 15, fraisFixesPct: 0 },
      1000,
    );
    // brut = 115 -> arrondi au millier le plus proche = 0
    expect(resultat.prixUnitaire).toBe(0);
  });

  it("arrondit à l'unité par défaut (pas d'arrondi millier)", () => {
    const resultat = calculerChiffrage({
      prixAchat: 333,
      tauxChange: 1,
      coefficientApproche: 1,
      margePct: 10,
      fraisFixesPct: 0,
    });
    expect(resultat.prixUnitaire).toBe(366);
  });

  it("accepte un coefficient d'approche à 1 (pas de majoration import)", () => {
    const resultat = calculerChiffrage({
      prixAchat: 5000,
      tauxChange: 1,
      coefficientApproche: 1,
      margePct: 25,
      fraisFixesPct: 5,
    });
    expect(resultat).toEqual({ debourseSec: 5000, prixUnitaire: 6563 });
  });
});
