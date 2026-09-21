import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/appels-offres/normalisation/normaliser", () => ({
  normaliserDao: vi.fn(async () => ({ markdown: "# DAO markdown", sections: [], sourceOcr: false })),
  MIME_PDF: "application/pdf",
  MIME_DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}));

vi.mock("@/lib/appels-offres/normalisation/ocr", () => ({
  lireImageParClaude: vi.fn(async () => "texte OCR de l'image"),
}));

vi.mock("word-extractor", () => ({
  default: class WordExtractorMock {
    async extract() {
      return { getBody: () => "texte du .doc legacy" };
    }
  },
}));

import { normaliserDocument } from "./normalisation";
import { normaliserDao } from "@/lib/appels-offres/normalisation/normaliser";
import { lireImageParClaude } from "@/lib/appels-offres/normalisation/ocr";

describe("normaliserDocument", () => {
  it("délègue à normaliserDao pour un PDF", async () => {
    const resultat = await normaliserDocument(Buffer.from("x"), "application/pdf");
    expect(resultat).toEqual({ markdown: "# DAO markdown", sourceOcr: false });
  });

  it("délègue à normaliserDao pour un DOCX", async () => {
    const resultat = await normaliserDocument(
      Buffer.from("x"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(resultat).toEqual({ markdown: "# DAO markdown", sourceOcr: false });
  });

  it("remonte sourceOcr:true pour un PDF dont au moins une page a été OCRisée", async () => {
    vi.mocked(normaliserDao).mockResolvedValueOnce({
      markdown: "# DAO markdown",
      sections: [],
      sourceOcr: true,
    });

    const resultat = await normaliserDocument(Buffer.from("x"), "application/pdf");
    expect(resultat).toEqual({ markdown: "# DAO markdown", sourceOcr: true });
  });

  it("passe par l'OCR Claude pour une image JPEG, sourceOcr à true", async () => {
    const resultat = await normaliserDocument(Buffer.from("x"), "image/jpeg");
    expect(resultat).toEqual({ markdown: "texte OCR de l'image", sourceOcr: true });
  });

  it("passe par l'OCR Claude pour une image PNG, sourceOcr à true", async () => {
    const resultat = await normaliserDocument(Buffer.from("x"), "image/png");
    expect(resultat).toEqual({ markdown: "texte OCR de l'image", sourceOcr: true });
  });

  it("extrait le texte brut d'un .doc legacy via word-extractor, sourceOcr à false", async () => {
    const resultat = await normaliserDocument(Buffer.from("x"), "application/msword");
    expect(resultat).toEqual({ markdown: "texte du .doc legacy", sourceOcr: false });
  });

  it("retourne markdown null pour un type MIME non reconnu", async () => {
    const resultat = await normaliserDocument(Buffer.from("x"), "application/zip");
    expect(resultat).toEqual({ markdown: null, sourceOcr: false });
  });

  it("plafonne l'OCR à 5 pages pour un document bibliothèque (risque de timeout Server Action)", async () => {
    const buffer = Buffer.from("x");
    await normaliserDocument(buffer, "application/pdf");
    expect(normaliserDao).toHaveBeenLastCalledWith(buffer, "application/pdf", { maxPagesOcr: 5 });
  });

  it("passe le media_type réel (jpeg vs png) à lireImageParClaude au lieu d'une valeur codée en dur", async () => {
    const buffer = Buffer.from("x");

    await normaliserDocument(buffer, "image/jpeg");
    expect(lireImageParClaude).toHaveBeenLastCalledWith(buffer, "image/jpeg");

    await normaliserDocument(buffer, "image/png");
    expect(lireImageParClaude).toHaveBeenLastCalledWith(buffer, "image/png");
  });
});
