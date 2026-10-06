import ExcelJS from "exceljs";
import type { PlanExport } from "./plan";

const CARACTERES_INTERDITS_FEUILLE = /[:\\/?*[\]]/g;

function nettoyerNomFeuille(titre: string, nomsUtilises: Set<string>): string {
  const base = titre.replace(CARACTERES_INTERDITS_FEUILLE, "").trim().slice(0, 31) || "Section";
  let nom = base;
  let suffixe = 2;
  while (nomsUtilises.has(nom)) {
    const suffixeTexte = ` (${suffixe})`;
    nom = `${base.slice(0, 31 - suffixeTexte.length)}${suffixeTexte}`;
    suffixe++;
  }
  nomsUtilises.add(nom);
  return nom;
}

function mettreEnGras(row: ExcelJS.Row): void {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true };
  });
}

type SectionBpuExport = NonNullable<PlanExport["bpu"]>["sections"][number];

interface MetaSection {
  section: SectionBpuExport;
  avecCode: boolean;
  colonneMontant: "E" | "F";
  nomFeuille: string;
  celluleTotal: string;
}

function construireMeta(sections: SectionBpuExport[]): MetaSection[] {
  const nomsFeuilles = new Set<string>(["Résumé"]);
  return sections.map((section) => {
    const avecCode = section.lignes.some((ligne) => ligne.codeArticle !== null);
    const colonneMontant = avecCode ? "F" : "E";
    const ligneTotalNumero = section.lignes.length + 2;
    return {
      section,
      avecCode,
      colonneMontant,
      nomFeuille: nettoyerNomFeuille(section.titre, nomsFeuilles),
      celluleTotal: `${colonneMontant}${ligneTotalNumero}`,
    };
  });
}

function construireFeuilleResume(classeur: ExcelJS.Workbook, plan: PlanExport, metas: MetaSection[]): void {
  const bpu = plan.bpu as NonNullable<PlanExport["bpu"]>;
  const resume = classeur.addWorksheet("Résumé");

  mettreEnGras(resume.addRow([plan.titre]));
  if (plan.acheteur) resume.addRow([`Maître d'ouvrage : ${plan.acheteur}`]);
  resume.addRow([`Exporté le : ${plan.dateExport}`]);
  resume.addRow([]);

  const entete = resume.addRow(["Section", "Total"]);
  mettreEnGras(entete);

  for (const meta of metas) {
    // Une apostrophe à l'intérieur d'un nom de feuille référencé entre
    // guillemets simples doit être doublée (syntaxe Excel pour un nom de
    // feuille entre guillemets) — sans quoi l'apostrophe termine le jeton
    // prématurément et produit une formule invalide. `nettoyerNomFeuille`
    // ne retire que `: \ / ? * [ ]`, pas `'`, donc un titre de section
    // tout à fait normal comme "Travaux d'assainissement" doit être géré
    // ici, à l'interpolation, plutôt qu'à la source du nom de feuille.
    const nomFeuilleEchappe = meta.nomFeuille.replace(/'/g, "''");
    const row = resume.addRow([meta.section.titre, { formula: `'${nomFeuilleEchappe}'!${meta.celluleTotal}` }]);
    row.getCell(2).numFmt = "#,##0";
  }

  const premiereLigneSection = entete.number + 1;
  const derniereLigneSection = entete.number + metas.length;
  const ligneTotalGeneral = resume.addRow([
    "Total général",
    { formula: `SUM(B${premiereLigneSection}:B${derniereLigneSection})` },
  ]);
  mettreEnGras(ligneTotalGeneral);
  ligneTotalGeneral.getCell(2).numFmt = "#,##0";

  const lignesNonChiffreesTotal = bpu.sections.reduce(
    (total, section) => total + section.lignes.filter((ligne) => ligne.prixUnitaire === null).length,
    0,
  );
  if (lignesNonChiffreesTotal > 0) {
    resume.addRow([`${lignesNonChiffreesTotal} ligne(s) non chiffrée(s)`]);
  }

  resume.getColumn(1).width = 40;
  resume.getColumn(2).width = 20;
}

function construireFeuilleSection(classeur: ExcelJS.Workbook, meta: MetaSection): void {
  const { section, avecCode, colonneMontant, nomFeuille } = meta;
  const feuille = classeur.addWorksheet(nomFeuille);
  const colonneQuantite = avecCode ? "D" : "C";
  const colonnePrix = avecCode ? "E" : "D";

  const entetes = avecCode
    ? ["Code", "Désignation", "Unité", "Quantité", "Prix unitaire", "Montant"]
    : ["Désignation", "Unité", "Quantité", "Prix unitaire", "Montant"];
  mettreEnGras(feuille.addRow(entetes));

  for (const ligne of section.lignes) {
    const valeurs = avecCode
      ? [ligne.codeArticle, ligne.designation, ligne.unite, ligne.quantite, ligne.prixUnitaire]
      : [ligne.designation, ligne.unite, ligne.quantite, ligne.prixUnitaire];
    const row = feuille.addRow(valeurs);
    row.getCell(colonneMontant).value = {
      formula: `${colonneQuantite}${row.number}*${colonnePrix}${row.number}`,
    };
    row.getCell(colonnePrix).numFmt = "#,##0";
    row.getCell(colonneMontant).numFmt = "#,##0";
  }

  const ligneTotal = feuille.addRow([]);
  ligneTotal.getCell(avecCode ? "E" : "D").value = "Total section";
  ligneTotal.getCell(colonneMontant).value = {
    formula: `SUM(${colonneMontant}2:${colonneMontant}${ligneTotal.number - 1})`,
  };
  ligneTotal.getCell(colonneMontant).numFmt = "#,##0";
  mettreEnGras(ligneTotal);

  feuille.columns = avecCode
    ? [{ width: 10 }, { width: 40 }, { width: 10 }, { width: 10 }, { width: 15 }, { width: 15 }]
    : [{ width: 40 }, { width: 10 }, { width: 10 }, { width: 15 }, { width: 15 }];
}

export async function genererClasseurExcelBpu(plan: PlanExport): Promise<Buffer> {
  if (plan.bpu === null) {
    throw new Error("Aucune section BPU à exporter.");
  }

  const metas = construireMeta(plan.bpu.sections);
  const classeur = new ExcelJS.Workbook();

  construireFeuilleResume(classeur, plan, metas);
  for (const meta of metas) {
    construireFeuilleSection(classeur, meta);
  }

  return Buffer.from(await classeur.xlsx.writeBuffer());
}
