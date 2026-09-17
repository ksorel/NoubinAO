import { describe, expect, it } from "vitest";
import { construirePromptCvTransformation } from "./cv-transformation";

describe("construirePromptCvTransformation", () => {
  it("inclut le contenu du CV source dans le prompt", () => {
    const prompt = construirePromptCvTransformation(
      "Jean Dupont, Ingénieur, 10 ans d'expérience",
      "## Identité\n## Formation\n## Expérience",
    );
    expect(prompt).toContain("Jean Dupont, Ingénieur, 10 ans d'expérience");
  });

  it("inclut la structure du modèle cible dans le prompt", () => {
    const prompt = construirePromptCvTransformation(
      "Jean Dupont, Ingénieur, 10 ans d'expérience",
      "## Identité\n## Formation\n## Expérience",
    );
    expect(prompt).toContain("## Identité\n## Formation\n## Expérience");
  });

  it("contient une consigne explicite contre l'invention d'informations", () => {
    const prompt = construirePromptCvTransformation("CV source", "Modèle cible");
    expect(prompt.toLowerCase()).toContain("n'invente aucune information");
  });

  it("contient une consigne pour marquer une rubrique sans équivalent", () => {
    const prompt = construirePromptCvTransformation("CV source", "Modèle cible");
    expect(prompt).toContain("[à compléter]");
  });
});
