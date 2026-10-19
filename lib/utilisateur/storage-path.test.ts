import { describe, expect, it } from "vitest";
import { construireCheminStockageLogo } from "./storage-path";

describe("construireCheminStockageLogo", () => {
  it("préfixe le chemin par l'id entreprise et le segment logo", () => {
    expect(construireCheminStockageLogo("ent-1", "logo.png")).toBe("ent-1/logo/logo.png");
  });

  it("nettoie les caractères non sûrs du nom de fichier", () => {
    expect(construireCheminStockageLogo("ent-1", "Logo K-Nowledge (2026).png")).toBe(
      "ent-1/logo/Logo_K-Nowledge__2026_.png",
    );
  });
});
