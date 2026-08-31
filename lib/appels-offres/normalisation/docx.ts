import mammoth from "mammoth";
import TurndownService from "turndown";

const turndownService = new TurndownService();

export async function extraireMarkdownDocx(buffer: Buffer): Promise<string> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  return turndownService.turndown(html);
}
