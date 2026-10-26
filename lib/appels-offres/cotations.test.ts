import { describe, expect, it } from "vitest";
import { determinerMeilleureCotation, estCotationValide } from "./cotations";

describe("estCotationValide", () => {
  it("accepte une cotation sans date de validité", () => {
    expect(estCotationValide({ id: "1", prix: 100, validite_date: null }, new Date("2026-11-01"))).toBe(
      true,
    );
  });

  it("accepte toute cotation quand aucune date d'exécution n'est fournie", () => {
    expect(
      estCotationValide({ id: "1", prix: 100, validite_date: "2026-01-01" }, null),
    ).toBe(true);
  });

  it("accepte une cotation valide jusqu'à (ou après) la date d'exécution", () => {
    expect(
      estCotationValide({ id: "1", prix: 100, validite_date: "2026-12-01" }, new Date("2026-11-01")),
    ).toBe(true);
  });

  it("rejette une cotation expirée avant la date d'exécution", () => {
    expect(
      estCotationValide({ id: "1", prix: 100, validite_date: "2026-10-01" }, new Date("2026-11-01")),
    ).toBe(false);
  });
});

describe("determinerMeilleureCotation", () => {
  it("retourne null sur un tableau vide", () => {
    expect(determinerMeilleureCotation([])).toBeNull();
  });

  it("retient la cotation la moins chère", () => {
    const cotations = [
      { id: "a", prix: 500, validite_date: null },
      { id: "b", prix: 300, validite_date: null },
      { id: "c", prix: 400, validite_date: null },
    ];
    const resultat = determinerMeilleureCotation(cotations);
    expect(resultat?.cotation.id).toBe("b");
    expect(resultat?.cotationsExclues).toBe(0);
  });

  it("exclut les cotations expirées avant la date d'exécution", () => {
    const cotations = [
      { id: "moins-cher-expire", prix: 100, validite_date: "2026-10-01" },
      { id: "encore-valide", prix: 300, validite_date: "2026-12-01" },
    ];
    const resultat = determinerMeilleureCotation(cotations, new Date("2026-11-01"));
    expect(resultat?.cotation.id).toBe("encore-valide");
    expect(resultat?.cotationsExclues).toBe(1);
  });

  it("retourne null quand toutes les cotations sont expirées", () => {
    const cotations = [{ id: "a", prix: 100, validite_date: "2026-01-01" }];
    const resultat = determinerMeilleureCotation(cotations, new Date("2026-11-01"));
    expect(resultat).toBeNull();
  });
});
