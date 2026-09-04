import mammoth from "mammoth";
import TurndownService from "turndown";

const turndownService = new TurndownService();

// mammoth intègre les images du DOCX (logos, armoiries, etc.) sous forme de
// data URI base64 dans le HTML ; sans cette règle, turndown les reporte
// telles quelles dans le Markdown (`![](data:image/...;base64,...)`), soit
// parfois plusieurs dizaines de milliers de caractères pour une seule image.
// Confirmé sur un vrai DAO DOCX (2026-09-04) : un logo placé tout en haut du
// document, avant même l'AAO, suffisait à lui seul à saturer
// LONGUEUR_MAX_CONTENU_PERTINENT (extraire.ts) et à repousser le DPAO et les
// Critères d'évaluation hors du bloc envoyé à Claude — alors que ces images
// ne portent aucune information exploitable pour l'extraction.
turndownService.addRule("supprimerImages", {
  filter: "img",
  replacement: () => "",
});

export async function extraireMarkdownDocx(buffer: Buffer): Promise<string> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  return turndownService.turndown(html);
}
