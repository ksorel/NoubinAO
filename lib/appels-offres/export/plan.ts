import type { AppelOffres, ExigenceAo, SectionDossier } from "../types";
import type { Document, TypeDocument } from "@/lib/documents/types";

const LIBELLES_TYPE_DOCUMENT: Record<TypeDocument, string> = {
  piece_administrative: "Pièce administrative",
  reference_projet: "Référence de projet",
  cv: "CV",
  agrement: "Agrément",
};

export interface PlanExport {
  titre: string;
  acheteur: string | null;
  secteur: string | null;
  dateExport: string;
  sommaireAttendu: string[] | null;
  sectionsRedigees: Array<{ titre: string; contenu: string }>;
  piecesRequises: Array<{
    libelle: string;
    documents: Array<{ nom: string; type: string }>;
  }>;
  criteresEvaluation: Array<{
    libelle: string;
    ponderation: number | null;
  }>;
}

function formaterDate(date: Date): string {
  const jour = String(date.getUTCDate()).padStart(2, "0");
  const mois = String(date.getUTCMonth() + 1).padStart(2, "0");
  const annee = date.getUTCFullYear();
  return `${jour}/${mois}/${annee}`;
}

export function construirePlanExport(
  appelOffres: AppelOffres,
  exigences: ExigenceAo[],
  documentsParExigence: Record<string, Document[]>,
  sections: SectionDossier[],
  dateExport: Date,
): PlanExport {
  const piecesRequises = exigences
    .filter((e) => e.type_exigence === "piece_requise")
    .map((exigence) => ({
      libelle: exigence.libelle,
      documents: (documentsParExigence[exigence.id] ?? []).map((document) => ({
        nom: document.nom,
        type: LIBELLES_TYPE_DOCUMENT[document.type],
      })),
    }));

  const criteresEvaluation = exigences
    .filter((e) => e.type_exigence === "critere_evaluation")
    .map((exigence) => ({
      libelle: exigence.libelle,
      ponderation: exigence.ponderation,
    }));

  const sectionsRedigees = sections
    .filter((section) => section.statut === "validee" && section.contenu !== null)
    .map((section) => ({
      titre: section.titre,
      contenu: section.contenu as string,
    }));

  return {
    titre: appelOffres.titre ?? appelOffres.fichier_dao_nom_original,
    acheteur: appelOffres.acheteur,
    secteur: appelOffres.secteur,
    dateExport: formaterDate(dateExport),
    sommaireAttendu: appelOffres.sommaire_attendu,
    sectionsRedigees,
    piecesRequises,
    criteresEvaluation,
  };
}
