import { describe, expect, it } from "vitest";
import { construireCheminStockage } from "./storage-path";

describe("construireCheminStockage", () => {
  it("préfixe le chemin par l'id entreprise puis l'id document", () => {
    const chemin = construireCheminStockage(
      "ent-1",
      "doc-1",
      "rccm.pdf",
    );
    expect(chemin).toBe("ent-1/doc-1-rccm.pdf");
  });

  it("nettoie les caractères non sûrs du nom de fichier", () => {
    const chemin = construireCheminStockage(
      "ent-1",
      "doc-1",
      "RCCM 2026 (final).pdf",
    );
    expect(chemin).toBe("ent-1/doc-1-RCCM_2026__final_.pdf");
  });
});
