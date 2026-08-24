import { describe, expect, it } from "vitest";
import { deriverInitiales } from "./initiales";

describe("deriverInitiales", () => {
  it("prend la première lettre des deux premiers mots", () => {
    expect(deriverInitiales("Sorel Koné")).toBe("SK");
  });

  it("prend les deux premières lettres d'un nom à un seul mot", () => {
    expect(deriverInitiales("Sorel")).toBe("SO");
  });

  it("ignore les espaces superflus", () => {
    expect(deriverInitiales("  Sorel   Koné  ")).toBe("SK");
  });

  it("ignore les mots au-delà du deuxième", () => {
    expect(deriverInitiales("Jean Pierre Dupont")).toBe("JP");
  });

  it("retourne une chaîne vide pour un nom vide", () => {
    expect(deriverInitiales("")).toBe("");
  });
});
