# Export Excel natif du BPU — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a button on the BPU (bordereau des prix unitaires) tab of an `appel_offres` detail page that exports the BPU as a native `.xlsx` workbook — one sheet per BPU section plus a "Résumé" sheet — with live Excel formulas so unpriced lines stay editable after export.

**Architecture:** Mirrors the existing Word export pipeline (`construirePlanExport` → format-specific renderer → Storage upload → signed URL). A new renderer `lib/appels-offres/export/xlsx.ts` consumes the same `PlanExport.bpu` shape already produced by `construirePlanExport` (no changes needed there). A new Server Action `exporterBpuExcel` in `lib/appels-offres/actions.ts` wires renderer → Storage, following `exporterDossierReponse`'s exact pattern but without touching `dossier_reponse` (this export isn't part of that lifecycle). A new button in `app/(app)/appels-offres/[id]/bpu.tsx` triggers it.

**Tech Stack:** Next.js Server Actions, Supabase Storage, `exceljs` (new dependency), Vitest, next-intl.

## Global Constraints

- French variable/function names throughout (`lib/appels-offres/` convention) — only type/library names stay in English.
- TypeScript strict mode — no `any`, no unchecked casts.
- Lignes non chiffrées (`prixUnitaire === null`): Prix unitaire cell left empty, Montant cell holds a live Excel formula (`=Quantité*PrixUnitaire` by cell reference) — never a text placeholder, never a value computed server-side.
- Sheet totals (section and résumé) are Excel formulas (`SUM(...)`, cross-sheet reference), never values recomputed in JS — must stay correct after a user edits a price in Excel.
- Sheet names: strip `: \ / ? * [ ]`, truncate to 31 chars, deduplicate on collision with a numeric suffix.
- No new DB table/column. No write to `dossier_reponse`.
- `exporterBpuExcel` returns an error (`{ erreur: string }`) if `plan.bpu === null` — never generates an empty workbook.
- Storage path: `${entrepriseId}/appels-offres/exports/${appelOffresId}-bpu.xlsx`, content type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `upsert: true`.
- Spec: `docs/superpowers/specs/2026-10-06-export-bpu-excel-design.md`.

---

### Task 1: Add `exceljs` dependency

**Files:**
- Modify: `package.json`, `package-lock.json` (both via `npm install`)

**Interfaces:**
- Produces: `exceljs` importable as `import ExcelJS from "exceljs"` in later tasks.

- [ ] **Step 1: Install the package**

Run: `npm install exceljs`

- [ ] **Step 2: Verify it landed in `package.json` dependencies**

Run: `grep -n "exceljs" package.json`
Expected: a line like `"exceljs": "^4.x.x",` under `"dependencies"`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: ajoute exceljs pour l'export Excel du BPU"
```

---

### Task 2: Storage path helper for the BPU Excel export

**Files:**
- Modify: `lib/appels-offres/storage-path.ts`
- Test: `lib/appels-offres/storage-path.test.ts`

**Interfaces:**
- Produces: `construireCheminStockageExportBpu(entrepriseId: string, appelOffresId: string): string`

- [ ] **Step 1: Write the failing test**

Add to `lib/appels-offres/storage-path.test.ts`:

```typescript
import { construireCheminStockageExportBpu } from "./storage-path";

