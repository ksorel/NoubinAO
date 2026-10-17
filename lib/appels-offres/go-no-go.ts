export interface MontantsGoNoGo {
  montantMarcheEstime: number | null;
  coutTotalRealisation: number | null;
  prixDao: number | null;
  cautionSoumission: number | null;
  fraisPreparation: number | null;
  avancePourcentage: number | null;
  delaiPaiementJours: number | null;
  argentDisponibleBanque: number | null;
}

export interface ResultatsSectionB {
  coutPourRepondre: number;
  beneficeEstime: number;
  margeEstimee: number;
  avanceRecue: number;
  argentAAvancer: number;
  couverture: number;
  moisATenir: number;
}

export function calculerSectionB(montants: MontantsGoNoGo): ResultatsSectionB {
  const montantMarche = montants.montantMarcheEstime ?? 0;
  const coutRealisation = montants.coutTotalRealisation ?? 0;
  const prixDao = montants.prixDao ?? 0;
  const caution = montants.cautionSoumission ?? 0;
  const fraisPreparation = montants.fraisPreparation ?? 0;
  const avancePourcentage = montants.avancePourcentage ?? 0;
  const delaiPaiementJours = montants.delaiPaiementJours ?? 0;
  const argentDisponible = montants.argentDisponibleBanque ?? 0;

  const coutPourRepondre = prixDao + caution + fraisPreparation;
  const beneficeEstime = montantMarche - coutRealisation;
  const margeEstimee = montantMarche === 0 ? 0 : beneficeEstime / montantMarche;
  const avanceRecue = montantMarche * avancePourcentage;
  const argentAAvancer = Math.max(0, coutRealisation - avanceRecue + caution);
  const couverture = argentAAvancer === 0 ? 1 : argentDisponible / argentAAvancer;
  const moisATenir = delaiPaiementJours / 30;

  return { coutPourRepondre, beneficeEstime, margeEstimee, avanceRecue, argentAAvancer, couverture, moisATenir };
}

export function noteMargeAuto(margeEstimee: number, margeMinVisee: number): number {
  if (margeEstimee >= 0.25) return 4;
  if (margeEstimee >= margeMinVisee) return 3;
  if (margeEstimee >= 0.1) return 2;
  if (margeEstimee >= 0.05) return 1;
  return 0;
}

export function noteTresorerieAuto(couverture: number): number {
  if (couverture >= 1) return 4;
  if (couverture >= 0.75) return 3;
  if (couverture >= 0.5) return 2;
  if (couverture >= 0.3) return 1;
  return 0;
}

export function calculerNoteTotale(notes: {
  noteMarge: number;
  noteTresorerie: number;
  noteInteretStrategique: number;
  noteClientPaie: number;
  noteConcurrence: number;
  noteRisques: number;
}): number {
  return (
    notes.noteMarge +
    notes.noteTresorerie +
    notes.noteInteretStrategique +
    notes.noteClientPaie +
    notes.noteConcurrence +
    notes.noteRisques
  );
}

export type DecisionGoNoGo = "go" | "no_go" | "a_completer";

export function calculerDecision(params: {
  nombreNon: number;
  questionsNonRepondues: number;
  champsVides: number;
  noteTotale: number;
  noteMinGo: number;
}): DecisionGoNoGo {
  if (params.nombreNon > 0) return "no_go";
  if (params.questionsNonRepondues > 0 || params.champsVides > 0) return "a_completer";
  return params.noteTotale >= params.noteMinGo ? "go" : "no_go";
}
