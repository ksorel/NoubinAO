import { describe, expect, it } from "vitest";
import {
  construireCheminStockageDao,
  construireCheminStockageExportBpu,
  construireCheminStockageExportGoNoGo,
} from "./storage-path";

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

describe("construireCheminStockageExportBpu", () => {
  it("construit un chemin fixe sous exports/, en .xlsx", () => {
    const chemin = construireCheminStockageExportBpu("ent-1", "ao-1");
    expect(chemin).toBe("ent-1/appels-offres/exports/ao-1-bpu.xlsx");
  });
});

describe("construireCheminStockageExportGoNoGo", () => {
  it("construit un chemin sous exports/ avec l'extension demandée", () => {
    expect(construireCheminStockageExportGoNoGo("ent-1", "ao-1", "docx")).toBe(
      "ent-1/appels-offres/exports/ao-1-go-no-go.docx",
    );
    expect(construireCheminStockageExportGoNoGo("ent-1", "ao-1", "xlsx")).toBe(
      "ent-1/appels-offres/exports/ao-1-go-no-go.xlsx",
    );
    expect(construireCheminStockageExportGoNoGo("ent-1", "ao-1", "pdf")).toBe(
      "ent-1/appels-offres/exports/ao-1-go-no-go.pdf",
    );
  });
});
