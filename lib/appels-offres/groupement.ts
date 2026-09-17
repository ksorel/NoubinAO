import type { MembreGroupement } from "./types";

type MembreAvecPourcentage = Pick<MembreGroupement, "pourcentage">;

// Retourne null si aucun membre n'a de pourcentage renseigné (pour ne
// jamais afficher "0%" trompeur là où rien n'a encore été saisi). Les
// membres à null sont ignorés dans la somme, jamais traités comme 0.
export function calculerSommePourcentages(
  membres: MembreAvecPourcentage[],
): number | null {
  const renseignes = membres.filter((m) => m.pourcentage !== null);
  if (renseignes.length === 0) return null;
  return renseignes.reduce((total, m) => total + (m.pourcentage ?? 0), 0);
}
