// Simulation de note technique (sprint S5, parcours expert v2, voir
// CLAUDE.md, Étape 6) : pour une procédure "demande de propositions",
// l'offre financière reste verrouillée tant que l'offre technique n'a pas
// atteint son seuil. La note est une moyenne pondérée des critères
// d'évaluation technique, chacun noté 0-100 (% du critère atteint,
// auto-déclaré - exigence_ao.note_simulee) et pondéré par son poids dans le
// barème du DAO (exigence_ao.ponderation).

export interface CritereNoteSimulee {
  ponderation: number | null;
  noteSimulee: number | null;
}

// null tant qu'aucun critère n'a à la fois une pondération et une note
// saisie - on ne simule rien plutôt que de deviner une note sur une base
// partielle qui ferait croire à un verrouillage/déverrouillage arbitraire.
export function calculerNoteTechniqueSimulee(criteres: CritereNoteSimulee[]): number | null {
  const noterables = criteres.filter(
    (c) => c.ponderation !== null && c.noteSimulee !== null,
  ) as Array<{ ponderation: number; noteSimulee: number }>;

  if (noterables.length === 0) return null;

  const ponderationTotale = noterables.reduce((total, c) => total + c.ponderation, 0);
  if (ponderationTotale === 0) return null;

  const noteGlobale = noterables.reduce((total, c) => total + c.ponderation * c.noteSimulee, 0);
  return noteGlobale / ponderationTotale;
}

// Verrouillage : false (déverrouillé) seulement si la note est connue ET
// atteint le seuil. Note inconnue ou seuil non paramétré => verrouillé par
// défaut (on ne déverrouille jamais sur une base inconnue).
export function offreFinanciereVerrouillee(
  noteSimulee: number | null,
  seuilQualificatifPct: number | null,
): boolean {
  if (seuilQualificatifPct === null) return false;
  if (noteSimulee === null) return true;
  return noteSimulee < seuilQualificatifPct;
}
