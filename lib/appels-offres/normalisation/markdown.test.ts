import { describe, expect, it } from "vitest";
import {
  decouperParSection,
  insererMarqueursTitres,
  structurerEnMarkdownHeuristique,
} from "./markdown";
import type { PageTexte } from "./types";

describe("insererMarqueursTitres", () => {
  it("insère un marqueur ## devant chaque titre connu rencontré", () => {
    const resultat = insererMarqueursTitres("AVIS D'APPEL D'OFFRES Contenu de l'avis.");
    expect(resultat).toContain("## AVIS D'APPEL D'OFFRES");
  });

  it("insère un marqueur pour plusieurs titres dans le même texte", () => {
    const resultat = insererMarqueursTitres(
      "AVIS D'APPEL D'OFFRES Contenu. DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES Autre contenu.",
    );
    expect(resultat).toContain("## AVIS D'APPEL D'OFFRES");
    expect(resultat).toContain("## DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES");
  });

  it("laisse le texte inchangé si aucun titre connu n'est présent", () => {
    const resultat = insererMarqueursTitres("Texte sans titre connu.");
    expect(resultat).toBe("Texte sans titre connu.");
  });
});

describe("structurerEnMarkdownHeuristique", () => {
  it("applique l'insertion de marqueurs à chaque page et les concatène", () => {
    const pages: PageTexte[] = [
      { numero: 1, texte: "AVIS D'APPEL D'OFFRES Contenu de l'avis." },
      { numero: 2, texte: "DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES Contenu du DPAO." },
    ];

    const markdown = structurerEnMarkdownHeuristique(pages);

    expect(markdown).toContain("## AVIS D'APPEL D'OFFRES");
    expect(markdown).toContain("## DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES");
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
