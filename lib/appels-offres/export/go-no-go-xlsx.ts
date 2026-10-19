import ExcelJS from "exceljs";
import type { PlanExportGoNoGo } from "./go-no-go-plan";

const LIBELLES_DECISION: Record<string, string> = {
  go: "GO",
  no_go: "NO GO",
  a_completer: "À COMPLÉTER",
};

function mettreEnGras(row: ExcelJS.Row): void {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true };
  });
}

export async function genererClasseurExcelGoNoGo(plan: PlanExportGoNoGo): Promise<Buffer> {
  const classeur = new ExcelJS.Workbook();

  const resume = classeur.addWorksheet("Résumé");
  mettreEnGras(resume.addRow([`Fiche Go/No-Go — ${plan.titre}`]));
  if (plan.acheteur) resume.addRow([`Maître d'ouvrage : ${plan.acheteur}`]);
  resume.addRow([`Exporté le : ${plan.dateExport}`]);
  resume.addRow([`Type de marché : ${plan.typeMarcheNom ?? "Non choisi"}`]);
  mettreEnGras(resume.addRow([`Décision : ${LIBELLES_DECISION[plan.decision]}`]));
  resume.addRow([]);
  resume.addRow(["Note totale", `${plan.sectionC.noteTotale} / 20`]);
  resume.addRow(["Nombre de NON", plan.sectionA.nombreNon]);
  resume.addRow(["Questions non répondues", plan.sectionA.questionsNonRepondues]);
  resume.getColumn(1).width = 40;
  resume.getColumn(2).width = 30;

  const feuilleA = classeur.addWorksheet("Questions éliminatoires");
  mettreEnGras(feuilleA.addRow(["Groupe", "Question", "Réponse", "Commentaire"]));
  for (const groupe of plan.sectionA.groupes) {
    for (const question of groupe.questions) {
      feuilleA.addRow([groupe.titre, question.texte, question.reponseLibelle, question.commentaire ?? ""]);
    }
  }
  feuilleA.columns = [{ width: 25 }, { width: 50 }, { width: 15 }, { width: 40 }];

  const feuilleB = classeur.addWorksheet("Calculs d'argent");
  mettreEnGras(feuilleB.addRow(["Champ", "Valeur"]));
  const b = plan.sectionB;
  feuilleB.addRow(["Montant estimé du marché", b.montantMarcheEstime]);
  feuilleB.addRow(["Coût total pour réaliser le marché", b.coutTotalRealisation]);
  feuilleB.addRow(["Prix d'achat du DAO", b.prixDao]);
  feuilleB.addRow(["Caution de soumission", b.cautionSoumission]);
  feuilleB.addRow(["Frais de préparation", b.fraisPreparation]);
  feuilleB.addRow(["Avance de démarrage (%)", b.avancePourcentage !== null ? b.avancePourcentage * 100 : null]);
  feuilleB.addRow(["Délai de paiement (jours)", b.delaiPaiementJours]);
  feuilleB.addRow(["Argent disponible en banque", b.argentDisponibleBanque]);
  feuilleB.addRow(["Coût pour répondre", b.coutPourRepondre]);
  feuilleB.addRow(["Bénéfice estimé", b.beneficeEstime]);
  feuilleB.addRow(["Marge estimée (%)", b.margeEstimee * 100]);
  feuilleB.addRow(["Couverture (%)", b.couverture * 100]);
  feuilleB.addRow(["Mois à tenir sans paiement", b.moisATenir]);
  feuilleB.columns = [{ width: 40 }, { width: 20 }];
  for (let i = 2; i <= feuilleB.rowCount; i++) {
    feuilleB.getCell(`B${i}`).numFmt = "#,##0.##";
  }

  const feuilleC = classeur.addWorksheet("Note sur 20");
  mettreEnGras(feuilleC.addRow(["Critère", "Note", "Sur"]));
  const c = plan.sectionC;
  feuilleC.addRow(["Marge (calcul automatique)", c.noteMarge, 4]);
  feuilleC.addRow(["Trésorerie (calcul automatique)", c.noteTresorerie, 4]);
  feuilleC.addRow(["Intérêt stratégique", c.noteInteretStrategique, 4]);
  feuilleC.addRow(["Le client paie bien", c.noteClientPaie, 3]);
  feuilleC.addRow(["Concurrence", c.noteConcurrence, 2]);
  feuilleC.addRow(["Risques", c.noteRisques, 3]);
  mettreEnGras(feuilleC.addRow(["Note totale", c.noteTotale, 20]));
  feuilleC.columns = [{ width: 35 }, { width: 10 }, { width: 10 }];

  if (plan.synthese) {
    const feuilleSynthese = classeur.addWorksheet("Questionnaire IA");
    mettreEnGras(feuilleSynthese.addRow(["Question", "Réponse", "Source"]));
    for (const reponse of plan.synthese.reponses) {
      feuilleSynthese.addRow([reponse.libelle, reponse.reponse, reponse.sourceSection ?? ""]);
    }
    feuilleSynthese.columns = [{ width: 30 }, { width: 70 }, { width: 30 }];
  }

  if (plan.commentaireGlobal) {
    resume.addRow([]);
    resume.addRow(["Commentaire", plan.commentaireGlobal]);
  }

  return Buffer.from(await classeur.xlsx.writeBuffer());
}
