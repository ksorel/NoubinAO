import type { PageTexte } from "./types";

export interface SectionMarkdown {
  titre: string;
  contenu: string;
}

const TITRES_CONNUS = [
  "AVIS D'APPEL D'OFFRES",
  "INSTRUCTIONS AUX SOUMISSIONNAIRES",
  "DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES",
  "CAHIER DES CLAUSES ADMINISTRATIVES GÉNÉRALES",
  "CAHIER DES CLAUSES ADMINISTRATIVES PARTICULIÈRES",
  "SOMMAIRE ATTENDU DE L'OFFRE",
];

export function insererMarqueursTitres(texte: string): string {
  let resultat = texte;
  for (const titre of TITRES_CONNUS) {
    resultat = resultat.split(titre).join(`\n## ${titre}\n`);
  }
  return resultat;
}

export function structurerEnMarkdownHeuristique(pages: PageTexte[]): string {
  return pages.map((page) => insererMarqueursTitres(page.texte)).join("\n\n");
}

export function decouperParSection(markdown: string): SectionMarkdown[] {
  const sections: SectionMarkdown[] = [];
  const lignes = markdown.split("\n");
  let titreCourant = "Introduction";
  let contenuCourant: string[] = [];

  for (const ligne of lignes) {
    const correspondance = ligne.match(/^##\s+(.+)/);
    if (correspondance) {
      sections.push({ titre: titreCourant, contenu: contenuCourant.join("\n").trim() });
      titreCourant = correspondance[1].trim();
      contenuCourant = [];
    } else {
      contenuCourant.push(ligne);
    }
  }
  sections.push({ titre: titreCourant, contenu: contenuCourant.join("\n").trim() });

  return sections.filter((s) => s.contenu.length > 0 || s.titre !== "Introduction");
}
