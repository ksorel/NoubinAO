import { PDFDocument } from "pdf-lib";
import type { PlanExport } from "./plan";
import type { OptionsExportWord } from "./docx";
import { formaterMontant } from "../bpu";
import { creerEtatRendu, ecrireLigne, ecrireEspace } from "./pdf-layout";

const LIBELLES_SECTEUR: Record<string, string> = {
  btp: "BTP",
  ingenierie: "Ingénierie",
  environnement: "Environnement",
  energie_climat: "Énergie-climat",
};

const LIBELLE_GARDE_PLI: Record<"technique" | "financiere", string> = {
  technique: "OFFRE TECHNIQUE",
  financiere: "OFFRE FINANCIÈRE",
};

// Export PDF du dossier de réponse - même plan (`PlanExport`) et mêmes
// options (`versionFinale`, voir docx.ts) que l'export Word, rendu avec les
// mêmes règles de mise en page texte que genererPdfGoNoGo (pdf-layout.ts) :
// pas de tableau grillagé pour le BPU, des lignes de texte, cohérent avec ce
// que fait déjà l'export Go/No-Go plutôt que d'introduire une nouvelle
// bibliothèque de mise en page PDF.
export async function genererPdfDossier(
  plan: PlanExport,
  options: OptionsExportWord = {},
): Promise<Buffer> {
  const versionFinale = options.versionFinale ?? false;

  const doc = await PDFDocument.create();
  const etat = await creerEtatRendu(doc);

  if (plan.pli) {
    ecrireLigne(etat, LIBELLE_GARDE_PLI[plan.pli], { gras: true, taille: 18 });
    ecrireEspace(etat, 4);
    ecrireLigne(etat, plan.titre, { gras: true, taille: 14 });
  } else {
    ecrireLigne(etat, plan.titre, { gras: true, taille: 16 });
  }
  ecrireEspace(etat);

  if (plan.acheteur) ecrireLigne(etat, `Maître d'ouvrage : ${plan.acheteur}`);
  if (plan.secteur) {
    ecrireLigne(etat, `Secteur : ${LIBELLES_SECTEUR[plan.secteur] ?? plan.secteur}`);
  }
  ecrireLigne(etat, `Exporté le : ${plan.dateExport}`);
  ecrireEspace(etat, 16);

  if (plan.sommaireAttendu && plan.sommaireAttendu.length > 0) {
    ecrireLigne(etat, "Sommaire attendu", { gras: true, taille: 13 });
    for (const item of plan.sommaireAttendu) {
      ecrireLigne(etat, `- ${item}`);
    }
    ecrireEspace(etat, 16);
  }

  for (const section of plan.sectionsRedigees) {
    ecrireLigne(etat, section.titre, { gras: true, taille: 13 });
    const paragraphes = section.contenu
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    for (const paragraphe of paragraphes) {
      ecrireLigne(etat, paragraphe);
    }
    ecrireEspace(etat, 16);
  }

  if (plan.piecesRequises.length > 0 || !versionFinale) {
    ecrireLigne(etat, "Pièces requises", { gras: true, taille: 13 });
    if (plan.piecesRequises.length === 0) {
      ecrireLigne(etat, "Aucune pièce requise identifiée.");
    } else {
      for (const piece of plan.piecesRequises) {
        ecrireEspace(etat, 4);
        ecrireLigne(etat, piece.libelle, { gras: true });
        if (versionFinale) {
          ecrireLigne(etat, piece.documents.length > 0 ? "Jointe" : "Sans objet");
        } else if (piece.documents.length === 0) {
          ecrireLigne(etat, "Aucun document associé - à compléter");
        } else {
          for (const document of piece.documents) {
            ecrireLigne(etat, `- ${document.nom} (${document.type})`);
          }
        }
      }
    }
    ecrireEspace(etat, 16);
  }

  if (plan.criteresEvaluation.length > 0 || !versionFinale) {
    ecrireLigne(etat, "Critères d'évaluation", { gras: true, taille: 13 });
    if (plan.criteresEvaluation.length === 0) {
      ecrireLigne(etat, "Aucun critère d'évaluation identifié.");
    } else {
      for (const critere of plan.criteresEvaluation) {
        const suffixe = critere.ponderation !== null ? ` - ${critere.ponderation}%` : "";
        ecrireLigne(etat, `- ${critere.libelle}${suffixe}`);
      }
    }
    ecrireEspace(etat, 16);
  }

  if (plan.bpu) {
    ecrireLigne(etat, "Bordereau des prix unitaires", { gras: true, taille: 13 });
    for (const section of plan.bpu.sections) {
      ecrireEspace(etat, 4);
      ecrireLigne(etat, section.titre, { gras: true });
      for (const ligne of section.lignes) {
        const prixTexte =
          ligne.prixUnitaire !== null ? `${formaterMontant(ligne.prixUnitaire)} FCFA` : "à compléter";
        const montantTexte =
          ligne.montant !== null ? `${formaterMontant(ligne.montant)} FCFA` : "à compléter";
        ecrireLigne(
          etat,
          `- ${ligne.designation} - ${ligne.quantite} ${ligne.unite} × ${prixTexte} = ${montantTexte}`,
        );
      }
      const lignesNonChiffreesSection = section.lignes.filter((l) => l.prixUnitaire === null).length;
      ecrireLigne(
        etat,
        lignesNonChiffreesSection > 0
          ? `Total section : à compléter - ${lignesNonChiffreesSection} ligne(s) non chiffrée(s)`
          : `Total section : ${formaterMontant(section.totalSection)} FCFA`,
        { gras: true },
      );
    }
    const lignesNonChiffreesTotal = plan.bpu.sections.reduce(
      (total, section) => total + section.lignes.filter((l) => l.prixUnitaire === null).length,
      0,
    );
    ecrireEspace(etat, 4);
    ecrireLigne(
      etat,
      lignesNonChiffreesTotal > 0
        ? `Total général : à compléter - ${lignesNonChiffreesTotal} ligne(s) non chiffrée(s) au total`
        : `Total général : ${formaterMontant(plan.bpu.totalGeneral)} FCFA`,
      { gras: true },
    );
  }

  return Buffer.from(await doc.save());
}
