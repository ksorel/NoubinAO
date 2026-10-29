import { formaterMontant } from "./bpu";

// Récapitulatif gérant (sprint S8, parcours expert v2, voir CLAUDE.md,
// Étape 8 "Assemblage & dépôt") : 1 page en langage simple (montant, marge,
// points faibles, pièces déposées), pensée pour être envoyée telle quelle
// par WhatsApp ou e-mail après validation - pas un export Word, juste du
// texte brut (voir le composant appel-offres-detail.tsx pour les liens
// wa.me/mailto). Les libellés de points faibles sont déjà résolus par
// l'appelant (next-intl, controleCroise.rules.<id>.titre) : ce module reste
// sans dépendance à la locale, pour rester testable indépendamment du
// contexte React.
export interface DonneesRecapGerant {
  titre: string;
  montantHtFcfa: number;
  margePourcentage: number;
  piecesDeposees: number;
  piecesTotal: number;
  pointsFaibles: string[];
}

export function construireRecapGerant(donnees: DonneesRecapGerant): string {
  const lignes = [
    `Récapitulatif - ${donnees.titre}`,
    "",
    `Montant de l'offre : ${formaterMontant(donnees.montantHtFcfa)} FCFA HT`,
    `Marge : ${donnees.margePourcentage.toFixed(1)} %`,
    `Pièces déposées : ${donnees.piecesDeposees} / ${donnees.piecesTotal}`,
    "",
  ];

  if (donnees.pointsFaibles.length === 0) {
    lignes.push("Aucun point bloquant identifié.");
  } else {
    lignes.push("Points faibles :");
    for (const point of donnees.pointsFaibles) {
      lignes.push(`- ${point}`);
    }
  }

  return lignes.join("\n");
}
