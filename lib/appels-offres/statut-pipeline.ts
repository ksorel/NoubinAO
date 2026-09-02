import type { StatutPipelineAo } from "./types";

export type CouleurBadge = "identifie" | "preparation" | "soumis" | "gagne" | "perdu";

export function obtenirCouleurStatutPipeline(statut: StatutPipelineAo): CouleurBadge {
  switch (statut) {
    case "identifie":
      return "identifie";
    case "en_preparation":
      return "preparation";
    case "soumis":
      return "soumis";
    case "en_attente":
      return "identifie";
    case "gagne":
      return "gagne";
    case "perdu":
      return "perdu";
  }
}
