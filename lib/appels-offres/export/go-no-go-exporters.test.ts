import { describe, expect, it } from "vitest";
import type { PlanExportGoNoGo } from "./go-no-go-plan";
import { genererDocumentWordGoNoGo } from "./go-no-go-docx";
import { genererClasseurExcelGoNoGo } from "./go-no-go-xlsx";
import { genererPdfGoNoGo } from "./go-no-go-pdf";

// Smoke tests : chaque générateur doit produire un buffer non vide sans
// lever d'exception, sur un plan représentatif (avec et sans synthèse IA).
// Ne vérifie pas le contenu binaire (docx/xlsx/pdf), seulement que
// l'assemblage ne casse pas — les champs très longs ou accentués sont les
// cas qui font le plus souvent planter un export (retour à la ligne pdf-lib,
// nom de feuille Excel, etc.).
const planBase: PlanExportGoNoGo = {
  titre: "Construction d'un pont à Yamoussoukro",
  acheteur: "Ministère des Travaux Publics",
  dateExport: "19/10/2026",
  typeMarcheNom: "Travaux routiers",
  achatDaoEffectue: true,
  decision: "go",
  sectionA: {
    groupes: [
      {
        categorie: "administratif",
        titre: "Peut-on déposer ?",
        questions: [
          { texte: "Avons-nous le bon agrément ?", reponse: "oui", reponseLibelle: "Oui", commentaire: "Agrément à jour" },
        ],
      },
      { categorie: "savoir_faire", titre: "Savons-nous faire ?", questions: [] },
      { categorie: "ouverture_marche", titre: "Le marché est-il vraiment ouvert ?", questions: [] },
    ],
    nombreNon: 0,
    questionsNonRepondues: 0,
  },
  sectionB: {
    montantMarcheEstime: 45_000_000,
    coutTotalRealisation: 36_000_000,
    prixDao: 100_000,
    cautionSoumission: 900_000,
    fraisPreparation: 150_000,
    avancePourcentage: 0.15,
    delaiPaiementJours: 120,
    argentDisponibleBanque: 12_000_000,
    coutPourRepondre: 1_150_000,
    beneficeEstime: 9_000_000,
    margeEstimee: 0.2,
    avanceRecue: 6_750_000,
    argentAAvancer: 30_150_000,
    couverture: 0.4,
    moisATenir: 4,
  },
  sectionC: {
    noteMarge: 3,
    noteTresorerie: 1,
    noteInteretStrategique: 4,
    noteClientPaie: 3,
    noteConcurrence: 2,
    noteRisques: 3,
    noteTotale: 16,
  },
  commentaireGlobal: "Marché déjà connu, client fiable.",
  synthese: null,
};

const planAvecSynthese: PlanExportGoNoGo = {
  ...planBase,
  synthese: {
    genereLe: "19/10/2026",
    reponses: [
      { libelle: "Facteurs éliminatoires", reponse: "- Absence d'agrément\n- Caution non fournie", sourceSection: "DPAO" },
      { libelle: "Personnel qualifié demandé (CV)", reponse: "Un ingénieur BTP avec 10 ans d'expérience.", sourceSection: null },
    ],
  },
};

describe.each([
  ["sans synthèse IA", planBase],
  ["avec synthèse IA", planAvecSynthese],
])("exports Go/No-Go (%s)", (_label, plan) => {
  it("genererDocumentWordGoNoGo produit un buffer non vide", async () => {
    const buffer = await genererDocumentWordGoNoGo(plan);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("genererClasseurExcelGoNoGo produit un buffer non vide", async () => {
    const buffer = await genererClasseurExcelGoNoGo(plan);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("genererPdfGoNoGo produit un buffer non vide", async () => {
    const buffer = await genererPdfGoNoGo(plan);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
