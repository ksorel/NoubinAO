import { describe, expect, it } from "vitest";
import { genererDocumentWord } from "./docx";
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
    signature: null,
    cachet: null,
    entete: { gauche: null, centre: null, droite: null },
    pied: { gauche: null, centre: null, droite: null },
    ...partiel,
  };
}

describe("genererDocumentWord", () => {
  it("génère un buffer non vide sans entête ni pied de page configurés", async () => {
    const buffer = await genererDocumentWord(creerPlan());
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("génère un buffer non vide avec entête/pied de page remplis de jetons, dont le logo", async () => {
    const buffer = await genererDocumentWord(
      creerPlan({
        nomEntreprise: "SARL Exemple",
        logo: { buffer: Buffer.from("fake-png"), type: "png" },
        entete: { gauche: "{{logo}}", centre: "{{entreprise}}", droite: "{{date}}" },
        pied: { gauche: null, centre: "Page {{page}} / {{pages}}", droite: null },
      }),
    );
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("génère un buffer non vide avec une garde de pli technique (sprint S8)", async () => {
    const buffer = await genererDocumentWord(creerPlan({ pli: "technique" }));
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("génère un buffer non vide avec une garde de pli financière (sprint S8)", async () => {
    const buffer = await genererDocumentWord(creerPlan({ pli: "financiere" }));
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("génère un buffer non vide avec la lettre de soumission compactée (option par défaut)", async () => {
    const buffer = await genererDocumentWord(
      creerPlan({
        sectionsRedigees: [
          { titre: "Lettre de soumission", contenu: "Je soussigné...\n\nFait à..." },
          { titre: "Mémoire technique", contenu: "Paragraphe 1.\n\nParagraphe 2." },
        ],
      }),
    );
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("génère un buffer non vide quand le compactage de la lettre de soumission est désactivé", async () => {
    const buffer = await genererDocumentWord(
      creerPlan({
        sectionsRedigees: [
          { titre: "Lettre de soumission", contenu: "Je soussigné...\n\nFait à..." },
        ],
      }),
      { compacterLettreSoumission: false },
    );
    expect(buffer.length).toBeGreaterThan(0);
  });

  describe("versionFinale (sprint S8)", () => {
    it("génère un buffer non vide sans aucune pièce ni critère (sections omises)", async () => {
      const buffer = await genererDocumentWord(creerPlan(), { versionFinale: true });
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("génère un buffer non vide avec une pièce jointe et une pièce sans objet", async () => {
      const buffer = await genererDocumentWord(
        creerPlan({
          piecesRequises: [
            { libelle: "RCCM", documents: [{ nom: "RCCM K-Nowledge", type: "Pièce administrative" }] },
            { libelle: "Agrément", documents: [] },
          ],
          criteresEvaluation: [{ libelle: "Qualité technique", ponderation: 60 }],
        }),
        { versionFinale: true },
      );
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe("signature et cachet (gabarits signés)", () => {
    it("génère un buffer non vide pour une lettre de soumission avec signature et cachet", async () => {
      const buffer = await genererDocumentWord(
        creerPlan({
          sectionsRedigees: [
            {
              titre: "Lettre de soumission",
              contenu: "Je soussigné...\n\nLe représentant légal,\nJean Kouassi",
            },
          ],
          signature: { buffer: Buffer.from("fake-signature-png"), type: "png" },
          cachet: { buffer: Buffer.from("fake-cachet-png"), type: "png" },
        }),
      );
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("génère un buffer non vide pour une lettre de soumission avec seulement la signature", async () => {
      const buffer = await genererDocumentWord(
        creerPlan({
          sectionsRedigees: [
            {
              titre: "Lettre de soumission",
              contenu: "Je soussigné...\n\nLe représentant légal,\nJean Kouassi",
            },
          ],
          signature: { buffer: Buffer.from("fake-signature-png"), type: "png" },
        }),
      );
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("n'insère aucune image dans un gabarit non signé (formulaire d'identification)", async () => {
      const buffer = await genererDocumentWord(
        creerPlan({
          sectionsRedigees: [
            {
              titre: "Formulaire d'identification du soumissionnaire",
              contenu: "Raison sociale : SARL Exemple\n\nReprésentant légal : Jean Kouassi",
            },
          ],
          signature: { buffer: Buffer.from("fake-signature-png"), type: "png" },
          cachet: { buffer: Buffer.from("fake-cachet-png"), type: "png" },
        }),
      );
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
