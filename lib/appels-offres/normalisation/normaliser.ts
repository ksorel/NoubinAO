import { decouperParSection, insererMarqueursTitres } from "./markdown";
import type { SectionMarkdown } from "./markdown";
import { extrairePagesPdf } from "./pdf";
import { extraireMarkdownDocx } from "./docx";

export const MIME_PDF = "application/pdf";
export const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MIME_TYPES_DAO_SUPPORTES = [MIME_PDF, MIME_DOCX] as const;

export async function normaliserDao(
  buffer: Buffer,
  mimeType: string,
): Promise<{ markdown: string; sections: SectionMarkdown[]; sourceOcr: boolean }> {
  let markdown: string;
  let sourceOcr: boolean;

  if (mimeType === MIME_PDF) {
    // Les pages extraites contiennent déjà leurs marqueurs ## (détection
    // par taille de police, voir pdf.ts) — pas besoin de la comparaison de
    // texte utilisée pour le DOCX.
    const pages = await extrairePagesPdf(buffer);
    markdown = pages.map((page) => page.texte).join("\n\n");
    // Vrai si AU MOINS une page est passée par l'OCR de repli (voir
    // extrairePagesPdf) — un DAO peut mélanger pages texte et pages
    // scannées.
    sourceOcr = pages.some((page) => page.ocr);
  } else if (mimeType === MIME_DOCX) {
    const texteBrut = await extraireMarkdownDocx(buffer);
    markdown = insererMarqueursTitres(texteBrut);
    // mammoth extrait du texte structuré, jamais une image : un DOCX n'est
    // jamais OCRisé par ce pipeline.
    sourceOcr = false;
  } else {
    throw new Error(`Type de fichier non supporté pour un DAO : ${mimeType}`);
  }

  const sections = decouperParSection(markdown);
  return { markdown, sections, sourceOcr };
}
