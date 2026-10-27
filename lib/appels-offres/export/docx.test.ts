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
});
