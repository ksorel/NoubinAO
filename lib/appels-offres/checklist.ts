import type { ExigenceAo, SectionDossier } from "./types";
import type { Document } from "@/lib/documents/types";

export type CleItemAutomatique =
  | "pieces_manquantes"
  | "sections_en_brouillon"
  | "documents_expires";

export interface ItemChecklistAutomatique {
  cle: CleItemAutomatique;
  ok: boolean;
  /** Nombre d'éléments concernés (0 si ok), pour affichage type "2 pièces manquantes". */
  nombre: number;
}

export function calculerChecklistAutomatique(
  exigences: ExigenceAo[],
  documentsParExigence: Record<string, Document[]>,
  sections: SectionDossier[],
  documentsParSection: Record<string, Document[]>,
  maintenant: Date = new Date(),
): ItemChecklistAutomatique[] {
  const piecesRequises = exigences.filter((e) => e.type_exigence === "piece_requise");
  const piecesManquantes = piecesRequises.filter(
    (e) => (documentsParExigence[e.id] ?? []).length === 0,
  ).length;

  const sectionsEnBrouillon = sections.filter((s) => s.statut === "brouillon").length;

  const documentsUtilises = new Map<string, Document>();
  for (const docs of Object.values(documentsParExigence)) {
    for (const doc of docs) documentsUtilises.set(doc.id, doc);
  }
  for (const docs of Object.values(documentsParSection)) {
    for (const doc of docs) documentsUtilises.set(doc.id, doc);
  }
  const documentsExpires = Array.from(documentsUtilises.values()).filter(
    (doc) => doc.date_expiration !== null && new Date(doc.date_expiration) < maintenant,
  ).length;

  return [
    { cle: "pieces_manquantes", ok: piecesManquantes === 0, nombre: piecesManquantes },
    { cle: "sections_en_brouillon", ok: sectionsEnBrouillon === 0, nombre: sectionsEnBrouillon },
    { cle: "documents_expires", ok: documentsExpires === 0, nombre: documentsExpires },
  ];
}
