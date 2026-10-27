import { describe, expect, it } from "vitest";
import { calculerNoteTechniqueSimulee, offreFinanciereVerrouillee } from "./note-technique-simulee";

describe("calculerNoteTechniqueSimulee", () => {
  it("retourne null sans aucun critère noté", () => {
    expect(calculerNoteTechniqueSimulee([])).toBeNull();
    expect(
      calculerNoteTechniqueSimulee([{ ponderation: 40, noteSimulee: null }]),
    ).toBeNull();
  });

  it("ignore les critères sans pondération ou sans note saisie", () => {
    const note = calculerNoteTechniqueSimulee([
      { ponderation: 60, noteSimulee: 80 },
      { ponderation: null, noteSimulee: 10 },
      { ponderation: 40, noteSimulee: null },
    ]);
    expect(note).toBe(80);
  });

  it("calcule une moyenne pondérée sur plusieurs critères notables", () => {
    const note = calculerNoteTechniqueSimulee([
      { ponderation: 60, noteSimulee: 100 },
      { ponderation: 40, noteSimulee: 50 },
    ]);
    // (60*100 + 40*50) / 100 = 80
    expect(note).toBe(80);
  });
});

describe("offreFinanciereVerrouillee", () => {
  it("ne verrouille jamais quand aucun seuil n'est paramétré", () => {
    expect(offreFinanciereVerrouillee(null, null)).toBe(false);
    expect(offreFinanciereVerrouillee(10, null)).toBe(false);
  });

  it("verrouille quand le seuil est paramétré mais la note est inconnue", () => {
    expect(offreFinanciereVerrouillee(null, 70)).toBe(true);
  });

  it("verrouille sous le seuil, déverrouille au seuil ou au-dessus", () => {
    expect(offreFinanciereVerrouillee(69, 70)).toBe(true);
    expect(offreFinanciereVerrouillee(70, 70)).toBe(false);
    expect(offreFinanciereVerrouillee(90, 70)).toBe(false);
  });
});
