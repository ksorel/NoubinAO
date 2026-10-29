function construireCheminStockageImage(
  dossier: "logo" | "cachet" | "signature",
  entrepriseId: string,
  nomFichierOriginal: string,
): string {
  const nomNettoye = nomFichierOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entrepriseId}/${dossier}/${nomNettoye}`;
}

export function construireCheminStockageLogo(
  entrepriseId: string,
  nomFichierOriginal: string,
): string {
  return construireCheminStockageImage("logo", entrepriseId, nomFichierOriginal);
}

export function construireCheminStockageCachet(
  entrepriseId: string,
  nomFichierOriginal: string,
): string {
  return construireCheminStockageImage("cachet", entrepriseId, nomFichierOriginal);
}

export function construireCheminStockageSignature(
  entrepriseId: string,
  nomFichierOriginal: string,
): string {
  return construireCheminStockageImage("signature", entrepriseId, nomFichierOriginal);
}
