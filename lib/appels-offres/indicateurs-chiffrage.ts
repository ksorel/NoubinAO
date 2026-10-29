import type { LigneBpu } from "./types";
import type { RegimeFiscal } from "@/lib/utilisateur/types";
import { sommerMontants, calculerPyramideCout } from "./bpu";
import { calculerMontantAvecTva, type MontantAvecTva } from "./tva";

export type StatutFourchette = "basse" | "normale" | "haute";

export interface PositionFourchette {
  pourcentageDuMontantEstimatif: number;
  statut: StatutFourchette;
}

export interface IndicateursChiffrage {
  totalHt: number;
  tva: MontantAvecTva | null;
  // Coût de revient = montant à préfinancer (déboursé sec + frais de
  // structure, avant marge) - seulement sur les lignes où debourse_sec est
  // renseigné ; les lignes sans donnée de coût sont ignorées plutôt que de
  // fausser le total (pas de coût supposé à 0).
  coutDeRevient: number;
  margeBrute: number;
  margeBrutePourcentage: number;
  // true seulement quand margePlancherPct est paramétré ET que la marge
  // globale descend sous ce seuil - utile en gré à gré (Étape 6, parcours
  // expert v2) où la négociation peut tirer la marge vers le bas sans que
  // personne ne s'en rende compte ligne par ligne.
  sousMargePlancher: boolean;
  // null tant que la fourchette (DAO) ou le montant de référence (saisi
  // par l'entreprise) ne sont pas tous les deux connus - voir
  // CLAUDE.md "Indicateurs" et la migration montant_estimatif.
  positionFourchette: PositionFourchette | null;
}

// Extrait de calculerIndicateursChiffrage ci-dessous : où un montant se
// situe dans la fourchette (DAO) rapportée au montant de référence saisi
// par l'entreprise. Réutilisé tel quel par le post-mortem (post-mortem.ts,
// Étape 9) pour situer le prix de l'attributaire - même formule, deux
// montants différents (notre total HT ici, le prix de l'attributaire
// là-bas), pas de raison de la dupliquer.
export function calculerPositionFourchette(
  montant: number,
  fourchetteBasse: number | null,
  fourchetteHaute: number | null,
  montantEstimatif: number | null,
): PositionFourchette | null {
  if (fourchetteBasse === null || fourchetteHaute === null || montantEstimatif === null || montantEstimatif === 0) {
    return null;
  }
  const pourcentageDuMontantEstimatif = (montant / montantEstimatif) * 100;
  const statut: StatutFourchette =
    pourcentageDuMontantEstimatif < fourchetteBasse
      ? "basse"
      : pourcentageDuMontantEstimatif > fourchetteHaute
        ? "haute"
        : "normale";
  return { pourcentageDuMontantEstimatif, statut };
}

export function calculerIndicateursChiffrage(
  lignes: LigneBpu[],
  regimeFiscal: RegimeFiscal | null,
  fourchetteBasse: number | null,
  fourchetteHaute: number | null,
  montantEstimatif: number | null,
  margePlancherPct: number | null = null,
): IndicateursChiffrage {
  const totalHt = sommerMontants(lignes);
  const tva = calculerMontantAvecTva(totalHt, regimeFiscal);

  let coutDeRevient = 0;
  let margeBrute = 0;
  for (const ligne of lignes) {
    const pyramide = calculerPyramideCout(ligne);
    if (pyramide === null) continue;
    coutDeRevient += (ligne.debourse_sec! + pyramide.fraisDeStructure) * ligne.quantite;
    margeBrute += pyramide.marge * ligne.quantite;
  }
  const margeBrutePourcentage = totalHt === 0 ? 0 : (margeBrute / totalHt) * 100;
  const sousMargePlancher =
    margePlancherPct !== null && lignes.length > 0 && margeBrutePourcentage < margePlancherPct;

  const positionFourchette = calculerPositionFourchette(
    totalHt,
    fourchetteBasse,
    fourchetteHaute,
    montantEstimatif,
  );

  return {
    totalHt,
    tva,
    coutDeRevient,
    margeBrute,
    margeBrutePourcentage,
    sousMargePlancher,
    positionFourchette,
  };
}
