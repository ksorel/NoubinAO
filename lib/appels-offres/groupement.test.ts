import { describe, expect, it } from "vitest";
import { calculerSommePourcentages } from "./groupement";

describe("calculerSommePourcentages", () => {
  it("retourne null pour une liste vide", () => {
    expect(calculerSommePourcentages([])).toBeNull();
  });

  it("retourne null quand aucun membre n'a de pourcentage renseigné", () => {
    expect(
      calculerSommePourcentages([{ pourcentage: null }, { pourcentage: null }]),
    ).toBeNull();
  });

  it("somme les pourcentages renseignés, ignore les null", () => {
    expect(
      calculerSommePourcentages([
        { pourcentage: 60 },
        { pourcentage: null },
        { pourcentage: 40 },
      ]),
    ).toBe(100);
  });

  it("retourne la somme exacte quand elle vaut 100", () => {
    expect(calculerSommePourcentages([{ pourcentage: 70 }, { pourcentage: 30 }])).toBe(100);
  });

  it("retourne la somme réelle sans la juger quand elle est différente de 100", () => {
    expect(calculerSommePourcentages([{ pourcentage: 60 }, { pourcentage: 60 }])).toBe(120);
    expect(calculerSommePourcentages([{ pourcentage: 30 }])).toBe(30);
  });
});
