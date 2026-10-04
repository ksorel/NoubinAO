// Classe une pièce requise entre offre technique et offre financière, pour
// répartir l'affichage entre les deux onglets du détail AO (retour client
// 2026-10-04). Liste de mots-clés fermée plutôt qu'un modèle IA : les
// pièces financières d'un DAO ivoirien sont un petit ensemble récurrent
// (lettre de soumission, garantie/caution de soumission, BPU, DQE) — tout
// le reste (pièces administratives, références, CV, agréments...) est
// technique par défaut.
const MOTS_CLES_PIECE_FINANCIERE = [
  "lettre de soumission",
  "garantie de soumission",
  "caution de soumission",
  "bordereau des prix unitaires",
  "bpu",
  "devis quantitatif et estimatif",
  "dqe",
];

export type CategoriePiece = "technique" | "financiere";

export function classifierPieceRequise(libelle: string): CategoriePiece {
  const l = libelle.toLowerCase();
  return MOTS_CLES_PIECE_FINANCIERE.some((mot) => l.includes(mot))
    ? "financiere"
    : "technique";
}
