import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { genererClasseurExcelBpu } from "./xlsx";
import type { PlanExport } from "./plan";

function creerPlan(bpu: PlanExport["bpu"]): PlanExport {
  return {
    titre: "Construction d'un pont",
    acheteur: "Ministère des Infrastructures",
    secteur: "btp",
    dateExport: "06/10/2026",
    sommaireAttendu: null,
    sectionsRedigees: [],
    piecesRequises: [],
    criteresEvaluation: [],
    bpu,
  };
}

async function lireClasseur(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const classeur = new ExcelJS.Workbook();
  // `exceljs/index.d.ts` déclare un `Buffer` fantôme local (`extends
  // ArrayBuffer`) qui masque le vrai type Node `Buffer` pour la signature de
  // `load()` — un Buffer Node réel (sous-classe de Uint8Array) ne satisfait
  // donc jamais ce type sous `tsc` strict, même si l'appel est correct à
  // l'exécution. Contournement local au test ; `xlsx.ts` n'appelle jamais
  // `load()` et n'est pas concerné.
  await classeur.xlsx.load(buffer as unknown as ArrayBuffer);
  return classeur;
}

describe("genererClasseurExcelBpu", () => {
  it("lève une erreur si plan.bpu est null", async () => {
    await expect(genererClasseurExcelBpu(creerPlan(null))).rejects.toThrow();
  });

  it("génère la feuille de section avec formule Montant et total, sans colonne Code", async () => {
    const plan = creerPlan({
      sections: [
        {
          titre: "Lot 1",
          lignes: [
            { codeArticle: null, designation: "Terrassement", unite: "m3", quantite: 10, prixUnitaire: 5000, montant: 50000 },
            { codeArticle: null, designation: "Béton", unite: "m3", quantite: 2, prixUnitaire: 80000, montant: 160000 },
          ],
          totalSection: 210000,
        },
      ],
      totalGeneral: 210000,
    });

    const buffer = await genererClasseurExcelBpu(plan);
    const classeur = await lireClasseur(buffer);
    const feuille = classeur.getWorksheet("Lot 1")!;

    expect(feuille.getRow(1).getCell(1).value).toBe("Désignation");
    expect(feuille.getRow(2).getCell(5).formula).toBe("C2*D2");
    expect(feuille.getRow(3).getCell(5).formula).toBe("C3*D3");
    expect(feuille.getRow(4).getCell(4).value).toBe("Total section");
    expect(feuille.getRow(4).getCell(5).formula).toBe("SUM(E2:E3)");
  });

  it("décale les colonnes de formule quand la section a un code article", async () => {
    const plan = creerPlan({
      sections: [
        {
          titre: "Lot 2",
          lignes: [
            { codeArticle: "A1", designation: "Fondations", unite: "m3", quantite: 4, prixUnitaire: 30000, montant: 120000 },
          ],
          totalSection: 120000,
        },
      ],
      totalGeneral: 120000,
    });

    const buffer = await genererClasseurExcelBpu(plan);
    const classeur = await lireClasseur(buffer);
    const feuille = classeur.getWorksheet("Lot 2")!;

    expect(feuille.getRow(1).getCell(1).value).toBe("Code");
    expect(feuille.getRow(2).getCell(6).formula).toBe("D2*E2");
    expect(feuille.getRow(3).getCell(6).formula).toBe("SUM(F2:F2)");
  });

  it("la feuille Résumé référence le total de chaque section et les additionne", async () => {
    const plan = creerPlan({
      sections: [
        { titre: "Lot A", lignes: [{ codeArticle: null, designation: "X", unite: "u", quantite: 1, prixUnitaire: 1000, montant: 1000 }], totalSection: 1000 },
        { titre: "Lot B", lignes: [{ codeArticle: null, designation: "Y", unite: "u", quantite: 1, prixUnitaire: 2000, montant: 2000 }], totalSection: 2000 },
      ],
      totalGeneral: 3000,
    });

    const buffer = await genererClasseurExcelBpu(plan);
    const classeur = await lireClasseur(buffer);
    const resume = classeur.getWorksheet("Résumé")!;

    expect(resume.getRow(5).getCell(1).value).toBe("Section");
    expect(resume.getRow(6).getCell(1).value).toBe("Lot A");
    expect(resume.getRow(6).getCell(2).formula).toBe("'Lot A'!E3");
    expect(resume.getRow(7).getCell(1).value).toBe("Lot B");
    expect(resume.getRow(7).getCell(2).formula).toBe("'Lot B'!E3");
    expect(resume.getRow(8).getCell(1).value).toBe("Total général");
    expect(resume.getRow(8).getCell(2).formula).toBe("SUM(B6:B7)");
  });

  it("ajoute une ligne 'lignes non chiffrées' seulement s'il y en a", async () => {
    const planAvecNonChiffree = creerPlan({
      sections: [
        {
          titre: "Lot C",
          lignes: [{ codeArticle: null, designation: "Z", unite: "u", quantite: 1, prixUnitaire: null, montant: null }],
          totalSection: 0,
        },
      ],
      totalGeneral: 0,
    });
    const bufferAvec = await genererClasseurExcelBpu(planAvecNonChiffree);
    const classeurAvec = await lireClasseur(bufferAvec);
    const resumeAvec = classeurAvec.getWorksheet("Résumé")!;
    // 1 section → rows: 1 titre, 2 acheteur, 3 date, 4 vide, 5 entête, 6 section, 7 total général, 8 non chiffrées
    expect(resumeAvec.getRow(8).getCell(1).value).toBe("1 ligne(s) non chiffrée(s)");

    const planSansNonChiffree = creerPlan({
      sections: [
        { titre: "Lot D", lignes: [{ codeArticle: null, designation: "W", unite: "u", quantite: 1, prixUnitaire: 500, montant: 500 }], totalSection: 500 },
      ],
      totalGeneral: 500,
    });
    const bufferSans = await genererClasseurExcelBpu(planSansNonChiffree);
    const classeurSans = await lireClasseur(bufferSans);
    const resumeSans = classeurSans.getWorksheet("Résumé")!;
    expect(resumeSans.getRow(8).getCell(1).value).toBeNull();
  });

  it("nettoie et dédoublonne les noms de feuille", async () => {
    const titreLong = "Lot: Voirie / Assainissement [phase 1] très long titre de section";
    const plan = creerPlan({
      sections: [
        { titre: titreLong, lignes: [{ codeArticle: null, designation: "X", unite: "u", quantite: 1, prixUnitaire: 100, montant: 100 }], totalSection: 100 },
        { titre: titreLong, lignes: [{ codeArticle: null, designation: "Y", unite: "u", quantite: 1, prixUnitaire: 200, montant: 200 }], totalSection: 200 },
      ],
      totalGeneral: 300,
    });

    const buffer = await genererClasseurExcelBpu(plan);
    const classeur = await lireClasseur(buffer);
    const noms = classeur.worksheets.map((feuille) => feuille.name);

    expect(noms.every((nom) => nom.length <= 31)).toBe(true);
    expect(noms.some((nom) => /[:\\/?*[\]]/.test(nom))).toBe(false);
    expect(new Set(noms).size).toBe(noms.length);
  });
});
