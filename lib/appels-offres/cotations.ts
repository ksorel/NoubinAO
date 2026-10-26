import type { CotationFournisseur } from "./types";

type Cotation = Pick<CotationFournisseur, "id" | "prix" | "validite_date">;

// Une cotation sans date de validité est traitée comme toujours valide
// (fournisseur n'ayant pas communiqué de limite) ; une cotation expirée
// avant la date d'exécution est écartée du comparatif, pas seulement
// signalée — un prix qui ne tiendra plus n'est pas une option.
export function estCotationValide(
  cotation: Cotation,
  dateExecution: Date | null,
): boolean {
  if (cotation.validite_date === null || dateExecution === null) return true;
  return new Date(cotation.validite_date) >= dateExecution;
}

export interface MeilleureCotation {
  cotation: Cotation;
  cotationsExclues: number;
}

// Moins-disante parmi les cotations encore valides à la date d'exécution.
// null si aucune cotation, ou si toutes sont expirées avant cette date.
export function determinerMeilleureCotation(
  cotations: Cotation[],
  dateExecution: Date | null = null,
): MeilleureCotation | null {
  const valides = cotations.filter((c) => estCotationValide(c, dateExecution));
  if (valides.length === 0) return null;

  const meilleure = valides.reduce((min, c) => (c.prix < min.prix ? c : min));
  return { cotation: meilleure, cotationsExclues: cotations.length - valides.length };
}
