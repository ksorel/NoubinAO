import { describe, expect, it } from "vitest";
import { ExtractionDaoSchema } from "./schema";

describe("ExtractionDaoSchema", () => {
  it("valide un objet d'extraction complet", () => {
    const resultat = ExtractionDaoSchema.parse({
      pieces_requises: [
        { type: "RCCM", description: "Registre du Commerce", source: "DPAO" },
      ],
      criteres_evaluation: [
        { critere: "Conformité administrative", ponderation: 20, source: "DPAO" },
      ],
      sommaire_attendu: ["Présentation de l'entreprise"],
      delai_depot: "15 octobre 2026 à 12h00",
    });

    expect(resultat.pieces_requises).toHaveLength(1);
    expect(resultat.criteres_evaluation[0].ponderation).toBe(20);
  });

  it("accepte une pondération nulle et un délai nul", () => {
    const resultat = ExtractionDaoSchema.parse({
      pieces_requises: [],
      criteres_evaluation: [{ critere: "Non chiffré", ponderation: null, source: "DPAO" }],
      sommaire_attendu: [],
      delai_depot: null,
    });

    expect(resultat.criteres_evaluation[0].ponderation).toBeNull();
    expect(resultat.delai_depot).toBeNull();
  });

  it("rejette un objet sans le champ source sur une pièce requise", () => {
    expect(() =>
      ExtractionDaoSchema.parse({
        pieces_requises: [{ type: "RCCM" }],
        criteres_evaluation: [],
        sommaire_attendu: [],
        delai_depot: null,
      })
    ).toThrow();
  });
});
