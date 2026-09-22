import { describe, expect, it, vi } from "vitest";

const creerMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    get messages() {
      return { create: creerMock };
    }
  },
}));

import { structurerAvis } from "./structurer";

describe("structurerAvis", () => {
  it("construit un prompt demandant le type, le secteur et les champs structurés", async () => {
    creerMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            type: null,
            autorite_contractante: null,
            objet: null,
            secteur: null,
            montant_caution: null,
            date_limite_remise_offres: null,
            contact_retrait: null,
            nombre_lots: null,
          }),
        },
      ],
    });

    await structurerAvis("ARTICLE 1 : AUTORITE CONTRACTANTE\nLe présent appel...");

    const promptEnvoye = creerMock.mock.calls[0][0].messages[0].content as string;
    expect(promptEnvoye).toContain("type");
    expect(promptEnvoye).toContain("secteur");
    expect(promptEnvoye).toContain("date_limite_remise_offres");
  });

  it("parse une réponse JSON valide en objet AvisStructure", async () => {
    creerMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            type: "travaux",
            autorite_contractante: "Mairie de Ouragahio",
            objet: "Extension du réseau électrique",
            secteur: "BTP",
            montant_caution: 2300000,
            date_limite_remise_offres: "2026-10-23",
            contact_retrait: "Mairie de Ouragahio, Cel. 07 99 22 87 98",
            nombre_lots: 2,
          }),
        },
      ],
    });

    const resultat = await structurerAvis("ARTICLE 1 : AUTORITE CONTRACTANTE\n...");

    expect(resultat.type).toBe("travaux");
    expect(resultat.autorite_contractante).toBe("Mairie de Ouragahio");
    expect(resultat.montant_caution).toBe(2300000);
  });

  it("lève une erreur explicite si la réponse ne contient aucun JSON exploitable", async () => {
    creerMock.mockResolvedValue({
      content: [{ type: "text", text: "Désolé, je ne peux pas extraire ces informations." }],
    });

    await expect(structurerAvis("texte")).rejects.toThrow("Réponse Claude sans JSON exploitable");
  });
});
