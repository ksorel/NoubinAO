import type { RegimeFiscal } from "@/lib/utilisateur/types";

// Taux standard ivoirien. TEE (Taxe Estimée) en est exonéré - voir
// CLAUDE.md "Spécificités Côte d'Ivoire à paramétrer".
export const TAUX_TVA_STANDARD = 18;

export interface MontantAvecTva {
  montantHt: number;
  tauxTva: number;
  montantTva: number;
  montantTtc: number;
}

// null quand le régime fiscal n'est pas renseigné - pas de TVA affichée
// tant que l'information n'est pas connue (spec : "uniquement s'ils sont
// mentionnés"), plutôt que de supposer un taux par défaut potentiellement
// faux.
export function calculerMontantAvecTva(
  montantHt: number,
  regimeFiscal: RegimeFiscal | null,
): MontantAvecTva | null {
  if (regimeFiscal === null) return null;

  const tauxTva = regimeFiscal === "tee" ? 0 : TAUX_TVA_STANDARD;
  const montantTva = montantHt * (tauxTva / 100);

  return {
    montantHt,
    tauxTva,
    montantTva,
    montantTtc: montantHt + montantTva,
  };
}
