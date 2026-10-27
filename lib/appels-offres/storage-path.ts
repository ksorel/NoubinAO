export function construireCheminStockageDao(
  entrepriseId: string,
  appelOffresId: string,
  nomFichierOriginal: string,
  index = 0,
): string {
  const nomNettoye = nomFichierOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entrepriseId}/appels-offres/${appelOffresId}-${index}-${nomNettoye}`;
}

export function construireCheminStockageExport(
  entrepriseId: string,
  appelOffresId: string,
): string {
  return `${entrepriseId}/appels-offres/exports/${appelOffresId}-dossier-reponse.docx`;
}

export function construireCheminStockageExportBpu(
  entrepriseId: string,
  appelOffresId: string,
): string {
  return `${entrepriseId}/appels-offres/exports/${appelOffresId}-bpu.xlsx`;
}

export function construireCheminStockageExportGoNoGo(
  entrepriseId: string,
  appelOffresId: string,
  extension: "docx" | "xlsx" | "pdf",
): string {
  return `${entrepriseId}/appels-offres/exports/${appelOffresId}-go-no-go.${extension}`;
}

export function construireCheminStockageModeleCv(
  entrepriseId: string,
  appelOffresId: string,
  nomFichierOriginal: string,
): string {
  const nomNettoye = nomFichierOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entrepriseId}/appels-offres/${appelOffresId}-modele-cv-${nomNettoye}`;
}

export function construireCheminStockageCvTransforme(
  entrepriseId: string,
  appelOffresId: string,
  documentId: string,
): string {
  return `${entrepriseId}/appels-offres/cv-transformes/${appelOffresId}-${documentId}.docx`;
}

export function construireCheminStockageNegociationGreAGre(
  entrepriseId: string,
  appelOffresId: string,
  tourId: string,
  type: "proforma" | "lettre-proposition-revisee",
): string {
  return `${entrepriseId}/appels-offres/negociation/${appelOffresId}-${tourId}-${type}.docx`;
}
