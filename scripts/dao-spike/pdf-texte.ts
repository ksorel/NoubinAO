import { PDFParse } from "pdf-parse";

export interface PageTexte {
  numero: number;
  texte: string;
}

// NOTE : le brief d'origine cible l'API pdf-parse v1 (fonction par défaut +
// option `pagerender`). La version installée (pdf-parse ^2.4.5, Task 1) expose
// une API différente : classe `PDFParse` avec `getText()` retournant déjà un
// texte par page (`{ num, text }`). Adapté ici pour préserver le contrat
// `PageTexte[]` / `extraireTexteParPage` consommé par les tâches suivantes.
export async function extraireTexteParPage(buffer: Buffer): Promise<PageTexte[]> {
  const parser = new PDFParse({ data: buffer });
  try {
    const resultat = await parser.getText();
    return resultat.pages.map((page) => ({ numero: page.num, texte: page.text }));
  } finally {
    await parser.destroy();
  }
}
