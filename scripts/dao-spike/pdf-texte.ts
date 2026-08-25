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
  // Garde symétrique à celle de `ocr.ts::rendreImagePage` (voir son
  // commentaire pour le mécanisme complet). `pdf-parse` embarque SA PROPRE
  // copie imbriquée de pdfjs-dist (v5.4.296, sous
  // node_modules/pdf-parse/node_modules/pdfjs-dist), distincte de la copie
  // top-level (v6.2.108) utilisée par `ocr.ts`. Les deux copies partagent
  // `globalThis.pdfjsWorker` : le premier "fake worker" pdfjs-dist chargé
  // dans le process gagne ce global partagé pour TOUTES les copies, sans
  // vérification de version (`#mainThreadWorkerMessageHandler` renvoie ce
  // qu'il trouve, sans comparer les versions).
  //
  // Aujourd'hui, `normaliserDao()` appelle toujours `extraireTexteParPage`
  // avant `rendreImagePage` pour un même DAO, et les DAO sont traités
  // séquentiellement — donc ce cas ne se produit pas en pratique. Mais si
  // cet ordre ou cette hypothèse de non-concurrence était un jour violé
  // (traitement parallèle de plusieurs DAO, ou appel OCR avant extraction
  // texte), la copie v5 imbriquée de pdf-parse hériterait silencieusement
  // du handler v6 laissé par `ocr.ts` et échouerait avec la même erreur
  // "API version does not match Worker version" (dans l'autre sens).
  //
  // Contrairement à `ocr.ts`, on n'a PAS besoin de fixer `workerSrc` ici :
  // la copie imbriquée de pdfjs-dist (v5.4.296) s'auto-configure déjà à
  // l'import (bloc d'initialisation statique de `PDFWorker`, spécifique à
  // Node : `GlobalWorkerOptions.workerSrc ||= "./pdf.worker.mjs"`), une
  // amélioration absente de la copie top-level v6.2.108. Vider le global
  // suffit donc à forcer la copie v5 à se réenregistrer proprement avec
  // SON PROPRE worker, quel que soit ce qui a tourné avant dans ce process.
  delete (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker;

  const parser = new PDFParse({ data: buffer });
  try {
    const resultat = await parser.getText();
    return resultat.pages.map((page) => ({ numero: page.num, texte: page.text }));
  } finally {
    await parser.destroy();
  }
}
