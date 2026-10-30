import { describe, expect, it } from "vitest";
import { PDFDict, PDFName, PDFRawStream, PDFDocument } from "pdf-lib";
import { genererPdfDossier } from "./pdf";
import type { PlanExport } from "./plan";

// Plus petit PNG valide possible (1x1 pixel transparent) - nécessaire ici
// car pdf-lib décode réellement le buffer (contrairement à docx.ImageRun,
// qui accepte n'importe quel buffer sans le valider).
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

// Vérifie qu'une image a réellement été incorporée au PDF (pas seulement
// qu'un buffer non vide a été produit, ce qui serait vrai même si la logique
// d'insertion était cassée ou inversée) : recharge le document avec pdf-lib
// et compte les objets indirects dont le dictionnaire porte `/Subtype
// /Image` - c'est-à-dire les XObjects image réellement incorporés par
// embedPng/embedJpg, qu'ils proviennent de la signature ou du cachet.
async function compterImagesIncorporees(buffer: Buffer): Promise<number> {
  const document = await PDFDocument.load(buffer);
  let total = 0;
  for (const [, objet] of document.context.enumerateIndirectObjects()) {
    const dict = objet instanceof PDFRawStream ? objet.dict : objet instanceof PDFDict ? objet : null;
    if (dict?.get(PDFName.of("Subtype"))?.toString() === "/Image") {
      total++;
    }
  }
  return total;
}

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

  describe("signature et cachet (gabarits signés)", () => {
    it("incorpore 2 images (signature + cachet) pour une lettre de soumission avec les deux", async () => {
      const buffer = await genererPdfDossier(
        creerPlan({
          sectionsRedigees: [
            {
              titre: "Lettre de soumission",
              contenu: "Je soussigné...\n\nLe représentant légal,\nJean Kouassi",
            },
          ],
          signature: { buffer: PNG_1X1, type: "png" },
          cachet: { buffer: PNG_1X1, type: "png" },
        }),
      );
      expect(await compterImagesIncorporees(buffer)).toBe(2);
    });

    it("incorpore 1 image (cachet seul) pour une lettre de soumission sans signature", async () => {
      const buffer = await genererPdfDossier(
        creerPlan({
          sectionsRedigees: [
            {
              titre: "Lettre de soumission",
              contenu: "Je soussigné...\n\nLe représentant légal,\nJean Kouassi",
            },
          ],
          cachet: { buffer: PNG_1X1, type: "png" },
        }),
      );
      expect(await compterImagesIncorporees(buffer)).toBe(1);
    });

    it("n'incorpore aucune image dans un gabarit non signé (déclaration non reconnue)", async () => {
      const buffer = await genererPdfDossier(
        creerPlan({
          sectionsRedigees: [
            { titre: "Tableau du matériel", contenu: "Désignation : Pelle mécanique" },
          ],
          signature: { buffer: PNG_1X1, type: "png" },
          cachet: { buffer: PNG_1X1, type: "png" },
        }),
      );
      expect(await compterImagesIncorporees(buffer)).toBe(0);
    });

    it("n'échoue pas si l'image de signature est corrompue (JPEG mistypé .png) - seul le cachet valide est incorporé", async () => {
      // embedPng décode réellement le buffer (contrairement à docx.ImageRun) :
      // un buffer déclaré "png" mais qui n'en est pas un (ex. JPEG téléversé
      // sous extension .png, la validation d'upload ne vérifiant que
      // File.type) lève une exception. L'export entier ne doit pas échouer
      // pour autant - seule l'image invalide doit être omise.
      const buffer = await genererPdfDossier(
        creerPlan({
          sectionsRedigees: [
            {
              titre: "Lettre de soumission",
              contenu: "Je soussigné...\n\nLe représentant légal,\nJean Kouassi",
            },
          ],
          signature: { buffer: Buffer.from("ceci n'est pas un vrai png"), type: "png" },
          cachet: { buffer: PNG_1X1, type: "png" },
        }),
      );
      expect(await compterImagesIncorporees(buffer)).toBe(1);
    });
  });
});
