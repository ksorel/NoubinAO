import { describe, expect, it } from "vitest";
import { genererDocumentWord } from "./docx";
import type { PlanExport } from "./plan";

// Un .docx est une archive zip : pour vérifier qu'une image a réellement été
// insérée (pas seulement qu'un buffer non vide a été produit, ce qui serait
// vrai même si la logique d'insertion était cassée), on liste les noms des
// entrées du répertoire central du zip et on compte celles sous
// "word/media/". Lecture volontairement minimale (pas de décompression, pas
// de nouvelle dépendance npm) : on localise le répertoire central via l'en-
// registrement "fin de répertoire central" (EOCD, signature PK\x05\x06),
// puis on parcourt ses en-têtes à largeur fixe (46 octets + nom + extra +
// commentaire) - format ZIP standard, fiable pour un fichier produit par
// `docx`/Packer qui n'ajoute pas de commentaire d'archive.
function listerEntreesZip(buffer: Buffer): string[] {
  const signatureEocd = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const indexEocd = buffer.lastIndexOf(signatureEocd);
  if (indexEocd === -1) {
    throw new Error("Fin de répertoire central introuvable - fichier zip invalide");
  }
  const tailleRepertoireCentral = buffer.readUInt32LE(indexEocd + 12);
  const offsetRepertoireCentral = buffer.readUInt32LE(indexEocd + 16);
  const entrees: string[] = [];
  let offset = offsetRepertoireCentral;
  const fin = offsetRepertoireCentral + tailleRepertoireCentral;
  while (offset < fin) {
    const longueurNom = buffer.readUInt16LE(offset + 28);
    const longueurExtra = buffer.readUInt16LE(offset + 30);
    const longueurCommentaire = buffer.readUInt16LE(offset + 32);
    const nom = buffer.toString("utf-8", offset + 46, offset + 46 + longueurNom);
    entrees.push(nom);
    offset += 46 + longueurNom + longueurExtra + longueurCommentaire;
  }
  return entrees;
}

function compterImagesMedia(buffer: Buffer): number {
  // Exclut l'entrée de répertoire "word/media/" elle-même (présente dans le
  // zip même sans image) - seules les entrées de fichier (qui ne terminent
  // pas par "/") comptent comme image insérée.
  return listerEntreesZip(buffer).filter((nom) => nom.startsWith("word/media/") && !nom.endsWith("/")).length;
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
    it("insère 2 images (signature + cachet) pour une lettre de soumission avec les deux", async () => {
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
      expect(compterImagesMedia(buffer)).toBe(2);
    });

    it("insère 1 image (signature seule) pour une lettre de soumission sans cachet", async () => {
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
      expect(compterImagesMedia(buffer)).toBe(1);
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
      expect(compterImagesMedia(buffer)).toBe(0);
    });
  });
});
