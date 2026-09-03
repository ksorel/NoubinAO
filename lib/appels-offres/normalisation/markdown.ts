export interface SectionMarkdown {
  titre: string;
  contenu: string;
}

const TITRES_CONNUS = [
  "AVIS D'APPEL D'OFFRES",
  "INSTRUCTIONS AUX SOUMISSIONNAIRES",
  "INSTRUCTIONS AUX CANDIDATS",
  "DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES",
  // Jamais reconnue jusqu'ici : sans marqueur, tout le contenu entre DPAO et
  // le prochain titre connu (potentiellement Section III à VI en entier,
  // soit plusieurs dizaines de pages de formulaires vierges) restait
  // fusionné dans la section DPAO — noyant les vrais critères d'évaluation
  // dans du bruit et empêchant de les cibler séparément à l'extraction.
  "CRITÈRES D'ÉVALUATION ET DE QUALIFICATION",
  // Non envoyée à Claude (voir extraire.ts) — sert uniquement de borne pour
  // que la section précédente (Critères d'évaluation) ne s'étende pas
  // jusqu'aux formulaires vierges de la Section IV.
  "FORMULAIRES DE SOUMISSION",
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

function estMinuscule(caractere: string | undefined): boolean {
  if (caractere === undefined) return false;
  return /\p{Ll}/u.test(caractere);
}

// Confirmé sur un vrai DAO PDF (2026-09-03) : ces titres apparaissent aussi
// EN PASSANT dans le texte courant ("...tels que décrits dans l'Avis
// d'Appel d'Offres, les Données Particulières...", "...voir Section III.
// Critères d'évaluation..."), pas seulement comme véritables titres de
// section. Marquer chaque occurrence fragmentait le document en centaines
// de micro-sections et coupait des phrases en plein milieu — noyant le
// contenu réel des vraies sections (trouverSection dans extraire.ts
// récupérait alors des fragments quasi vides). Une mention en passant est
// presque toujours collée à du texte courant (minuscule ou virgule juste
// avant/après) ; un vrai titre de section est isolé (précédé de "Section
// N." ou d'un saut de paragraphe, suivi d'une majuscule, d'un chiffre,
// d'une parenthèse ou de rien).
export function insererMarqueursTitres(texte: string): string {
  let resultat = texte;
  for (const titre of TITRES_CONNUS) {
    const regex = construireRegexTitre(titre);
    resultat = resultat.replace(regex, (correspondance, offset: number, chaine: string) => {
      const avant = chaine.slice(0, offset).replace(/\s+$/, "");
      const apres = chaine.slice(offset + correspondance.length).replace(/^\s+/, "");
      const caractereAvant = avant.length > 0 ? avant[avant.length - 1] : undefined;
      const caractereApres = apres.length > 0 ? apres[0] : undefined;

      const mentionEnPassant =
        estMinuscule(caractereAvant) || estMinuscule(caractereApres) || caractereApres === ",";

      return mentionEnPassant ? correspondance : `\n## ${correspondance}\n`;
    });
  }
  return resultat;
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
