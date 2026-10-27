import {
  Document,
  Header,
  Footer,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  TabStopType,
  TabStopPosition,
  AlignmentType,
} from "docx";
import type { PlanExport } from "./plan";
import { formaterMontant } from "../bpu";
import { construireZoneDocx, zonesVides, type ContexteEnTetePiedPage } from "./entete-pied-page";
import { identifierFormulaireStandard } from "../formulaires-standards";

export interface OptionsExportWord {
  // Étape 6 de la spec parcours expert v2 (voir CLAUDE.md) : la lettre de
  // soumission (F3) doit tenir sur une page. Les paragraphes vides sont déjà
  // filtrés pour toutes les sections (split sur /\n+/ plus bas) — ce qui
  // manquait pour tenir sur une page, c'est l'espacement par défaut que Word
  // ajoute après chaque paragraphe. "compacter" retire cet espacement sur la
  // seule section F3, sans toucher à la police ni au texte du modèle.
  compacterLettreSoumission?: boolean;
}

const ESPACEMENT_COMPACT = { after: 0, before: 0 };

// Génération serveur sans contexte locale/requête (pas de next-intl ici) —
// carte statique en français, avec repli sur la valeur brute pour les
// valeurs de secteur libres qui ont pu être écrites avant cette carte (voir
// migration 20260929140000_normaliser_secteur_avis_legacy.sql).
// Garde de pli (sprint S8, parcours expert v2, voir CLAUDE.md, Étape 8) :
// titre de couverture quand le dossier est scindé en deux plis
// (plan.pli !== null) — absent en pli unique, comportement historique.
const LIBELLE_GARDE_PLI: Record<"technique" | "financiere", string> = {
  technique: "OFFRE TECHNIQUE",
  financiere: "OFFRE FINANCIÈRE",
};

const LIBELLES_SECTEUR: Record<string, string> = {
  btp: "BTP",
  ingenierie: "Ingénierie",
  environnement: "Environnement",
  energie_climat: "Énergie-climat",
};

// Compte les lignes non chiffrées (prix unitaire non renseigné) dans un
// tableau de lignes de la forme `PlanExport.bpu.sections[i].lignes`. Un
// total (section ou général) ne doit jamais afficher un montant en gras
// alors que des lignes n'ont pas encore de prix — voir usage ci-dessous.
// Ne pas confondre avec `compterLignesNonChiffrees` de `../bpu.ts`, qui
// prend des `LigneBpu` (forme snake_case côté DB) : forme différente ici.
function compterLignesNonChiffreesDansLignes(lignes: { prixUnitaire: number | null }[]): number {
  return lignes.filter((ligne) => ligne.prixUnitaire === null).length;
}

