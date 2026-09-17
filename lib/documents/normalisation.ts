import WordExtractor from "word-extractor";
import { normaliserDao, MIME_PDF, MIME_DOCX } from "@/lib/appels-offres/normalisation/normaliser";
import { lireImageParClaude } from "@/lib/appels-offres/normalisation/ocr";

const MIME_DOC_LEGACY = "application/msword";
const MIME_JPEG = "image/jpeg";
const MIME_PNG = "image/png";

export async function normaliserDocument(
  buffer: Buffer,
  mimeType: string,
): Promise<{ markdown: string | null; sourceOcr: boolean }> {
  try {
    if (mimeType === MIME_PDF || mimeType === MIME_DOCX) {
      const resultat = await normaliserDao(buffer, mimeType);
      return { markdown: resultat.markdown, sourceOcr: false };
    }

    if (mimeType === MIME_JPEG || mimeType === MIME_PNG) {
      const texte = await lireImageParClaude(buffer);
      return { markdown: texte.trim().length > 0 ? texte : null, sourceOcr: true };
    }

    if (mimeType === MIME_DOC_LEGACY) {
      const extractor = new WordExtractor();
      const document = await extractor.extract(buffer);
      const texte = document.getBody();
      return { markdown: texte.trim().length > 0 ? texte : null, sourceOcr: false };
    }

    return { markdown: null, sourceOcr: false };
  } catch (erreur) {
    // Best-effort : une erreur de normalisation ne doit jamais faire
    // échouer l'upload — le fichier reste utilisable (téléchargeable)
    // même sans texte extrait.
    console.error("Échec de la normalisation du document :", erreur);
    return { markdown: null, sourceOcr: false };
  }
}
