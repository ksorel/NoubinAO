import { readFile } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extraireMarkdownDocx } from "./docx";

describe("extraireMarkdownDocx", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("convertit le contenu texte d'un DOCX en Markdown", async () => {
    const buffer = await readFile(
      path.join("fixtures", "dao", "normalisation-docx-test.docx"),
    );

    const markdown = await extraireMarkdownDocx(buffer);

    expect(markdown).toContain("AVIS D'APPEL D'OFFRES");
    expect(markdown).toContain("Contenu de l'avis en DOCX.");
    expect(markdown).toContain("DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES");
    expect(markdown).toContain("Contenu du DPAO en DOCX.");
  });

  it("supprime les images intégrées en base64, sans valeur pour l'extraction", async () => {
    // Reproduit un DAO DOCX réel (2026-09-04) : un logo placé en haut du
    // document, converti par mammoth en data URI base64, saturait à lui
    // seul le plafond de sécurité de construireContenuPertinent et
    // repoussait le DPAO/Critères hors du contenu envoyé à Claude.
    vi.spyOn(mammoth, "convertToHtml").mockResolvedValue({
      value:
        '<p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA" /></p>' +
        "<p>Contenu réel du DAO.</p>",
      messages: [],
    });

    const markdown = await extraireMarkdownDocx(Buffer.from(""));

    expect(markdown).not.toContain("base64");
    expect(markdown).not.toContain("data:image");
    expect(markdown).toContain("Contenu réel du DAO.");
  });
});