describe("construireCheminStockageExportBpu", () => {
  it("construit un chemin fixe sous exports/, en .xlsx", () => {
    const chemin = construireCheminStockageExportBpu("ent-1", "ao-1");
    expect(chemin).toBe("ent-1/appels-offres/exports/ao-1-bpu.xlsx");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- storage-path`
Expected: FAIL — `construireCheminStockageExportBpu` is not exported from `./storage-path`.

- [ ] **Step 3: Implement**

Add to `lib/appels-offres/storage-path.ts` (after `construireCheminStockageExport`):

```typescript
export function construireCheminStockageExportBpu(
  entrepriseId: string,
  appelOffresId: string,
): string {
  return `${entrepriseId}/appels-offres/exports/${appelOffresId}-bpu.xlsx`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- storage-path`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/storage-path.ts lib/appels-offres/storage-path.test.ts
git commit -m "feat(appels-offres): ajoute le chemin de stockage pour l'export Excel du BPU"
```

---

### Task 3: `genererClasseurExcelBpu` renderer

**Files:**
- Create: `lib/appels-offres/export/xlsx.ts`
- Test: `lib/appels-offres/export/xlsx.test.ts`

**Interfaces:**
- Consumes: `PlanExport` from `./plan` (specifically `plan.titre: string`, `plan.acheteur: string | null`, `plan.dateExport: string`, `plan.bpu: { sections: Array<{ titre: string; lignes: Array<{ codeArticle: string | null; designation: string; unite: string; quantite: number; prixUnitaire: number | null; montant: number | null }> }> } | null`).
- Produces: `genererClasseurExcelBpu(plan: PlanExport): Promise<Buffer>` — throws `Error` if `plan.bpu === null`. Used by Task 4.

- [ ] **Step 1: Write the first failing test (null bpu throws)**

Create `lib/appels-offres/export/xlsx.test.ts`:

```typescript
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
  await classeur.xlsx.load(buffer);
  return classeur;
}

describe("genererClasseurExcelBpu", () => {
  it("lève une erreur si plan.bpu est null", async () => {
    await expect(genererClasseurExcelBpu(creerPlan(null))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- xlsx.test`
Expected: FAIL — `lib/appels-offres/export/xlsx.ts` does not exist (module not found).

- [ ] **Step 3: Implement the full renderer**

Create `lib/appels-offres/export/xlsx.ts`:

```typescript
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
    const row = resume.addRow([meta.section.titre, { formula: `'${meta.nomFeuille}'!${meta.celluleTotal}` }]);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- xlsx.test`
Expected: PASS.

- [ ] **Step 5: Add test — single section without code column: formula and total correct**

Add to `xlsx.test.ts`:

```typescript
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- xlsx.test`
Expected: PASS.

- [ ] **Step 7: Add test — section with a code column shifts formula columns**

Add to `xlsx.test.ts`:

```typescript
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
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- xlsx.test`
Expected: PASS.

- [ ] **Step 9: Add test — Résumé references section totals and sums them**

Add to `xlsx.test.ts`:

```typescript
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
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npm test -- xlsx.test`
Expected: PASS.

- [ ] **Step 11: Add test — lignes non chiffrées row appears only when needed**

Add to `xlsx.test.ts`:

```typescript
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
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm test -- xlsx.test`
Expected: PASS.

- [ ] **Step 13: Add test — sheet name sanitization and deduplication**

Add to `xlsx.test.ts`:

```typescript
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
```

- [ ] **Step 14: Run test to verify it passes**

Run: `npm test -- xlsx.test`
Expected: PASS, all tests in the file green.

- [ ] **Step 15: Commit**

```bash
git add lib/appels-offres/export/xlsx.ts lib/appels-offres/export/xlsx.test.ts
git commit -m "feat(appels-offres): génère le classeur Excel du BPU (feuille par section + résumé)"
```

---

### Task 4: Server Action `exporterBpuExcel`

**Files:**
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: `genererClasseurExcelBpu` (Task 3), `construireCheminStockageExportBpu` (Task 2), existing `obtenirUtilisateurCourant`, `obtenirAppelOffres`, `listerBpu`, `construirePlanExport`, `createClient`.
- Produces: `exporterBpuExcel(appelOffresId: string): Promise<{ erreur: string } | { url: string }>`. Used by Task 5.

- [ ] **Step 1: Add the new imports**

In `lib/appels-offres/actions.ts`, extend the existing import from `./storage-path` (currently `construireCheminStockageDao, construireCheminStockageExport, construireCheminStockageModeleCv, construireCheminStockageCvTransforme`) to also include `construireCheminStockageExportBpu`, and add a new import line right after the existing `import { genererDocumentWord } from "./export/docx";`:

```typescript
import { genererClasseurExcelBpu } from "./export/xlsx";
```

- [ ] **Step 2: Add the Server Action**

Insert directly after the closing brace of `exporterDossierReponse` (ends at line 502 with `return { url: data.signedUrl };` then `}`) in `lib/appels-offres/actions.ts`:

```typescript
export async function exporterBpuExcel(
  appelOffresId: string,
): Promise<{ erreur: string } | { url: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const resultat = await obtenirAppelOffres(appelOffresId, utilisateur.entreprise_id);
  if (!resultat) return { erreur: "Appel d'offres introuvable." };

  const { sections: sectionsBpu, lignesParSection: lignesParSectionBpu } =
    await listerBpu(appelOffresId);

  const plan = construirePlanExport(
    resultat.appelOffres,
    resultat.exigences,
    resultat.documentsParExigence,
    resultat.sections,
    new Date(),
    sectionsBpu,
    lignesParSectionBpu,
  );

  if (plan.bpu === null) {
    return { erreur: "Aucune section BPU à exporter." };
  }

  let buffer: Buffer;
  try {
    buffer = await genererClasseurExcelBpu(plan);
  } catch {
    return { erreur: "Échec de la génération du classeur. Réessayez." };
  }

  const cheminStockage = construireCheminStockageExportBpu(utilisateur.entreprise_id, appelOffresId);

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, buffer, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });

  if (erreurUpload) {
    return { erreur: "Échec de la génération du classeur. Réessayez." };
  }

  const { data, error: erreurUrl } = await supabase.storage
    .from("documents")
    .createSignedUrl(cheminStockage, 60);

  if (erreurUrl || !data) return { erreur: "Impossible de générer le lien." };

  return { url: data.signedUrl };
}
```

- [ ] **Step 3: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors (in particular: no unused-import or missing-export errors from the new `./export/xlsx` and `./storage-path` symbols).

- [ ] **Step 4: Commit**

```bash
git add lib/appels-offres/actions.ts
git commit -m "feat(appels-offres): ajoute la Server Action d'export Excel du BPU"
```

---

### Task 5: Button and i18n keys in the BPU tab

**Files:**
- Modify: `app/(app)/appels-offres/[id]/bpu.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `exporterBpuExcel` (Task 4).

- [ ] **Step 1: Add the French i18n keys**

In `messages/fr.json`, inside `AppelsOffres.detail.bpu` (the block starting at `"bpu": {`), the last key is currently:

```json
        "suggestionPrixIgnorer": "Ignorer"
```

Change it to add a trailing comma and two new keys:

```json
        "suggestionPrixIgnorer": "Ignorer",
        "boutonExporterExcel": "Exporter en Excel",
        "exportationExcelEnCours": "Export..."
```

- [ ] **Step 2: Add the English i18n keys**

In `messages/en.json`, same block, currently ending with:

```json
        "suggestionPrixIgnorer": "Dismiss"
```

Change to:

```json
        "suggestionPrixIgnorer": "Dismiss",
        "boutonExporterExcel": "Export to Excel",
        "exportationExcelEnCours": "Exporting..."
```

- [ ] **Step 3: Import the new action and add state**

In `app/(app)/appels-offres/[id]/bpu.tsx`, change:

```typescript
import { creerSectionBpu } from "@/lib/appels-offres/actions";
```

to:

```typescript
import { creerSectionBpu, exporterBpuExcel } from "@/lib/appels-offres/actions";
```

Add `toast` is already imported. Add a new state variable right after the existing `const [ajoutEnCours, setAjoutEnCours] = useState(false);`:

```typescript
  const [exportationExcelEnCours, setExportationExcelEnCours] = useState(false);
```

- [ ] **Step 4: Add the handler function**

Add this function right after `ajouterSection` (before `function retirerSection`):

```typescript
  async function exporterExcel() {
    setExportationExcelEnCours(true);
    const resultat = await exporterBpuExcel(appelOffresId);
    setExportationExcelEnCours(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }
```

- [ ] **Step 5: Add the button next to the total général**

Change the header block:

```tsx
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("titre")}</h2>
        <div className="text-right text-sm">
          <p className="font-semibold">
            {t("totalGeneral")} : {totalGeneral.toLocaleString("fr-FR")} FCFA
          </p>
          {nonChiffrees > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("lignesNonChiffrees", { count: nonChiffrees })}
            </p>
          )}
        </div>
      </div>
```

to:

```tsx
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("titre")}</h2>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm">
            <p className="font-semibold">
              {t("totalGeneral")} : {totalGeneral.toLocaleString("fr-FR")} FCFA
            </p>
            {nonChiffrees > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("lignesNonChiffrees", { count: nonChiffrees })}
              </p>
            )}
          </div>
          {sectionsTriees.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exporterExcel}
              disabled={exportationExcelEnCours}
            >
              {exportationExcelEnCours ? t("exportationExcelEnCours") : t("boutonExporterExcel")}
            </Button>
          )}
        </div>
      </div>
