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

  it("reconnaît un titre avec apostrophe typographique (’) comme un DAO réel", () => {
    const resultat = insererMarqueursTitres("Section 0. AVIS D’APPEL D’OFFRES Contenu.");
    expect(resultat).toContain("## AVIS D’APPEL D’OFFRES");
  });

  it("reconnaît un titre en casse mixte, pas seulement en majuscules", () => {
    const resultat = insererMarqueursTitres(
      "Section VII. Cahier des Clauses Administratives Générales Contenu.",
    );
    expect(resultat).toContain("## Cahier des Clauses Administratives Générales");
  });

  it("reconnaît « Instructions aux Candidats » en plus de « Soumissionnaires »", () => {
    const resultat = insererMarqueursTitres("Section I. Instructions aux Candidats Contenu.");
    expect(resultat).toContain("## Instructions aux Candidats");
  });

  it("préserve la casse et l'apostrophe d'origine dans le marqueur inséré", () => {
    const resultat = insererMarqueursTitres("avis d’appel d’offres. Reste du texte.");
    expect(resultat).toContain("## avis d’appel d’offres");
  });

  it("ignore une mention en passant suivie d'une virgule (pas un vrai titre)", () => {
    // Reproduit un DAO réel : "...sont inclus dans la Section I, Instructions
    // aux candidats, et dans la Section V, Cahier des Clauses..."
    const resultat = insererMarqueursTitres(
      "sont inclus dans la Section I, Instructions aux Candidats, et dans la Section V.",
    );
    expect(resultat).not.toContain("##");
  });

  it("ignore une mention en passant suivie de texte courant en minuscule", () => {
    // Reproduit un DAO réel : "...et dans le Cahier des Clauses
    // Administratives Particulières. Des documents modèles sont présentés..."
    const resultat = insererMarqueursTitres(
      "et dans le Cahier des Clauses Administratives Particulières comprend des dispositions.",
    );
    expect(resultat).not.toContain("##");
  });

  it("reconnaît quand même un vrai titre isolé entre deux mentions en passant", () => {
    const resultat = insererMarqueursTitres(
      "voir la Section I, Instructions aux Candidats, ci-après.\n\nSection I. Instructions aux Candidats\n\nA. Généralités",
    );
    const occurrences = (resultat.match(/## Instructions aux Candidats/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it("reconnaît « Critères d'évaluation et de qualification » (Section III, jamais reconnue avant)", () => {
    const resultat = insererMarqueursTitres(
      "Section III. Critères d’évaluation et de qualification Contenu.",
    );
    expect(resultat).toContain("## Critères d’évaluation et de qualification");
  });

  it("reconnaît « Formulaires de soumission » comme borne de fin de section", () => {
    const resultat = insererMarqueursTitres("Section IV. Formulaires de soumission Contenu.");
    expect(resultat).toContain("## Formulaires de soumission");
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
