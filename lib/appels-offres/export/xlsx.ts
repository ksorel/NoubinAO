import ExcelJS from "exceljs";
import type { PlanExport } from "./plan";

const CARACTERES_INTERDITS_FEUILLE = /[:\\/?*[\]]/g;

// exceljs rejette un nom de feuille qui commence ou termine par une
// apostrophe (distinct de l'échappement d'apostrophe interne fait à
// l'interpolation dans `construireFeuilleResume` — ici c'est le nom de
// feuille lui-même qui est invalide pour Excel). La troncature à
// `longueurMax` peut elle-même faire apparaître une apostrophe en bordure
// (ex. "Travaux d'assainissement" tronqué à 10 caractères donne
// "Travaux d'"), donc le nettoyage doit être refait après chaque troncature,
// pas seulement sur le titre d'origine.
function normaliserNomFeuille(nomBrut: string, longueurMax: number): string {
  const tronque = nomBrut.slice(0, longueurMax).replace(/^'+|'+$/g, "");
  return tronque || "Section";
}

function nettoyerNomFeuille(titre: string, nomsUtilises: Set<string>): string {
  const brut = titre.replace(CARACTERES_INTERDITS_FEUILLE, "").trim();
  const base = normaliserNomFeuille(brut, 31);
  let nom = base;
  let suffixe = 2;
  // exceljs compare les noms de feuille de façon insensible à la casse pour
  // détecter les doublons ; `nomsUtilises` doit donc être consulté et peuplé
  // en minuscule, sinon "Lot 1" et "LOT 1" (ou une section "résumé" face à
  // la feuille réservée "Résumé") passent ce contrôle puis font échouer
  // `classeur.addWorksheet` avec une erreur générique à l'exécution.
  while (nomsUtilises.has(nom.toLowerCase())) {
    const suffixeTexte = ` (${suffixe})`;
    nom = `${normaliserNomFeuille(base, 31 - suffixeTexte.length)}${suffixeTexte}`;
    suffixe++;
  }
  nomsUtilises.add(nom.toLowerCase());
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
  const nomsFeuilles = new Set<string>(["résumé"]);
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
  // Section vide (0 ligne) : la ligne de total est alors la ligne 2
  // elle-même (entête=1, aucune ligne de données, total=2). Une formule
  // `SUM(E2:E1)` serait normalisée par Excel en `SUM(E1:E2)`, qui inclut la
  // cellule de total elle-même → référence circulaire dès l'ouverture. Ce
  // n'est pas un cas limite théorique : `creerSectionBpu` crée des sections
  // à 0 ligne par défaut (flux normal "ajouter une section, la remplir
  // ensuite"), et le bouton d'export est déjà visible à ce stade.
  ligneTotal.getCell(colonneMontant).value =
    section.lignes.length === 0
      ? 0
      : { formula: `SUM(${colonneMontant}2:${colonneMontant}${ligneTotal.number - 1})` };
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
  // exceljs écrit les cellules formule sans valeur mise en cache, ce qui
  // convient à Microsoft Excel (recalcule automatiquement à l'ouverture)
  // mais pas à LibreOffice Calc, dont le réglage par défaut pour les .xlsx
  // est "Ne jamais recalculer" : Montant, totaux de section et Total
  // général resteraient vides tant que l'utilisateur ne force pas un
  // recalcul (Ctrl+Maj+F9). Cette propriété force le recalcul à l'ouverture
  // quel que soit le tableur.
  classeur.calcProperties.fullCalcOnLoad = true;

  construireFeuilleResume(classeur, plan, metas);
  for (const meta of metas) {
    construireFeuilleSection(classeur, meta);
  }

  return Buffer.from(await classeur.xlsx.writeBuffer());
}
