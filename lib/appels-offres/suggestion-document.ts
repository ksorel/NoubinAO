import type { TypeDocument } from "@/lib/documents/types";

export function deviserTypeDocumentPrefere(libelle: string): TypeDocument {
  const l = libelle.toLowerCase();
  if (l.includes("cv")) return "cv";
  if (
    l.includes("référence") ||
    l.includes("reference") ||
    l.includes("projet similaire")
  ) {
    return "reference_projet";
  }
  if (l.includes("agrément") || l.includes("agrement")) return "agrement";
  return "piece_administrative";
}

import { extraireMotsCles } from "../texte/mots-cles";
import type { Document } from "@/lib/documents/types";

interface CritereQualification {
  libelle: string;
  description: string | null;
}

// Classe les CV de la bibliothèque par pertinence pour une pièce CV
// donnée, en s'appuyant sur les critères de qualification du DAO dont
// le libellé (seul — la description est un texte libre trop verbeux
// pour la corrélation, un mot générique y suffirait à rattacher un
// critère sans rapport) partage au moins un mot-clé avec le libellé
// de la pièce (ex. pièce "CV du Directeur des travaux" ↔ critère
// "Directeur des travaux : 10 ans d'expérience minimum"). Aucun critère
// ne matche : retourne la liste inchangée plutôt que de trier au hasard
// sans signal réel.
export function classerCvParPertinence(
  libelleExigence: string,
  criteresQualification: CritereQualification[],
  cvs: Document[],
): Document[] {
  const motsExigence = new Set(extraireMotsCles(libelleExigence));

  const criteresCorrespondants = criteresQualification.filter((critere) => {
    const motsCritere = extraireMotsCles(critere.libelle);
    return motsCritere.some((mot) => motsExigence.has(mot));
  });

  if (criteresCorrespondants.length === 0) return cvs;

  const texteRequis = criteresCorrespondants
    .map((c) => [c.libelle, c.description ?? ""].join(" "))
    .join(" ");
  const motsRequis = [...new Set(extraireMotsCles(texteRequis))];

  const scores = new Map(cvs.map((cv) => [cv.id, scoreCv(cv, motsRequis)]));
  return [...cvs].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));
}

function scoreCv(cv: Document, motsRequis: string[]): number {
  if (!cv.contenu_markdown) return 0;
  const motsCv = new Set(extraireMotsCles(cv.contenu_markdown));
  const chevauchement = motsRequis.filter((mot) => motsCv.has(mot)).length;
  return chevauchement / Math.sqrt(motsCv.size || 1);
}
