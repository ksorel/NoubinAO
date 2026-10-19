import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { PlanExportGoNoGo } from "./go-no-go-plan";
import { formaterMontant } from "../bpu";

const LIBELLES_DECISION: Record<string, string> = {
  go: "GO",
  no_go: "NO GO",
  a_completer: "À COMPLÉTER",
};

export async function genererDocumentWordGoNoGo(plan: PlanExportGoNoGo): Promise<Buffer> {
  const enfants: Paragraph[] = [
    new Paragraph({ text: `Fiche Go/No-Go — ${plan.titre}`, heading: HeadingLevel.TITLE }),
  ];

  if (plan.acheteur) enfants.push(new Paragraph({ text: `Maître d'ouvrage : ${plan.acheteur}` }));
  enfants.push(new Paragraph({ text: `Exporté le : ${plan.dateExport}` }));
  enfants.push(
    new Paragraph({ text: `Type de marché : ${plan.typeMarcheNom ?? "Non choisi"}` }),
  );
  enfants.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Décision : ${LIBELLES_DECISION[plan.decision]}`,
          bold: true,
        }),
      ],
    }),
  );

  enfants.push(new Paragraph({ text: "Questions éliminatoires", heading: HeadingLevel.HEADING_1 }));
  for (const groupe of plan.sectionA.groupes) {
    if (groupe.questions.length === 0) continue;
    enfants.push(new Paragraph({ text: groupe.titre, heading: HeadingLevel.HEADING_2 }));
    for (const question of groupe.questions) {
      enfants.push(
        new Paragraph({ text: `${question.texte} — ${question.reponseLibelle}`, bullet: { level: 0 } }),
      );
      if (question.commentaire) {
        enfants.push(new Paragraph({ text: question.commentaire, bullet: { level: 1 } }));
      }
    }
  }
  enfants.push(
    new Paragraph({
      text: `Nombre de NON : ${plan.sectionA.nombreNon} — Questions non répondues : ${plan.sectionA.questionsNonRepondues}`,
    }),
  );

  enfants.push(new Paragraph({ text: "Calculs d'argent", heading: HeadingLevel.HEADING_1 }));
  const b = plan.sectionB;
  const lignesArgent: Array<[string, string]> = [
    ["Montant estimé du marché", b.montantMarcheEstime !== null ? `${formaterMontant(b.montantMarcheEstime)} FCFA` : "—"],
    ["Coût total pour réaliser le marché", b.coutTotalRealisation !== null ? `${formaterMontant(b.coutTotalRealisation)} FCFA` : "—"],
    ["Prix d'achat du DAO", b.prixDao !== null ? `${formaterMontant(b.prixDao)} FCFA` : "—"],
    ["Caution de soumission", b.cautionSoumission !== null ? `${formaterMontant(b.cautionSoumission)} FCFA` : "—"],
    ["Frais de préparation", b.fraisPreparation !== null ? `${formaterMontant(b.fraisPreparation)} FCFA` : "—"],
    ["Avance de démarrage (%)", b.avancePourcentage !== null ? `${(b.avancePourcentage * 100).toFixed(0)}%` : "—"],
    ["Délai de paiement (jours)", b.delaiPaiementJours !== null ? String(b.delaiPaiementJours) : "—"],
    ["Argent disponible en banque", b.argentDisponibleBanque !== null ? `${formaterMontant(b.argentDisponibleBanque)} FCFA` : "—"],
    ["Coût pour répondre", `${formaterMontant(b.coutPourRepondre)} FCFA`],
    ["Bénéfice estimé", `${formaterMontant(b.beneficeEstime)} FCFA`],
    ["Marge estimée", `${(b.margeEstimee * 100).toFixed(0)}%`],
    ["Couverture (argent dispo ÷ argent à avancer)", `${(b.couverture * 100).toFixed(0)}%`],
    ["Mois à tenir sans paiement", b.moisATenir.toFixed(1)],
  ];
  for (const [libelle, valeur] of lignesArgent) {
    enfants.push(new Paragraph({ text: `${libelle} : ${valeur}` }));
  }

  enfants.push(new Paragraph({ text: "Note sur 20", heading: HeadingLevel.HEADING_1 }));
  const c = plan.sectionC;
  enfants.push(new Paragraph({ text: `Marge (calcul automatique) : ${c.noteMarge} / 4` }));
  enfants.push(new Paragraph({ text: `Trésorerie (calcul automatique) : ${c.noteTresorerie} / 4` }));
  enfants.push(new Paragraph({ text: `Intérêt stratégique : ${c.noteInteretStrategique ?? "—"} / 4` }));
  enfants.push(new Paragraph({ text: `Le client paie bien : ${c.noteClientPaie ?? "—"} / 3` }));
  enfants.push(new Paragraph({ text: `Concurrence : ${c.noteConcurrence ?? "—"} / 2` }));
  enfants.push(new Paragraph({ text: `Risques : ${c.noteRisques ?? "—"} / 3` }));
  enfants.push(
    new Paragraph({
      children: [new TextRun({ text: `Note totale : ${c.noteTotale} / 20`, bold: true })],
    }),
  );

  if (plan.commentaireGlobal) {
    enfants.push(new Paragraph({ text: "Commentaire", heading: HeadingLevel.HEADING_1 }));
    enfants.push(new Paragraph({ text: plan.commentaireGlobal }));
  }

  if (plan.synthese) {
    enfants.push(
      new Paragraph({ text: "Questionnaire Go/No-Go (synthèse IA)", heading: HeadingLevel.HEADING_1 }),
    );
    enfants.push(new Paragraph({ text: `Généré le ${plan.synthese.genereLe}` }));
    for (const reponse of plan.synthese.reponses) {
      enfants.push(new Paragraph({ text: reponse.libelle, heading: HeadingLevel.HEADING_2 }));
      enfants.push(new Paragraph({ text: reponse.reponse }));
      if (reponse.sourceSection) {
        enfants.push(new Paragraph({ text: `Source : ${reponse.sourceSection}` }));
      }
    }
  }

  const document = new Document({ sections: [{ children: enfants }] });
  return Packer.toBuffer(document);
}
