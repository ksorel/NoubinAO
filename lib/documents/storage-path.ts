export function construireCheminStockage(
  entrepriseId: string,
  documentId: string,
  nomFichierOriginal: string,
): string {
  const nomNettoye = nomFichierOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entrepriseId}/${documentId}-${nomNettoye}`;
}
