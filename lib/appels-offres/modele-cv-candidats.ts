import { decouperParSection } from "./normalisation/markdown";

export interface CandidatModeleCv {
  titre: string;
  apercu: string;
}

const LONGUEUR_APERCU = 200;

// Repère, parmi les sections déjà découpées du DAO (mêmes marqueurs ##
// que l'extraction des exigences - voir normalisation/markdown.ts), celles
// dont le titre évoque un modèle de CV imposé (très fréquent en annexe
// d'un DAO ivoirien : "Annexe C - Curriculum Vitae du Personnel Proposé",
// "Modèle de CV"...). Détection manuelle assistée seulement : l'utilisateur
// choisit lui-même la bonne section plutôt qu'un appel Claude qui
// devinerait - pas de coût API, pas de risque de mauvaise extraction.
const MOTS_CLES_TITRE = ["cv", "curriculum"];

export function listerCandidatsModeleCv(daoMarkdown: string | null): CandidatModeleCv[] {
  if (!daoMarkdown) return [];

  return decouperParSection(daoMarkdown)
    .filter((section) => {
      const titre = section.titre.toLowerCase();
      return MOTS_CLES_TITRE.some((mot) => titre.includes(mot)) && section.contenu.trim().length > 0;
    })
    .map((section) => ({
      titre: section.titre,
      apercu:
        section.contenu.length > LONGUEUR_APERCU
          ? `${section.contenu.slice(0, LONGUEUR_APERCU)}…`
          : section.contenu,
    }));
}
