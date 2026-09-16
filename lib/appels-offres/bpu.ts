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

type LigneAvecPyramide = Pick<LigneBpu, "prix_unitaire" | "debourse_sec" | "taux_frais_structure">;

export interface PyramideCout {
  fraisDeStructure: number;
  marge: number;
  margePourcentage: number;
}

// taux_frais_structure s'applique au déboursé sec (convention BTP), pas au
// prix de vente. null traité comme 0 (pas de frais documentés), distinct
// de 0 explicite en base mais produisant le même résultat numérique.
export function calculerPyramideCout(ligne: LigneAvecPyramide): PyramideCout | null {
  if (ligne.prix_unitaire === null || ligne.debourse_sec === null) {
    return null;
  }
  const taux = ligne.taux_frais_structure ?? 0;
  const fraisDeStructure = ligne.debourse_sec * (taux / 100);
  const marge = ligne.prix_unitaire - ligne.debourse_sec - fraisDeStructure;
  const margePourcentage =
    ligne.prix_unitaire === 0 ? 0 : (marge / ligne.prix_unitaire) * 100;
  return { fraisDeStructure, marge, margePourcentage };
}
