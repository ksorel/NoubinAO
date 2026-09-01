import type { StatutTraitementAo } from "./types";

export type CouleurStatutTraitement = "identifie" | "preparation" | "gagne" | "perdu";
export type IconeStatutTraitement = "horloge" | "chargement" | "coche" | "alerte";

export interface ConfigStatutTraitement {
  couleur: CouleurStatutTraitement;
  icone: IconeStatutTraitement;
  cleLibelle: string;
}

export function obtenirConfigStatutTraitement(
  statut: StatutTraitementAo,
): ConfigStatutTraitement {
  switch (statut) {
    case "en_attente":
      return { couleur: "identifie", icone: "horloge", cleLibelle: "badge.enAttente" };
    case "normalisation":
      return {
        couleur: "preparation",
        icone: "chargement",
        cleLibelle: "badge.normalisationEnCours",
      };
    case "extraction":
      return {
        couleur: "preparation",
        icone: "chargement",
        cleLibelle: "badge.extractionEnCours",
      };
    case "termine":
      return { couleur: "gagne", icone: "coche", cleLibelle: "badge.termine" };
    case "erreur":
      return { couleur: "perdu", icone: "alerte", cleLibelle: "badge.erreur" };
  }
}
