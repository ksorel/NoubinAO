import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  normaliserDao,
  MIME_PDF,
  MIME_DOCX,
} from "../../lib/appels-offres/normalisation/normaliser";
import { extraireInformationsAo } from "../../lib/appels-offres/normalisation/extraire";

const FIXTURES: { fichier: string; mimeType: string }[] = [
  { fichier: "dao-1-propre.pdf", mimeType: MIME_PDF },
  { fichier: "dao-2-tableau-complexe.pdf", mimeType: MIME_PDF },
  { fichier: "dao-3-scanne.pdf", mimeType: MIME_PDF },
  { fichier: "dao-4-modele.docx", mimeType: MIME_DOCX },
];

async function main() {
  const dossierSortie = path.join("fixtures", "dao", "out");
  await mkdir(dossierSortie, { recursive: true });

  for (const { fichier, mimeType } of FIXTURES) {
    console.log(`\n=== ${fichier} ===`);
    const cheminFichier = path.join("fixtures", "dao", fichier);
    const buffer = await readFile(cheminFichier);

    const { markdown, sections } = await normaliserDao(buffer, mimeType);
    const nomBase = fichier.replace(/\.(pdf|docx)$/, "");

    await writeFile(path.join(dossierSortie, `${nomBase}.md`), markdown, "utf-8");
    console.log(`Markdown sauvegardé : out/${nomBase}.md (${sections.length} sections)`);

    const extraction = await extraireInformationsAo(sections);
    await writeFile(
      path.join(dossierSortie, `${nomBase}.json`),
      JSON.stringify(extraction, null, 2),
      "utf-8",
    );
    console.log(`Extraction sauvegardée : out/${nomBase}.json`);
    console.log(`  Titre : ${extraction.titre}`);
    console.log(`  Acheteur : ${extraction.acheteur}`);
    console.log(`  Secteur : ${extraction.secteur}`);
    console.log(`  Date limite : ${extraction.date_limite}`);
    console.log(`  Montant caution : ${extraction.montant_caution}`);
    console.log(`  Sommaire attendu : ${extraction.sommaire_attendu.length}`);
    console.log(`  Exigences : ${extraction.exigences.length}`);
  }
}

main().catch((erreur) => {
  console.error("Erreur:", erreur);
  process.exit(1);
});
