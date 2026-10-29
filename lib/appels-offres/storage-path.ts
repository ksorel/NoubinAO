export function construireCheminStockageDao(
  entrepriseId: string,
  appelOffresId: string,
  nomFichierOriginal: string,
  index = 0,
): string {
  const nomNettoye = nomFichierOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entrepriseId}/appels-offres/${appelOffresId}-${index}-${nomNettoye}`;
}

// `extension` par défaut "docx" pour ne pas casser les appelants déjà
// existants (même raison que le défaut `pli: PliExport = null` dans
// construirePlanExport) - les boutons Word/Excel/PDF par onglet (Radar,
// Offre technique, Offre financière) passent désormais ce paramètre.
export function construireCheminStockageExport(
  entrepriseId: string,
  appelOffresId: string,
  extension: "docx" | "xlsx" | "pdf" = "docx",
): string {
  return `${entrepriseId}/appels-offres/exports/${appelOffresId}-dossier-reponse.${extension}`;
}

// Dossier scindé en 2 plis (sprint S8, voir TYPES_PLIS_AO) : un chemin par
// pli, distinct de construireCheminStockageExport (pli unique) ci-dessus.
export function construireCheminStockageExportPli(
  entrepriseId: string,
  appelOffresId: string,
  pli: "technique" | "financiere",
  extension: "docx" | "xlsx" | "pdf" = "docx",
): string {
  return `${entrepriseId}/appels-offres/exports/${appelOffresId}-dossier-reponse-${pli}.${extension}`;
}

export function construireCheminStockageExportSectionIII(
  entrepriseId: string,
  appelOffresId: string,
): string {
  return `${entrepriseId}/appels-offres/exports/${appelOffresId}-section-iii.docx`;
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

export function construireCheminStockagePieceProduit(
  entrepriseId: string,
  produitId: string,
  type: "fiche_technique" | "autorisation_fabricant" | "certificat_etalonnage",
  nomFichierOriginal: string,
): string {
  const nomNettoye = nomFichierOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entrepriseId}/produits/${produitId}-${type}-${nomNettoye}`;
}

export function construireCheminStockageDemandeAbe(
  entrepriseId: string,
  referenceId: string,
  type: "lettre" | "formulaire-f6",
): string {
  return `${entrepriseId}/references/${referenceId}-demande-abe-${type}.docx`;
}

export function construireCheminStockageNegociationGreAGre(
  entrepriseId: string,
  appelOffresId: string,
  tourId: string,
  type: "proforma" | "lettre-proposition-revisee",
): string {
  return `${entrepriseId}/appels-offres/negociation/${appelOffresId}-${tourId}-${type}.docx`;
}
