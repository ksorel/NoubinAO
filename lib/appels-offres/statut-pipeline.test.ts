import { describe, expect, it } from "vitest";
import { obtenirCouleurStatutPipeline } from "./statut-pipeline";

describe("obtenirCouleurStatutPipeline", () => {
  it("retourne identifie pour identifie", () => {
    expect(obtenirCouleurStatutPipeline("identifie")).toBe("identifie");
  });

  it("retourne preparation pour en_preparation", () => {
    expect(obtenirCouleurStatutPipeline("en_preparation")).toBe("preparation");
  });

  it("retourne soumis pour soumis", () => {
    expect(obtenirCouleurStatutPipeline("soumis")).toBe("soumis");
  });

  it("retourne identifie pour en_attente (pas de token dédié)", () => {
    expect(obtenirCouleurStatutPipeline("en_attente")).toBe("identifie");
  });

  it("retourne gagne pour gagne", () => {
    expect(obtenirCouleurStatutPipeline("gagne")).toBe("gagne");
  });

  it("retourne perdu pour perdu", () => {
    expect(obtenirCouleurStatutPipeline("perdu")).toBe("perdu");
  });
});
