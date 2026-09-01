import type { AppelOffres, StatutTraitementAo } from "./types";

const STATUTS_EN_COURS: StatutTraitementAo[] = ["en_attente", "normalisation", "extraction"];

export function tousLesAoStabilises(appelsOffres: AppelOffres[]): boolean {
  return appelsOffres.every((ao) => !STATUTS_EN_COURS.includes(ao.statut_traitement));
}
