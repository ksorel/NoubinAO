import { Document, Paragraph, Packer } from "docx";

export async function genererDocumentCvTransforme(contenuMarkdown: string): Promise<Buffer> {
  const paragraphes = contenuMarkdown
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => new Paragraph({ text: p }));

  const document = new Document({ sections: [{ children: paragraphes }] });
  return Packer.toBuffer(document);
}
