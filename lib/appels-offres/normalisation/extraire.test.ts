import { describe, expect, it, vi } from "vitest";

const creerMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    get messages() {
      return { create: creerMock };
    }
  },
}));

import { extraireInformationsAo } from "./extraire";
import type { SectionMarkdown } from "./markdown";

const sections: SectionMarkdown[] = [
  { titre: "AVIS D'APPEL D'OFFRES", contenu: "Construction d'un pont, par le Ministère X." },
];

describe("extraireInformationsAo", () => {
  it("construit un prompt demandant les champs étendus (titre, acheteur, date ISO)", async () => {
    creerMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            titre: null,
            acheteur: null,
            secteur: null,
            date_limite: null,
            montant_caution: null,
            sommaire_attendu: [],
            exigences: [],
          }),
        },
      ],
    });

    await extraireInformationsAo(sections);

    const promptEnvoye = creerMock.mock.calls[0][0].messages[0].content as string;
    expect(promptEnvoye).toContain("titre");
    expect(promptEnvoye).toContain("acheteur");
    expect(promptEnvoye).toContain("date_limite");
    expect(promptEnvoye).toContain("ISO 8601");
  });

  it("parse une réponse JSON valide en objet ExtractionAo", async () => {
    creerMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            titre: "Construction d'un pont",
            acheteur: "Ministère X",
            secteur: "BTP",
            date_limite: "2026-11-03T12:00:00Z",
            montant_caution: 5000000,
            sommaire_attendu: ["Méthodologie"],
            exigences: [
              {
                type_exigence: "piece_requise",
                libelle: "RCCM",
                description: null,
                ponderation: null,
                source_section: "DPAO",
              },
            ],
          }),
        },
      ],
    });

    const resultat = await extraireInformationsAo(sections);

    expect(resultat.titre).toBe("Construction d'un pont");
    expect(resultat.exigences).toHaveLength(1);
  });

  it("propage une erreur si la réponse ne respecte pas le schéma", async () => {
    creerMock.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ titre: 42 }) }],
    });

    await expect(extraireInformationsAo(sections)).rejects.toThrow();
  });
});
