import { extraireTexteParPage } from "./pdf-texte";
import { rendreImagePage, lireImageParClaude } from "./ocr";
import {
  structurerEnMarkdownHeuristique,
  structurerEnMarkdownPandoc,
  decouperParSection,
  type SectionMarkdown,
} from "./markdown";

const SEUIL_TEXTE_INSUFFISANT = 20;

export async function normaliserDao(
  buffer: Buffer,
  cheminPdf: string
): Promise<{ markdown: string; sections: SectionMarkdown[] }> {
  const pages = await extraireTexteParPage(buffer);

  for (const page of pages) {
    if (page.texte.trim().length < SEUIL_TEXTE_INSUFFISANT) {
      console.log(
        `  Page ${page.numero} : texte insuffisant (${page.texte.trim().length} caractères), repli OCR`
      );
      const imagePage = await rendreImagePage(buffer, page.numero);
      page.texte = await lireImageParClaude(imagePage);
    }
  }

  const markdownPandoc = await structurerEnMarkdownPandoc(cheminPdf);
  const markdown = markdownPandoc ?? structurerEnMarkdownHeuristique(pages);
  console.log(`  Structuration : ${markdownPandoc ? "pandoc" : "heuristique (pandoc indisponible)"}`);

  const sections = decouperParSection(markdown);
  return { markdown, sections };
}
