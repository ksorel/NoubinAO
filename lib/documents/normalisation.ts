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
      // Plafond de 5 pages OCRisées, ICI SEULEMENT (pas dans traitement.ts,
      // qui traite les DAO) : ajouterDocument fait l'OCR de façon
      // synchrone dans la Server Action d'upload — chaque page OCRisée est
      // un appel séquentiel à l'API Claude, et un PDF scanné volumineux
      // (15-20 pages) peut dépasser le timeout par défaut d'une Server
      // Action Vercel, laissant le fichier déjà uploadé en Storage mais
      // jamais inséré en base (orphelin). Le traitement DAO (traitement.ts)
      // n'a pas ce risque : il tourne déjà de façon asynchrone via la file
      // QStash avec maxDuration=60, donc pas de plafond là-bas. 5 pages
      // couvre une pièce administrative scannée typique (1-3 pages) avec de
      // la marge, sans risquer le timeout sur un document plus long — au
      // delà, le document reste utilisable avec un texte partiel
      // (best-effort, cohérent avec le reste du pipeline).
      const resultat = await normaliserDao(buffer, mimeType, { maxPagesOcr: 5 });
      return { markdown: resultat.markdown, sourceOcr: resultat.sourceOcr };
    }

    if (mimeType === MIME_JPEG || mimeType === MIME_PNG) {
      const texte = await lireImageParClaude(buffer, mimeType);
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
