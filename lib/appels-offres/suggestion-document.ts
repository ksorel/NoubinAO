import type { TypeDocument } from "@/lib/documents/types";

export function deviserTypeDocumentPrefere(libelle: string): TypeDocument {
  const l = libelle.toLowerCase();
  if (l.includes("cv")) return "cv";
  if (
    l.includes("référence") ||
    l.includes("reference") ||
    l.includes("projet similaire")
  ) {
    return "reference_projet";
  }
  if (l.includes("agrément") || l.includes("agrement")) return "agrement";
  return "piece_administrative";
}
