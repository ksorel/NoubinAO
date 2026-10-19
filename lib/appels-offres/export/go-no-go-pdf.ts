import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PlanExportGoNoGo } from "./go-no-go-plan";
import { formaterMontant } from "../bpu";

const LIBELLES_DECISION: Record<string, string> = {
  go: "GO",
  no_go: "NO GO",
  a_completer: "À COMPLÉTER",
};

const MARGE = 50;
const LARGEUR_PAGE = 595.28; // A4 portrait, points
const HAUTEUR_PAGE = 841.89;
const LARGEUR_TEXTE = LARGEUR_PAGE - 2 * MARGE;

// pdf-lib ne fournit aucun moteur de mise en page (ni retour à la ligne, ni
// saut de page automatique) : il faut découper le texte caractère par
// caractère selon la largeur mesurée par la police, et gérer soi-même le
// passage à la page suivante quand `y` atteint la marge basse.
function decouperTexte(texte: string, police: PDFFont, taille: number, largeurMax: number): string[] {
  const mots = texte.split(/\s+/);
  const lignes: string[] = [];
  let ligneActuelle = "";
  for (const mot of mots) {
    const essai = ligneActuelle.length === 0 ? mot : `${ligneActuelle} ${mot}`;
    if (police.widthOfTextAtSize(essai, taille) > largeurMax && ligneActuelle.length > 0) {
      lignes.push(ligneActuelle);
      ligneActuelle = mot;
    } else {
      ligneActuelle = essai;
    }
  }
  if (ligneActuelle.length > 0) lignes.push(ligneActuelle);
  return lignes;
}

interface EtatRendu {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  police: PDFFont;
  policeGras: PDFFont;
}

function nouvellePage(etat: EtatRendu): void {
  etat.page = etat.doc.addPage([LARGEUR_PAGE, HAUTEUR_PAGE]);
  etat.y = HAUTEUR_PAGE - MARGE;
}

function ecrireLigne(etat: EtatRendu, texte: string, options: { gras?: boolean; taille?: number } = {}): void {
  const taille = options.taille ?? 11;
  const police = options.gras ? etat.policeGras : etat.police;
  const lignes = decouperTexte(texte, police, taille, LARGEUR_TEXTE);
  for (const ligne of lignes) {
    if (etat.y < MARGE + taille) nouvellePage(etat);
    etat.page.drawText(ligne, { x: MARGE, y: etat.y, size: taille, font: police, color: rgb(0, 0, 0) });
    etat.y -= taille * 1.4;
  }
}

function ecrireEspace(etat: EtatRendu, hauteur = 8): void {
  etat.y -= hauteur;
}

export async function genererPdfGoNoGo(plan: PlanExportGoNoGo): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const police = await doc.embedFont(StandardFonts.Helvetica);
  const policeGras = await doc.embedFont(StandardFonts.HelveticaBold);

  const etat: EtatRendu = { doc, page: doc.addPage([LARGEUR_PAGE, HAUTEUR_PAGE]), y: 0, police, policeGras };
  etat.y = HAUTEUR_PAGE - MARGE;

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
