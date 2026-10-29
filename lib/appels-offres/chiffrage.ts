export interface ParametresChiffrage {
  prixAchat: number;
  tauxChange: number;
  coefficientApproche: number;
  margePct: number;
  fraisFixesPct: number;
}

export interface ResultatChiffrage {
  debourseSec: number;
  prixUnitaire: number;
}

// Formule de la spec (Étape 6, Offre financière, parcours expert v2) :
// PU = achat × change × approche × (1 + marge) × (1 + frais_fixes).
// debourseSec = achat × change × approche, avant marge/frais - rempli dans
// les mêmes colonnes que la pyramide de coût existante (bpu.ts) pour que
// calculerPyramideCout reste la source d'affichage de la marge.
// arrondi : arrondit le PU final au multiple indiqué (ex. 1000 pour arrondir
// au millier) ; 0/absent = arrondi à l'unité.
export function calculerChiffrage(
  params: ParametresChiffrage,
  arrondi = 0,
): ResultatChiffrage {
  const debourseSec = params.prixAchat * params.tauxChange * params.coefficientApproche;
  const brut = debourseSec * (1 + params.margePct / 100) * (1 + params.fraisFixesPct / 100);
  const prixUnitaire = arrondi > 0 ? Math.round(brut / arrondi) * arrondi : Math.round(brut);

  return { debourseSec: Math.round(debourseSec), prixUnitaire };
}
