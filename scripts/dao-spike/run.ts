import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { normaliserDao } from "./normaliser";
import { extraireExigences } from "./extraire";

const FIXTURES = [
  "dao-1-propre.pdf",
  "dao-2-tableau-complexe.pdf",
  "dao-3-scanne.pdf",
];

async function main() {
  const dossierSortie = path.join("fixtures", "dao", "out");
  await mkdir(dossierSortie, { recursive: true });

  for (const nomFichier of FIXTURES) {
    console.log(`\n=== ${nomFichier} ===`);
    const cheminPdf = path.join("fixtures", "dao", nomFichier);
    const buffer = await readFile(cheminPdf);

    const { markdown, sections } = await normaliserDao(buffer, cheminPdf);
    const nomBase = nomFichier.replace(".pdf", "");

    await writeFile(path.join(dossierSortie, `${nomBase}.md`), markdown, "utf-8");
    console.log(`Markdown sauvegardé : out/${nomBase}.md (${sections.length} sections)`);

    const extraction = await extraireExigences(sections);
    await writeFile(
      path.join(dossierSortie, `${nomBase}.json`),
      JSON.stringify(extraction, null, 2),
      "utf-8"
    );
    console.log(`Extraction sauvegardée : out/${nomBase}.json`);
    console.log(`  Pièces requises : ${extraction.pieces_requises.length}`);
    console.log(`  Critères d'évaluation : ${extraction.criteres_evaluation.length}`);
    console.log(`  Délai de dépôt : ${extraction.delai_depot}`);
  }
}

main().catch((erreur) => {
  console.error("Erreur:", erreur);
  process.exit(1);
});
