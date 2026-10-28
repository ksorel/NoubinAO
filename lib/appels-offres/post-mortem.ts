// Post-mortem enrichi (Étape 9 "Après dépôt", parcours expert v2, voir
// CLAUDE.md) : écart de prix avec l'attributaire. La position dans la
// fourchette réutilise calculerPositionFourchette (indicateurs-chiffrage.ts)
// telle quelle, et la comparaison avec le score Go/No-Go prévu réutilise
// evaluerGoNoGo (go-no-go.ts, déjà consommé par le récapitulatif de la Vue
// d'ensemble) — rien d'autre à recalculer ici.
export interface EcartPrixAttributaire {
  ecartAbsolu: number;
  ecartPourcentage: number;
}

// null quand le prix de l'attributaire est inconnu ou à zéro (écart en %
// non défini) — l'appelant doit alors ne pas afficher l'écart plutôt que
// de diviser par zéro.
export function calculerEcartPrixAttributaire(
  notrePrix: number,
  prixAttributaire: number,
): EcartPrixAttributaire | null {
  if (prixAttributaire === 0) return null;
  const ecartAbsolu = notrePrix - prixAttributaire;
  const ecartPourcentage = (ecartAbsolu / prixAttributaire) * 100;
  return { ecartAbsolu, ecartPourcentage };
}
