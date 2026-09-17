export interface PageTexte {
  numero: number;
  texte: string;
  // true quand le texte de cette page a été obtenu via l'OCR de repli
  // (lireImageParClaude) plutôt que par extraction directe pdfjs-dist —
  // voir extrairePagesPdf (pdf.ts).
  ocr: boolean;
}
