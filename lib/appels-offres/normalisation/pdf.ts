import { PDFParse } from "pdf-parse";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { PageTexte } from "./types";
import { rendreImagePage, lireImageParClaude } from "./ocr";

const SEUIL_TEXTE_INSUFFISANT = 20;

let workerPdfParseInitialise = false;

// Même problème que ocr.ts::initialiserWorkerSrc, mais pour la copie de
// pdfjs-dist NICHÉE dans pdf-parse (node_modules/pdf-parse/node_modules/
// pdfjs-dist), distincte de la copie top-level utilisée par ocr.ts. Sans
// workerSrc explicite, pdfjs-dist tente de configurer un "fake worker" Node
// en import()-ant un chemin relatif à son propre bundle, que Turbopack ne
// préserve pas dans le build serverless Vercel ("Cannot find module
// .../pdf.worker.mjs"). Résolu au premier appel réel (pas au chargement du
// module — voir ocr.ts pour pourquoi).
//
// N'utilise PAS require.resolve()/createRequire() : confirmé en production
// (Vercel) que resoudre le bare specifier "pdf-parse" via ce mécanisme
// renvoie un identifiant de module numérique interne à Turbopack au lieu
// d'un vrai chemin de fichier ("The argument 'filename' must be a file
// URL... Received 42839") — Turbopack virtualise `require` même à
// l'exécution réelle pour ce type de résolution, pas seulement pendant le
// build. Construire le chemin directement depuis process.cwd() (racine du
// projet dans la fonction serverless) contourne entièrement ce mécanisme.
function initialiserWorkerPdfParse(): void {
  if (workerPdfParseInitialise) return;

  const workerPath = join(
    process.cwd(),
    "node_modules/pdf-parse/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  );
  PDFParse.setWorker(pathToFileURL(workerPath).href);
  workerPdfParseInitialise = true;
}

// NOTE : la version installée (pdf-parse ^2.4.5) expose une API différente
// de l'API v1 historique : classe `PDFParse` avec `getText()` retournant
// déjà un texte par page (`{ num, text }`).
async function extraireTexteParPage(buffer: Buffer): Promise<PageTexte[]> {
  initialiserWorkerPdfParse();

  // Garde symétrique à celle de `ocr.ts::rendreImagePage`. `pdf-parse`
  // embarque SA PROPRE copie imbriquée de pdfjs-dist, distincte de la copie
  // top-level utilisée par `ocr.ts`. Les deux copies partagent
  // `globalThis.pdfjsWorker` : le vider avant chaque appel force chaque
  // copie à se réenregistrer proprement avec son propre worker, quel que
  // soit ce qui a tourné avant dans ce process.
  delete (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker;

  const parser = new PDFParse({ data: buffer });
  try {
    const resultat = await parser.getText();
    return resultat.pages.map((page) => ({ numero: page.num, texte: page.text }));
  } finally {
    await parser.destroy();
  }
}

export async function extrairePagesPdf(buffer: Buffer): Promise<PageTexte[]> {
  const pages = await extraireTexteParPage(buffer);

  for (const page of pages) {
    if (page.texte.trim().length < SEUIL_TEXTE_INSUFFISANT) {
      const imagePage = await rendreImagePage(buffer, page.numero);
      page.texte = await lireImageParClaude(imagePage);
    }
  }

  return pages;
}
