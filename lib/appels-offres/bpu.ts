import type { LigneBpu } from "./types";

type LigneAvecMontant = Pick<LigneBpu, "quantite" | "prix_unitaire">;

export function calculerMontantLigne(ligne: LigneAvecMontant): number | null {
  if (ligne.prix_unitaire === null) return null;
  return ligne.quantite * ligne.prix_unitaire;
}

export function sommerMontants(lignes: LigneAvecMontant[]): number {
  return lignes.reduce((total, ligne) => {
    const montant = calculerMontantLigne(ligne);
    return montant === null ? total : total + montant;
  }, 0);
}

export function compterLignesNonChiffrees(lignes: LigneAvecMontant[]): number {
  return lignes.filter((ligne) => ligne.prix_unitaire === null).length;
}
