import { describe, expect, it } from "vitest";
import { decouperParSection, structurerEnMarkdownHeuristique } from "./markdown";
import type { PageTexte } from "./pdf-texte";

describe("structurerEnMarkdownHeuristique", () => {
  it("injecte un titre ## pour chaque titre connu rencontré", () => {
    const pages: PageTexte[] = [
      { numero: 1, texte: "AVIS D'APPEL D'OFFRES Contenu de l'avis." },
    ];

    const markdown = structurerEnMarkdownHeuristique(pages);

    expect(markdown).toContain("## AVIS D'APPEL D'OFFRES");
  });
});

describe("decouperParSection", () => {
  it("découpe un Markdown en sections par titre ##", () => {
    const markdown = [
      "## AVIS D'APPEL D'OFFRES",
      "Contenu de l'AAO.",
      "## DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES",
      "Contenu du DPAO.",
    ].join("\n");

    const sections = decouperParSection(markdown);

    expect(sections).toHaveLength(2);
    expect(sections[0].titre).toBe("AVIS D'APPEL D'OFFRES");
    expect(sections[0].contenu).toContain("Contenu de l'AAO.");
    expect(sections[1].titre).toBe("DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES");
  });

  it("place le contenu avant le premier titre dans une section Introduction", () => {
    const markdown = "Texte avant tout titre.\n## PREMIER TITRE\nContenu.";

    const sections = decouperParSection(markdown);

    expect(sections[0].titre).toBe("Introduction");
    expect(sections[0].contenu).toContain("Texte avant tout titre.");
  });
});
