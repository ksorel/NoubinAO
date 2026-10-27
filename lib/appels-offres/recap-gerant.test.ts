import { describe, expect, it } from "vitest";
import { construireRecapGerant } from "./recap-gerant";

describe("construireRecapGerant", () => {
  it("liste les points faibles fournis", () => {
    const texte = construireRecapGerant({
      titre: "Construction d'un pont",
      montantHtFcfa: 12_500_000,
      margePourcentage: 18.4,
      piecesDeposees: 9,
      piecesTotal: 11,
      pointsFaibles: ["Référence antérieure à 2022", "Attestation CNPS expirée"],
    });

    expect(texte).toContain("Construction d'un pont");
    expect(texte).toContain("12 500 000 FCFA HT");
    expect(texte).toContain("18.4 %");
    expect(texte).toContain("9 / 11");
    expect(texte).toContain("- Référence antérieure à 2022");
    expect(texte).toContain("- Attestation CNPS expirée");
  });

  it("affiche un message rassurant quand aucun point faible n'est identifié", () => {
    const texte = construireRecapGerant({
      titre: "Construction d'un pont",
      montantHtFcfa: 12_500_000,
      margePourcentage: 18.4,
      piecesDeposees: 11,
      piecesTotal: 11,
      pointsFaibles: [],
    });

    expect(texte).toContain("Aucun point bloquant identifié.");
    expect(texte).not.toContain("Points faibles :");
  });
});
