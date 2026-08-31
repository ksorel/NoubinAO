import { describe, expect, it } from "vitest";
import { ExtractionAoSchema } from "./schema";

describe("ExtractionAoSchema", () => {
  it("valide un objet d'extraction complet", () => {
    const resultat = ExtractionAoSchema.parse({
      titre: "Construction d'un pont",
      acheteur: "Ministère des Infrastructures",
      secteur: "BTP",
      date_limite: "2026-11-03T12:00:00Z",
      montant_caution: 5000000,
      sommaire_attendu: ["Présentation de l'entreprise"],
      exigences: [
        {
          type_exigence: "piece_requise",
          libelle: "RCCM",
          description: "Registre du Commerce",
          ponderation: null,
          source_section: "DPAO",
        },
        {
          type_exigence: "critere_evaluation",
          libelle: "Conformité administrative",
          description: null,
          ponderation: 20,
          source_section: "DPAO",
        },
      ],
    });

    expect(resultat.titre).toBe("Construction d'un pont");
    expect(resultat.exigences).toHaveLength(2);
    expect(resultat.exigences[1].ponderation).toBe(20);
  });

  it("accepte des champs nuls quand l'information est absente", () => {
    const resultat = ExtractionAoSchema.parse({
      titre: null,
      acheteur: null,
      secteur: null,
      date_limite: null,
      montant_caution: null,
      sommaire_attendu: [],
      exigences: [],
    });

    expect(resultat.titre).toBeNull();
    expect(resultat.date_limite).toBeNull();
  });

  it("rejette un type_exigence hors énumération", () => {
    expect(() =>
      ExtractionAoSchema.parse({
        titre: null,
        acheteur: null,
        secteur: null,
        date_limite: null,
        montant_caution: null,
        sommaire_attendu: [],
        exigences: [
          {
            type_exigence: "invalide",
            libelle: "X",
            description: null,
            ponderation: null,
            source_section: "DPAO",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejette une date_limite qui n'est pas au format ISO 8601", () => {
    expect(() =>
      ExtractionAoSchema.parse({
        titre: null,
        acheteur: null,
        secteur: null,
        date_limite: "3 novembre 2026",
        montant_caution: null,
        sommaire_attendu: [],
        exigences: [],
      }),
    ).toThrow();
  });
});
