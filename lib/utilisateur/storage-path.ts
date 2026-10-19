export function construireCheminStockageLogo(
  entrepriseId: string,
  nomFichierOriginal: string,
): string {
  const nomNettoye = nomFichierOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entrepriseId}/logo/${nomNettoye}`;
}