```

Note: `sectionsTriees` is already declared earlier in the component, right before the `return (` statement — no need to move anything, it's already in scope for this JSX.

- [ ] **Step 6: Verify the project still typechecks and lints**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors in `bpu.tsx`, `fr.json`, `en.json`.

- [ ] **Step 7: Manual verification**

Start the dev server (`npm run dev`), open an `appel_offres` detail page with at least one BPU section containing both a priced and an unpriced line, go to the BPU tab:
- Confirm the "Exporter en Excel" button appears next to the total général.
- Click it, confirm a `.xlsx` file downloads/opens in a new tab.
- Open the file: confirm a "Résumé" sheet (first tab) lists each section with its total and a "Total général" row, and one sheet per section with a working `=Quantité*PrixUnitaire` formula in the Montant column (visible when clicking the cell), an empty Prix unitaire cell on the unpriced line, and a bold "Total section" row.
- Edit the empty Prix unitaire cell in Excel/LibreOffice with a number: confirm the Montant cell, the section total, and the Résumé total général all update live.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/appels-offres/[id]/bpu.tsx" messages/fr.json messages/en.json
git commit -m "feat(appels-offres): bouton d'export Excel du BPU"
```

---

## Spec Coverage Check

- Bouton dans `Bpu`, visible seulement si sections existent → Task 5.
- Une feuille par section + feuille Résumé en première position → Task 3.
- Lignes non chiffrées éditables (formule, pas de texte figé) → Task 3 (Step 3, 5).
- `exceljs` → Task 1.
- Stockage Supabase Storage, URL signée, pas de table/colonne nouvelle, pas de `dossier_reponse` touché → Task 4.
- Erreur si `plan.bpu === null` → Task 3 (Step 1-2), Task 4 (Step 2).
- Nettoyage/déduplication des noms de feuille → Task 3 (Step 13-14).
- Tests sur `xlsx.ts` uniquement, pas sur la Server Action ni le bouton → Task 3 vs Task 4/5 (verification by typecheck/manual, not automated test), matches spec's "Hors périmètre" test scope.
