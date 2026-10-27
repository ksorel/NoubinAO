import { describe, expect, it } from "vitest";
import { referenceCorrespondCriteres, filtrerReferences } from "./reference-filtre";

const AUCUN_CRITERE = { periodeDebut: null, periodeFin: null, natureTags: [], montantMinimal: null };

function reference(overrides: Partial<{ date_fin: string | null; nature_tags: string[]; montant: number | null }> = {}) {
  return {
    date_fin: "2023-06-01",
    nature_tags: ["btp", "electricite"],
    montant: 50_000_000,
    ...overrides,
  };
}

describe("referenceCorrespondCriteres", () => {
  it("correspond à tout quand aucun critère n'est renseigné", () => {
    expect(referenceCorrespondCriteres(reference(), AUCUN_CRITERE)).toBe(true);
  });

  it("filtre par période exigée sur date_fin (cas réel : 2022-2025)", () => {
    const criteres = { ...AUCUN_CRITERE, periodeDebut: "2022-01-01", periodeFin: "2025-12-31" };
    expect(referenceCorrespondCriteres(reference({ date_fin: "2023-06-01" }), criteres)).toBe(true);
    expect(referenceCorrespondCriteres(reference({ date_fin: "2019-01-01" }), criteres)).toBe(false);
    expect(referenceCorrespondCriteres(reference({ date_fin: "2026-01-01" }), criteres)).toBe(false);
  });

  it("exclut une référence sans date_fin quand une période est exigée", () => {
    const criteres = { ...AUCUN_CRITERE, periodeDebut: "2022-01-01", periodeFin: "2025-12-31" };
    expect(referenceCorrespondCriteres(reference({ date_fin: null }), criteres)).toBe(false);
  });

  it("filtre par intersection de nature (tags)", () => {
    const criteres = { ...AUCUN_CRITERE, natureTags: ["energie_climat"] };
    expect(referenceCorrespondCriteres(reference({ nature_tags: ["btp"] }), criteres)).toBe(false);
    expect(
      referenceCorrespondCriteres(reference({ nature_tags: ["btp", "energie_climat"] }), criteres),
    ).toBe(true);
  });

  it("filtre par montant minimal", () => {
    const criteres = { ...AUCUN_CRITERE, montantMinimal: 100_000_000 };
    expect(referenceCorrespondCriteres(reference({ montant: 50_000_000 }), criteres)).toBe(false);
    expect(referenceCorrespondCriteres(reference({ montant: null }), criteres)).toBe(false);
    expect(referenceCorrespondCriteres(reference({ montant: 150_000_000 }), criteres)).toBe(true);
  });

  it("filtrerReferences ne garde que les références correspondantes", () => {
    const criteres = { ...AUCUN_CRITERE, montantMinimal: 100_000_000 };
    const resultat = filtrerReferences(
      [reference({ montant: 50_000_000 }), reference({ montant: 150_000_000 })],
      criteres,
    );
    expect(resultat).toHaveLength(1);
  });
});
