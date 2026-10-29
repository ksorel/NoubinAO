import type { Document } from "@/lib/documents/types";

export type SuggestionAdministrative = "oui" | "non";

function documentValide(document: Document): boolean {
  if (!document.date_expiration) return true;
  return new Date(document.date_expiration) >= new Date();
}

export function suggererReponseAgrement(documents: Document[]): SuggestionAdministrative {
  const agrements = documents.filter((d) => d.type === "agrement");
  if (agrements.length === 0) return "non";
  // "some" et pas "every" : un seul agrément valide suffit à répondre OUI à
  // "avons-nous l'agrément exigé" - contrairement aux attestations
  // ci-dessous où TOUTES les pièces demandées doivent être à jour.
  return agrements.some(documentValide) ? "oui" : "non";
}

export function suggererReponseAttestations(documents: Document[]): SuggestionAdministrative {
  const pieces = documents.filter((d) => d.type === "piece_administrative");
  if (pieces.length === 0) return "non";
  return pieces.every(documentValide) ? "oui" : "non";
}
