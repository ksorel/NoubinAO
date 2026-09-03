import type { PageTexte } from "./types";

export interface SectionMarkdown {
  titre: string;
  contenu: string;
}

const TITRES_CONNUS = [
  "AVIS D'APPEL D'OFFRES",
  "INSTRUCTIONS AUX SOUMISSIONNAIRES",
  "INSTRUCTIONS AUX CANDIDATS",
  "DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES",
  "CAHIER DES CLAUSES ADMINISTRATIVES GÉNÉRALES",
  "CAHIER DES CLAUSES ADMINISTRATIVES PARTICULIÈRES",
  "SOMMAIRE ATTENDU DE L'OFFRE",
];

// Recherche insensible à la casse et à la variante d'apostrophe (droite '
// vs typographique '/'). Confirmé sur un premier DAO réel (2026-09-03) :
// une comparaison exacte comme auparavant (`.split(titre).join(...)`) ne
// matche JAMAIS aucun titre réel — les documents ivoiriens utilisent des
// apostrophes typographiques et une casse mixte ("Cahier des Clauses...",
// pas "CAHIER DES CLAUSES..."), pas la casse uniforme majuscule supposée
// ici. Le texte original (casse/apostrophe réelles) est conservé dans le
// markdown produit ; seule la comparaison est normalisée.
function construireRegexTitre(titre: string): RegExp {
  const echappe = titre
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/'/g, "['’‘]");
  return new RegExp(echappe, "gi");
}

export function insererMarqueursTitres(texte: string): string {
  let resultat = texte;
  for (const titre of TITRES_CONNUS) {
    const regex = construireRegexTitre(titre);
    resultat = resultat.replace(regex, (correspondance) => `\n## ${correspondance}\n`);
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
