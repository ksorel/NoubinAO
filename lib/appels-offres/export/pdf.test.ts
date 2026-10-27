import { describe, expect, it } from "vitest";
import { genererPdfDossier } from "./pdf";
import type { PlanExport } from "./plan";

function creerPlan(partiel: Partial<PlanExport> = {}): PlanExport {
  return {
    titre: "Construction d'un pont",
    acheteur: "Ministère des Infrastructures",
    secteur: "btp",
    dateExport: "19/10/2026",
    pli: null,
    sommaireAttendu: null,
    sectionsRedigees: [],
    piecesRequises: [],
    criteresEvaluation: [],
    bpu: null,
    nomEntreprise: null,
    logo: null,
    entete: { gauche: null, centre: null, droite: null },
    pied: { gauche: null, centre: null, droite: null },
    ...partiel,
  };
}

describe("genererPdfDossier", () => {
  it("génère un buffer non vide pour un plan minimal", async () => {
    const buffer = await genererPdfDossier(creerPlan());
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("génère un buffer non vide avec une garde de pli technique", async () => {
    const buffer = await genererPdfDossier(creerPlan({ pli: "technique" }));
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("génère un buffer non vide avec une garde de pli financière", async () => {
    const buffer = await genererPdfDossier(creerPlan({ pli: "financiere" }));
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("génère un buffer non vide avec sections, pièces, critères et BPU", async () => {
    const buffer = await genererPdfDossier(
      creerPlan({
        sommaireAttendu: ["Méthodologie"],
        sectionsRedigees: [{ titre: "Méthodologie", contenu: "Paragraphe 1.\n\nParagraphe 2." }],
        piecesRequises: [
          { libelle: "RCCM", documents: [{ nom: "RCCM K-Nowledge", type: "Pièce administrative" }] },
        ],
        criteresEvaluation: [{ libelle: "Qualité technique", ponderation: 60 }],
        bpu: {
          sections: [
            {
              titre: "Installation de chantier",
              lignes: [
                {
                  codeArticle: null,
                  designation: "Amenée et repli du matériel",
                  unite: "Ens",
                  quantite: 1,
                  prixUnitaire: 500000,
                  montant: 500000,
                },
              ],
              totalSection: 500000,
            },
          ],
          totalGeneral: 500000,
        },
      }),
    );
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("génère un buffer non vide en version finale (sections vides omises)", async () => {
    const buffer = await genererPdfDossier(creerPlan(), { versionFinale: true });
    expect(buffer.length).toBeGreaterThan(0);
  });
});
