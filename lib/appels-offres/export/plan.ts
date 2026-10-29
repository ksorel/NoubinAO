import type { AppelOffres, ExigenceAo, SectionDossier, SectionBpu, LigneBpu } from "../types";
import type { Document, TypeDocument } from "@/lib/documents/types";
import { calculerMontantLigne, sommerMontants } from "../bpu";
import { classifierPieceRequise } from "../classification-piece";
import type { LogoExport } from "./entete-pied-page";

// Pli du dossier (sprint S8, parcours expert v2, voir CLAUDE.md, Étape 8) :
// null = pli unique, comportement historique (aucun filtre). "technique" et
// "financiere" filtrent pièces/critères/sections/BPU avec le même
// classifieur mots-clés que les onglets du détail AO
// (classification-piece.ts) - une pièce/section non reconnue comme
// financière reste technique par défaut, jamais perdue entre les deux plis.
export type PliExport = "technique" | "financiere" | null;

const LIBELLES_TYPE_DOCUMENT: Record<TypeDocument, string> = {
  piece_administrative: "Pièce administrative",
  reference_projet: "Référence de projet",
  cv: "CV",
  agrement: "Agrément",
  abe: "ABE",
  organigramme: "Organigramme",
  materiel: "Matériel",
  diplome: "Diplôme",
  piece_identite: "Pièce d'identité",
};

export interface PlanExport {
  titre: string;
  acheteur: string | null;
  secteur: string | null;
  dateExport: string;
  pli: PliExport;
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
  bpu: {
    sections: Array<{
      titre: string;
      lignes: Array<{
        codeArticle: string | null;
        designation: string;
        unite: string;
        quantite: number;
        prixUnitaire: number | null;
        montant: number | null;
      }>;
      totalSection: number;
    }>;
    totalGeneral: number;
  } | null;
  nomEntreprise: string | null;
  logo: LogoExport | null;
  entete: { gauche: string | null; centre: string | null; droite: string | null };
  pied: { gauche: string | null; centre: string | null; droite: string | null };
}

function formaterDate(date: Date): string {
  const jour = String(date.getUTCDate()).padStart(2, "0");
  const mois = String(date.getUTCMonth() + 1).padStart(2, "0");
  const annee = date.getUTCFullYear();
  return `${jour}/${mois}/${annee}`;
}

export interface EntrepriseExport {
  nomEntreprise: string | null;
  logo: LogoExport | null;
  entete: { gauche: string | null; centre: string | null; droite: string | null };
  pied: { gauche: string | null; centre: string | null; droite: string | null };
}

const ENTREPRISE_EXPORT_VIDE: EntrepriseExport = {
  nomEntreprise: null,
  logo: null,
  entete: { gauche: null, centre: null, droite: null },
  pied: { gauche: null, centre: null, droite: null },
};

export function construirePlanExport(
  appelOffres: AppelOffres,
  exigences: ExigenceAo[],
  documentsParExigence: Record<string, Document[]>,
  sections: SectionDossier[],
  dateExport: Date,
  sectionsBpu: SectionBpu[] = [],
  lignesParSectionBpu: Record<string, LigneBpu[]> = {},
  // Ignoré par l'export Excel du BPU (exporterBpuExcel) - seul l'export
  // Word du dossier complet (exporterDossierReponse) construit un entête
  // et un pied de page, d'où la valeur par défaut vide ici.
  entrepriseExport: EntrepriseExport = ENTREPRISE_EXPORT_VIDE,
  // Pli (sprint S8, voir PliExport ci-dessus) : null par défaut pour ne
  // rien changer au comportement des appelants existants (export à pli
  // unique, exporterBpuExcel, export go-no-go...).
  pli: PliExport = null,
): PlanExport {
  const piecesRequises = exigences
    .filter((e) => e.type_exigence === "piece_requise")
    .filter((e) => pli === null || classifierPieceRequise(e.libelle) === pli)
    .map((exigence) => ({
      libelle: exigence.libelle,
      documents: (documentsParExigence[exigence.id] ?? []).map((document) => ({
        nom: document.nom,
        type: LIBELLES_TYPE_DOCUMENT[document.type],
      })),
    }));

  const criteresEvaluation = exigences
    .filter((e) => e.type_exigence === "critere_evaluation")
    .filter((e) => pli === null || classifierPieceRequise(e.libelle) === pli)
    .map((exigence) => ({
      libelle: exigence.libelle,
      ponderation: exigence.ponderation,
    }));

  const sectionsRedigees = sections
    .filter((section) => section.statut === "validee" && section.contenu !== null)
    .filter((section) => pli === null || classifierPieceRequise(section.titre) === pli)
    .map((section) => ({
      titre: section.titre,
      contenu: section.contenu as string,
    }));

  const sommaireAttendu =
    appelOffres.sommaire_attendu === null
      ? null
      : pli === null
        ? appelOffres.sommaire_attendu
        : appelOffres.sommaire_attendu.filter((item) => classifierPieceRequise(item) === pli);

  // Pli technique : jamais de BPU/DQE (toujours financier, voir
  // classification-piece.ts) - pli financier et pli unique le conservent.
  const bpu =
    sectionsBpu.length === 0 || pli === "technique"
      ? null
      : {
          sections: sectionsBpu.map((section) => {
            const lignes = lignesParSectionBpu[section.id] ?? [];
            return {
              titre: section.titre,
              lignes: lignes.map((ligne) => ({
                codeArticle: ligne.code_article,
                designation: ligne.designation,
                unite: ligne.unite,
                quantite: ligne.quantite,
                prixUnitaire: ligne.prix_unitaire,
                montant: calculerMontantLigne(ligne),
              })),
              totalSection: sommerMontants(lignes),
            };
          }),
          totalGeneral: sommerMontants(
            sectionsBpu.flatMap((section) => lignesParSectionBpu[section.id] ?? []),
          ),
        };

  return {
    titre: appelOffres.titre ?? appelOffres.fichier_dao_nom_original ?? "Appel d'offres sans titre",
    acheteur: appelOffres.acheteur,
    secteur: appelOffres.secteur,
    dateExport: formaterDate(dateExport),
    pli,
    sommaireAttendu,
    sectionsRedigees,
    piecesRequises,
    criteresEvaluation,
    bpu,
    nomEntreprise: entrepriseExport.nomEntreprise,
    logo: entrepriseExport.logo,
    entete: entrepriseExport.entete,
    pied: entrepriseExport.pied,
  };
}
