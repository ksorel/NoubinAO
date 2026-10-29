import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow } from "docx";
import type { PlanSectionIII } from "./section-iii";

function valeurOu(champ: string | null, remplacement = "[à compléter]"): string {
  return champ && champ.trim().length > 0 ? champ : remplacement;
}

function celluleListe(lignes: string[]): TableCell {
  if (lignes.length === 0) {
    return new TableCell({ children: [new Paragraph({ text: "-" })] });
  }
  return new TableCell({
    children: lignes.map((texte) => new Paragraph({ text: texte, bullet: { level: 0 } })),
  });
}

export async function genererDocumentSectionIII(plan: PlanSectionIII): Promise<Buffer> {
  const enfants: (Paragraph | Table)[] = [
    new Paragraph({ text: "TABLEAU SECTION III - SPÉCIFICATIONS TECHNIQUES", heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `Objet : ${plan.titre}` }),
  ];

  if (plan.acheteur) {
    enfants.push(new Paragraph({ text: `Maître d'ouvrage : ${plan.acheteur}` }));
  }

  const ligneEntete = new TableRow({
    children: ["N°", "Équipement", "Spécifications exigées", "Spécifications proposées"].map(
      (texte) => new TableCell({ children: [new Paragraph({ text: texte })] }),
    ),
  });

  const lignesTable = plan.lignes.map(
    (ligne) =>
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ text: ligne.numero ?? "" })] }),
          new TableCell({ children: [new Paragraph({ text: ligne.equipement })] }),
          celluleListe(ligne.specsExigees),
          celluleListe(ligne.specsProposees),
        ],
      }),
  );

  enfants.push(new Table({ rows: [ligneEntete, ...lignesTable] }));

  enfants.push(
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Fait à _________________, le _________________." }),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Le représentant légal," }),
    new Paragraph({ text: valeurOu(plan.representantLegalNom) }),
  );

  const document = new Document({ sections: [{ children: enfants }] });
  return Packer.toBuffer(document);
}
