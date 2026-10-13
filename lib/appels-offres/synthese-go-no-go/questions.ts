import { CLES_QUESTION_GO_NO_GO, type CleQuestionGoNoGo } from "../types";

// Formulation envoyée à Claude, toujours en français (le DAO source l'est
// systématiquement). Le libellé affiché à l'utilisateur, lui, est bilingue
// et vit séparément dans les fichiers de traduction.
export const QUESTIONS_GO_NO_GO: Record<CleQuestionGoNoGo, string> = {
  facteurs_eliminatoires:
    "Quels sont les facteurs éliminatoires de ce DAO, c'est-à-dire les motifs explicitement qualifiés de rejet automatique ou de disqualification de l'offre ?",
  personnel_qualifie:
    "Quel personnel qualifié le DAO exige-t-il pour l'équipe (profils, diplômes, années d'expérience) et quels CV ou pièces le prouvant sont demandés ?",
  offre_technique:
    "Quelles sont les principales exigences de l'offre technique (méthodologie, moyens matériels et humains, délai d'exécution) ?",
  offre_financiere:
    "Que demande le DAO au niveau de l'offre financière (format du bordereau de prix, devise, décomposition des prix, mode de paiement) ?",
  references_requises:
    "Quelles références de projets similaires le DAO exige-t-il (nombre, montant minimal, période, nature des travaux) ?",
  garanties:
    "Quelles garanties financières sont exigées (caution de soumission, garantie de bonne exécution) et quels montants ?",
  delai_contraintes:
    "Quel est le délai limite de dépôt et existe-t-il des contraintes de calendrier particulières (visite de site obligatoire, délai d'exécution imposé) ?",
  points_vigilance:
    "Quels points de vigilance, ambiguïtés ou exigences inhabituelles du DAO méritent d'être clarifiés avant de soumissionner ?",
};

export function construireListeQuestions(): string {
  return CLES_QUESTION_GO_NO_GO.map((cle) => `- "${cle}" : ${QUESTIONS_GO_NO_GO[cle]}`).join("\n");
}
