import { describe, expect, it } from "vitest";
import { decouperParSection, insererMarqueursTitres } from "./markdown";

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

  it("ignore une mention en passant précédée d'une virgule, même suivie d'un point ou d'une parenthèse", () => {
    // Reproduit la régression réelle du DOCX (2026-09-03) : dans la Préface,
    // une énumération "Section V, Cahier des Clauses Administratives
    // Générales." et "Section II, Données Particulières de l'Appel
    // d'Offres (DPAO)" posait un faux marqueur ## tout en haut du document
    // (virgule AVANT la correspondance, point ou parenthèse après — non
    // couvert par la règle qui ne vérifiait que la virgule après).
    const resultat = insererMarqueursTitres(
      "inclus dans la Section V, Cahier des Clauses Administratives Générales. Les renseignements " +
        "sont précisés dans la Section II, Données Particulières de l'Appel d'Offres (DPAO).",
    );
    expect(resultat).not.toContain("##");
  });

  it("ignore une mention en passant déjà à l'intérieur d'un titre Markdown existant", () => {
    // Reproduit la régression réelle du DOCX (2026-09-04) : le "Sommaire"
    // en préambule du DAO est composé de vrais titres Word ("### Section
    // IV. Formulaires de soumission"), précédés d'un point (pas une
    // virgule) et suivis de rien — aucun signal de mention en passant
    // existant ne s'appliquait, et le marqueur ## fantôme inséré ici,
    // tout en haut du document, faisait croire à construireContenuPertinent
    // (extraire.ts) que la borne de fin "Formulaires de soumission" était
    // atteinte dès le Sommaire, coupant tout le reste du contenu utile.
    const texte = "### Section IV. Formulaires de soumission\n\nContenu réel plus loin dans le document.";

    const resultat = insererMarqueursTitres(texte);

    expect(resultat).toBe(texte);
  });

  it("ignore une énumération à puces de noms de sections (IC 6.1)", () => {
    // Reproduit la régression réelle du DOCX (2026-09-04) : la clause
    // IC 6.1, à l'intérieur même de la section "Instructions aux
    // Candidats", reprend la liste des sections sous forme de puces
    // ("*   Section IV. Formulaires de soumission"), sans être elle-même
    // un titre Markdown natif et précédée d'un point, pas une virgule —
    // aucun signal de mention en passant existant ne s'appliquait. Le
    // marqueur ## fantôme posé ici, dès le début d'Instructions aux
    // Candidats, faisait croire à construireContenuPertinent (extraire.ts)
    // que la borne de fin "Formulaires de soumission" était atteinte bien
    // avant la vraie fin — indépendant de la taille du plafond de
    // sécurité (confirmé : relever ce plafond à 250 000 caractères
    // n'avait rien changé).
    const texte =
      "*   Section II. Données Particulières de l'Appel d'Offres (DPAO)\n" +
      "*   Section III. Critères d'évaluation et de qualification\n" +
      "*   Section IV. Formulaires de soumission\n";

    const resultat = insererMarqueursTitres(texte);

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