function construireBandeauDocx(
  zones: { gauche: string | null; centre: string | null; droite: string | null },
  contexte: ContexteEnTetePiedPage,
): Paragraph {
  return new Paragraph({
    tabStops: [
      { type: TabStopType.CENTER, position: TabStopPosition.MAX / 2 },
      { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
    ],
    children: [
      ...construireZoneDocx(zones.gauche, contexte),
      new TextRun({ text: "\t" }),
      ...construireZoneDocx(zones.centre, contexte),
      new TextRun({ text: "\t" }),
      ...construireZoneDocx(zones.droite, contexte),
    ],
  });
}

function construireEnTetePiedPageDocx(plan: PlanExport) {
  const contexte: ContexteEnTetePiedPage = {
    nomEntreprise: plan.nomEntreprise,
    dateExport: plan.dateExport,
    logo: plan.logo,
  };

  const enteteVide = zonesVides([plan.entete.gauche, plan.entete.centre, plan.entete.droite]);
  const piedVide = zonesVides([plan.pied.gauche, plan.pied.centre, plan.pied.droite]);

  return {
    headers: enteteVide
      ? undefined
      : { default: new Header({ children: [construireBandeauDocx(plan.entete, contexte)] }) },
    footers: piedVide
      ? undefined
      : { default: new Footer({ children: [construireBandeauDocx(plan.pied, contexte)] }) },
  };
}

export async function genererDocumentWord(
  plan: PlanExport,
  options: OptionsExportWord = {},
): Promise<Buffer> {
  const compacterLettreSoumission = options.compacterLettreSoumission ?? true;
  const enfants: (Paragraph | Table)[] = plan.pli
    ? [
        new Paragraph({
          text: LIBELLE_GARDE_PLI[plan.pli],
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({ text: plan.titre, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
      ]
    : [new Paragraph({ text: plan.titre, heading: HeadingLevel.TITLE })];

  if (plan.acheteur) {
    enfants.push(new Paragraph({ text: `Maître d'ouvrage : ${plan.acheteur}` }));
  }
  if (plan.secteur) {
    const libelle = LIBELLES_SECTEUR[plan.secteur] ?? plan.secteur;
    enfants.push(new Paragraph({ text: `Secteur : ${libelle}` }));
  }
  enfants.push(new Paragraph({ text: `Exporté le : ${plan.dateExport}` }));

  if (plan.sommaireAttendu && plan.sommaireAttendu.length > 0) {
    enfants.push(
      new Paragraph({ text: "Sommaire attendu", heading: HeadingLevel.HEADING_1 }),
    );
    for (const item of plan.sommaireAttendu) {
      enfants.push(new Paragraph({ text: item, bullet: { level: 0 } }));
    }
  }

  // Sections rédigées et validées : rendues avant les pièces requises et les
  // critères d'évaluation, car elles constituent le contenu narratif réel de
  // l'offre — les sections suivantes sont plus administratives (listes,
  // checklists). Aucune mention des sources ici (décision du spec).
  for (const section of plan.sectionsRedigees) {
    enfants.push(new Paragraph({ text: section.titre, heading: HeadingLevel.HEADING_1 }));
    const compacterCetteSection =
      compacterLettreSoumission &&
      identifierFormulaireStandard(section.titre) === "lettre_soumission";
    const paragraphes = section.contenu
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    for (const paragraphe of paragraphes) {
      enfants.push(
        new Paragraph(
          compacterCetteSection
            ? { text: paragraphe, spacing: ESPACEMENT_COMPACT }
            : { text: paragraphe },
        ),
      );
    }
  }

  enfants.push(new Paragraph({ text: "Pièces requises", heading: HeadingLevel.HEADING_1 }));
  if (plan.piecesRequises.length === 0) {
    enfants.push(new Paragraph({ text: "Aucune pièce requise identifiée." }));
  } else {
    for (const piece of plan.piecesRequises) {
      enfants.push(new Paragraph({ text: piece.libelle, heading: HeadingLevel.HEADING_2 }));
      if (piece.documents.length === 0) {
        enfants.push(
          new Paragraph({ text: "Aucun document associé — à compléter", bullet: { level: 0 } }),
        );
      } else {
        for (const document of piece.documents) {
          enfants.push(
            new Paragraph({
              text: `${document.nom} (${document.type})`,
              bullet: { level: 0 },
            }),
          );
        }
      }
    }
  }

  enfants.push(
    new Paragraph({ text: "Critères d'évaluation", heading: HeadingLevel.HEADING_1 }),
  );
  if (plan.criteresEvaluation.length === 0) {
    enfants.push(new Paragraph({ text: "Aucun critère d'évaluation identifié." }));
  } else {
    for (const critere of plan.criteresEvaluation) {
      const suffixe = critere.ponderation !== null ? ` — ${critere.ponderation}%` : "";
      enfants.push(
        new Paragraph({ text: `${critere.libelle}${suffixe}`, bullet: { level: 0 } }),
      );
    }
  }

  if (plan.bpu) {
    enfants.push(
      new Paragraph({ text: "Bordereau des prix unitaires", heading: HeadingLevel.HEADING_1 }),
    );

    for (const section of plan.bpu.sections) {
      enfants.push(new Paragraph({ text: section.titre, heading: HeadingLevel.HEADING_2 }));

      const avecCode = section.lignes.some((ligne) => ligne.codeArticle !== null);
      const entetes = avecCode
        ? ["Code", "Désignation", "Unité", "Quantité", "Prix unitaire", "Montant"]
        : ["Désignation", "Unité", "Quantité", "Prix unitaire", "Montant"];

      const ligneEntete = new TableRow({
        children: entetes.map(
          (texte) => new TableCell({ children: [new Paragraph({ text: texte })] }),
        ),
      });

      const lignesTable = section.lignes.map((ligne) => {
        const prixTexte =
          ligne.prixUnitaire !== null ? `${formaterMontant(ligne.prixUnitaire)} FCFA` : "à compléter";
        const montantTexte =
          ligne.montant !== null ? `${formaterMontant(ligne.montant)} FCFA` : "à compléter";
        const cellules = avecCode
          ? [ligne.codeArticle ?? "", ligne.designation, ligne.unite, String(ligne.quantite), prixTexte, montantTexte]
          : [ligne.designation, ligne.unite, String(ligne.quantite), prixTexte, montantTexte];
        return new TableRow({
          children: cellules.map((texte) => new TableCell({ children: [new Paragraph({ text: texte })] })),
        });
      });

      enfants.push(new Table({ rows: [ligneEntete, ...lignesTable] }));

      const lignesNonChiffreesSection = compterLignesNonChiffreesDansLignes(section.lignes);
      const texteTotalSection =
        lignesNonChiffreesSection > 0
          ? `Total section : à compléter — ${lignesNonChiffreesSection} ligne(s) non chiffrée(s)`
          : `Total section : ${formaterMontant(section.totalSection)} FCFA`;
      enfants.push(
        new Paragraph({
          children: [
            new TextRun({
              text: texteTotalSection,
              bold: true,
            }),
          ],
        }),
      );
    }

    const lignesNonChiffreesTotal = plan.bpu.sections.reduce(
      (total, section) => total + compterLignesNonChiffreesDansLignes(section.lignes),
      0,
    );
    const texteTotalGeneral =
      lignesNonChiffreesTotal > 0
        ? `Total général : à compléter — ${lignesNonChiffreesTotal} ligne(s) non chiffrée(s) au total`
        : `Total général : ${formaterMontant(plan.bpu.totalGeneral)} FCFA`;
    enfants.push(
      new Paragraph({
        children: [
          new TextRun({
            text: texteTotalGeneral,
            bold: true,
          }),
        ],
      }),
    );
  }

  const { headers, footers } = construireEnTetePiedPageDocx(plan);
  const document = new Document({
    sections: [{ headers, footers, children: enfants }],
  });

  return Packer.toBuffer(document);
}
