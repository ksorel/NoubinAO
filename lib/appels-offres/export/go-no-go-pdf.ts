import { PDFDocument } from "pdf-lib";
import type { PlanExportGoNoGo } from "./go-no-go-plan";
import { formaterMontant } from "../bpu";
import { creerEtatRendu, ecrireLigne, ecrireEspace } from "./pdf-layout";

const LIBELLES_DECISION: Record<string, string> = {
  go: "GO",
  no_go: "NO GO",
  a_completer: "À COMPLÉTER",
};

export async function genererPdfGoNoGo(plan: PlanExportGoNoGo): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const etat = await creerEtatRendu(doc);

  ecrireLigne(etat, `Fiche Go/No-Go — ${plan.titre}`, { gras: true, taille: 16 });
  ecrireEspace(etat);
  if (plan.acheteur) ecrireLigne(etat, `Maître d'ouvrage : ${plan.acheteur}`);
  ecrireLigne(etat, `Exporté le : ${plan.dateExport}`);
  ecrireLigne(etat, `Type de marché : ${plan.typeMarcheNom ?? "Non choisi"}`);
  ecrireLigne(etat, `Décision : ${LIBELLES_DECISION[plan.decision]}`, { gras: true });
  ecrireEspace(etat, 16);

  ecrireLigne(etat, "Questions éliminatoires", { gras: true, taille: 13 });
  for (const groupe of plan.sectionA.groupes) {
    if (groupe.questions.length === 0) continue;
    ecrireEspace(etat);
    ecrireLigne(etat, groupe.titre, { gras: true });
    for (const question of groupe.questions) {
      ecrireLigne(etat, `- ${question.texte} — ${question.reponseLibelle}`);
      if (question.commentaire) ecrireLigne(etat, `  (${question.commentaire})`);
    }
  }
  ecrireEspace(etat);
  ecrireLigne(
    etat,
    `Nombre de NON : ${plan.sectionA.nombreNon} — Questions non répondues : ${plan.sectionA.questionsNonRepondues}`,
  );
  ecrireEspace(etat, 16);

  ecrireLigne(etat, "Calculs d'argent", { gras: true, taille: 13 });
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
    ["Couverture", `${(b.couverture * 100).toFixed(0)}%`],
    ["Mois à tenir sans paiement", b.moisATenir.toFixed(1)],
  ];
  for (const [libelle, valeur] of lignesArgent) {
    ecrireLigne(etat, `${libelle} : ${valeur}`);
  }
  ecrireEspace(etat, 16);

  ecrireLigne(etat, "Note sur 20", { gras: true, taille: 13 });
  const c = plan.sectionC;
  ecrireLigne(etat, `Marge (calcul automatique) : ${c.noteMarge} / 4`);
  ecrireLigne(etat, `Trésorerie (calcul automatique) : ${c.noteTresorerie} / 4`);
  ecrireLigne(etat, `Intérêt stratégique : ${c.noteInteretStrategique ?? "—"} / 4`);
  ecrireLigne(etat, `Le client paie bien : ${c.noteClientPaie ?? "—"} / 3`);
  ecrireLigne(etat, `Concurrence : ${c.noteConcurrence ?? "—"} / 2`);
  ecrireLigne(etat, `Risques : ${c.noteRisques ?? "—"} / 3`);
  ecrireLigne(etat, `Note totale : ${c.noteTotale} / 20`, { gras: true });

  if (plan.commentaireGlobal) {
    ecrireEspace(etat, 16);
    ecrireLigne(etat, "Commentaire", { gras: true, taille: 13 });
    ecrireLigne(etat, plan.commentaireGlobal);
  }

  if (plan.synthese) {
    ecrireEspace(etat, 16);
    ecrireLigne(etat, "Questionnaire Go/No-Go (synthèse IA)", { gras: true, taille: 13 });
    ecrireLigne(etat, `Généré le ${plan.synthese.genereLe}`);
    for (const reponse of plan.synthese.reponses) {
      ecrireEspace(etat);
      ecrireLigne(etat, reponse.libelle, { gras: true });
      ecrireLigne(etat, reponse.reponse);
      if (reponse.sourceSection) ecrireLigne(etat, `Source : ${reponse.sourceSection}`);
    }
  }

  return Buffer.from(await doc.save());
}
