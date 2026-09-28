import { describe, expect, it } from "vitest";
import { construireCheminStockageDao } from "./storage-path";

describe("construireCheminStockageDao", () => {
  it("préfixe le chemin par l'id entreprise, le segment appels-offres, l'id de l'appel d'offres et l'index (0 par défaut)", () => {
    const chemin = construireCheminStockageDao("ent-1", "ao-1", "dao.pdf");
    expect(chemin).toBe("ent-1/appels-offres/ao-1-0-dao.pdf");
  });

  it("nettoie les caractères non sûrs du nom de fichier", () => {
    const chemin = construireCheminStockageDao(
      "ent-1",
      "ao-1",
      "DAO Voirie (final).pdf",
    );
    expect(chemin).toBe("ent-1/appels-offres/ao-1-0-DAO_Voirie__final_.pdf");
  });

  it("utilise l'index fourni pour distinguer plusieurs fichiers d'un même AO", () => {
    const chemin = construireCheminStockageDao("ent-1", "ao-1", "dpao.pdf", 2);
    expect(chemin).toBe("ent-1/appels-offres/ao-1-2-dpao.pdf");
  });
});
