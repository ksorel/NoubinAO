import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extraireMarkdownDocx } from "./docx";

describe("extraireMarkdownDocx", () => {
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
});
