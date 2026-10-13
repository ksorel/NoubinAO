import { describe, expect, it, vi } from "vitest";

const creerMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    get messages() {
      return { create: creerMock };
    }
  },
}));

import { genererSyntheseGoNoGo } from "./generer";
import { CLES_QUESTION_GO_NO_GO } from "../types";

const daoMarkdown = "## AVIS D'APPEL D'OFFRES\nConstruction d'un pont, par le Ministère X.";

function reponseJson(texte: string) {
  return { content: [{ type: "text", text: texte }] };
}

describe("genererSyntheseGoNoGo", () => {
  it("construit un prompt listant les 8 questions fixes", async () => {
    creerMock.mockResolvedValue(reponseJson(JSON.stringify({ reponses: [] })));

    await genererSyntheseGoNoGo(daoMarkdown);

    const promptEnvoye = creerMock.mock.calls[0][0].messages[0].content as string;
    for (const cle of CLES_QUESTION_GO_NO_GO) {
      expect(promptEnvoye).toContain(cle);
    }
  });

  it("parse une réponse JSON valide et la renvoie dans l'ordre des clés fixes", async () => {
    creerMock.mockResolvedValue(
      reponseJson(
        JSON.stringify({
          reponses: [
            {
              cle: "personnel_qualifie",
              reponse: "3 ingénieurs BTP requis, CV demandés.",
              source_section: "IS 4.2",
            },
            {
              cle: "facteurs_eliminatoires",
              reponse: "RCCM manquant entraîne le rejet.",
              source_section: "DPAO",
            },
          ],
        }),
      ),
    );

    const resultat = await genererSyntheseGoNoGo(daoMarkdown);

    expect(resultat).toHaveLength(CLES_QUESTION_GO_NO_GO.length);
    expect(resultat[0].cle).toBe("facteurs_eliminatoires");
    expect(resultat[0].reponse).toBe("RCCM manquant entraîne le rejet.");
    expect(resultat[1].cle).toBe("personnel_qualifie");
  });

  it("complète par une réponse par défaut les clés omises par Claude", async () => {
    creerMock.mockResolvedValue(
      reponseJson(
        JSON.stringify({
          reponses: [
            { cle: "facteurs_eliminatoires", reponse: "Aucun.", source_section: null },
          ],
        }),
      ),
    );

    const resultat = await genererSyntheseGoNoGo(daoMarkdown);

    expect(resultat).toHaveLength(CLES_QUESTION_GO_NO_GO.length);
    const offreFinanciere = resultat.find((r) => r.cle === "offre_financiere");
    expect(offreFinanciere?.reponse).toBe("Non précisé dans le DAO.");
    expect(offreFinanciere?.source_section).toBeNull();
  });

  it("propage une erreur si la réponse ne respecte pas le schéma", async () => {
    creerMock.mockResolvedValue(reponseJson(JSON.stringify({ reponses: [{ cle: "invalide" }] })));

    await expect(genererSyntheseGoNoGo(daoMarkdown)).rejects.toThrow();
  });

  it("propage une erreur si la réponse ne contient aucun JSON exploitable", async () => {
    creerMock.mockResolvedValue(reponseJson("Désolé, je ne peux pas répondre."));

    await expect(genererSyntheseGoNoGo(daoMarkdown)).rejects.toThrow(
      "Réponse Claude sans JSON exploitable.",
    );
  });
});
