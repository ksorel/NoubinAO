import { extraireMotsCles } from "@/lib/texte/mots-cles";

export interface LigneBpuHistorique {
  designation: string;
  unite: string;
  prixUnitaire: number;
  appelOffresId: string;
  appelOffresTitre: string | null;
  appelOffresCreatedAt: string;
}

export interface SuggestionPrixBpu {
  prixUnitaire: number;
  designationOrigine: string;
  appelOffresTitre: string | null;
  appelOffresCreatedAt: string;
}

// Parmi les lignes BPU historiques (déjà filtrées à la même unité en amont,
// voir obtenirSuggestionPrixBpu dans actions.ts — le filtre unité est un
// filtre dur, pas un critère de score), retient celle dont la désignation
// partage le plus de mots-clés avec la désignation en cours. Aucun
// chevauchement : aucune suggestion, plutôt que proposer un prix sans
// rapport. Égalité de score : la ligne la plus récente l'emporte.
export function trouverMeilleureSuggestionPrix(
  designation: string,
  lignesHistoriques: LigneBpuHistorique[],
): SuggestionPrixBpu | null {
  const motsRecherches = extraireMotsCles(designation);
  if (motsRecherches.length === 0) return null;

  let meilleure: LigneBpuHistorique | null = null;
  let meilleurScore = 0;

  for (const ligne of lignesHistoriques) {
    const motsLigne = new Set(extraireMotsCles(ligne.designation));
    const score = motsRecherches.filter((mot) => motsLigne.has(mot)).length;
    if (score === 0) continue;

    if (
      meilleure === null ||
      score > meilleurScore ||
      (score === meilleurScore && ligne.appelOffresCreatedAt > meilleure.appelOffresCreatedAt)
    ) {
      meilleure = ligne;
      meilleurScore = score;
    }
  }

  if (meilleure === null) return null;
  return {
    prixUnitaire: meilleure.prixUnitaire,
    designationOrigine: meilleure.designation,
    appelOffresTitre: meilleure.appelOffresTitre,
    appelOffresCreatedAt: meilleure.appelOffresCreatedAt,
  };
}
