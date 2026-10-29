import { describe, expect, it } from "vitest";
import { listerCandidatsModeleCv } from "./modele-cv-candidats";

describe("listerCandidatsModeleCv", () => {
  it("retourne un tableau vide sans markdown", () => {
    expect(listerCandidatsModeleCv(null)).toEqual([]);
  });

  it("repère une section dont le titre contient CV ou curriculum, insensible à la casse", () => {
    const markdown = [
      "## Avis d'Appel d'Offres",
      "Contenu de l'avis.",
      "## Annexe C - Curriculum Vitae du Personnel Proposé",
      "Nom, prénom, diplôme, expérience...",
      "## Modèle de CV",
      "Rubrique 1. Rubrique 2.",
    ].join("\n");

    const candidats = listerCandidatsModeleCv(markdown);
    expect(candidats.map((c) => c.titre)).toEqual([
      "Annexe C - Curriculum Vitae du Personnel Proposé",
      "Modèle de CV",
    ]);
  });

  it("ignore les sections sans rapport et celles sans contenu", () => {
    const markdown = [
      "## Critères d'évaluation",
      "Pondération...",
      "## CV",
      "",
    ].join("\n");

    expect(listerCandidatsModeleCv(markdown)).toEqual([]);
  });

  it("tronque l'aperçu à 200 caractères", () => {
    const contenuLong = "x".repeat(300);
    const markdown = `## Modèle de CV\n${contenuLong}`;

    const candidats = listerCandidatsModeleCv(markdown);
    expect(candidats[0].apercu).toHaveLength(201);
    expect(candidats[0].apercu.endsWith("…")).toBe(true);
  });
});
