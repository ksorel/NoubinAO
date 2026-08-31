import { PDFParse } from "pdf-parse";
import type { PageTexte } from "./types";
import { rendreImagePage, lireImageParClaude } from "./ocr";

const SEUIL_TEXTE_INSUFFISANT = 20;

// NOTE : la version installée (pdf-parse ^2.4.5) expose une API différente
// de l'API v1 historique : classe `PDFParse` avec `getText()` retournant
// déjà un texte par page (`{ num, text }`).
async function extraireTexteParPage(buffer: Buffer): Promise<PageTexte[]> {
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
