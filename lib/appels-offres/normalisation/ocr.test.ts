import { describe, expect, it, vi } from "vitest";

const creerMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    get messages() {
      return { create: creerMock };
    }
  },
}));

import { lireImageParClaude } from "./ocr";

describe("lireImageParClaude", () => {
  it("retourne le texte transcrit par Claude", async () => {
    creerMock.mockResolvedValue({
      content: [{ type: "text", text: "Texte transcrit de l'image." }],
    });

    const resultat = await lireImageParClaude(Buffer.from("image-fictive"));

    expect(resultat).toBe("Texte transcrit de l'image.");
  });

  it("retourne une chaîne vide si la réponse ne contient aucun bloc texte", async () => {
    creerMock.mockResolvedValue({ content: [] });

    const resultat = await lireImageParClaude(Buffer.from("image-fictive"));

    expect(resultat).toBe("");
  });
});
