import { describe, expect, it } from "vitest";
import { classifierPieceRequise } from "./classification-piece";

describe("classifierPieceRequise", () => {
  it("classe les pièces financières usuelles", () => {
    expect(classifierPieceRequise("Lettre de soumission")).toBe("financiere");
    expect(classifierPieceRequise("Garantie de soumission")).toBe("financiere");
    expect(classifierPieceRequise("Caution de soumission bancaire")).toBe("financiere");
    expect(classifierPieceRequise("BPU détaillé")).toBe("financiere");
    expect(classifierPieceRequise("DQE")).toBe("financiere");
    expect(classifierPieceRequise("Devis quantitatif et estimatif")).toBe("financiere");
  });

  it("classe le reste en technique par défaut", () => {
    expect(classifierPieceRequise("Extrait RCCM")).toBe("technique");
    expect(classifierPieceRequise("CV du chef de chantier")).toBe("technique");
    expect(classifierPieceRequise("Attestation de bonne exécution")).toBe("technique");
    expect(classifierPieceRequise("Organigramme de l'équipe projet")).toBe("technique");
  });
});
