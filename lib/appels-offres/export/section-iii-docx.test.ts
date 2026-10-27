import { describe, expect, it } from "vitest";
import { genererDocumentSectionIII } from "./section-iii-docx";
import type { PlanSectionIII } from "./section-iii";

function creerPlan(partiel: Partial<PlanSectionIII> = {}): PlanSectionIII {
  return {
    titre: "Fourniture d'équipements",
    acheteur: "CI-ENERGIES",
    lignes: [
      {
        numero: "6.1",
        equipement: "Pince ampèremétrique",
        specsExigees: ["Intensité nominale >= 1500 A"],
        specsProposees: ["1500 A"],
        produitRetenuLabel: "Fluke 376",
      },
    ],
    representantLegalNom: "Jean Kouassi",
    representantLegalQualite: "Gérant",
    nomEntreprise: "SARL Exemple",
    ...partiel,
  };
}

describe("genererDocumentSectionIII", () => {
  it("génère un buffer non vide avec des lignes", async () => {
    const buffer = await genererDocumentSectionIII(creerPlan());
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("génère un buffer non vide sans aucune ligne", async () => {
    const buffer = await genererDocumentSectionIII(creerPlan({ lignes: [] }));
    expect(buffer.length).toBeGreaterThan(0);
  });
});
