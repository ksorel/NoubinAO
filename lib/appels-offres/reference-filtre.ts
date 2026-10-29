import type { ReferenceProjet } from "./types";

// Filtre automatique des références (sprint S7, parcours expert v2, voir
// CLAUDE.md, Étape 5.3) : période exigée (sur `date_fin`, comme la spec le
// précise - une référence qui s'est terminée hors de la période ne compte
// pas, même si elle a commencé avant), nature (tags), montant minimal.
// Un critère non renseigné sur l'AO ne filtre rien (pas de référence
// exclue par un critère absent).

export interface CriteresFiltreReference {
  periodeDebut: string | null;
  periodeFin: string | null;
  natureTags: string[];
  montantMinimal: number | null;
}

export function referenceCorrespondCriteres(
  reference: Pick<ReferenceProjet, "date_fin" | "nature_tags" | "montant">,
  criteres: CriteresFiltreReference,
): boolean {
  if (criteres.periodeDebut !== null || criteres.periodeFin !== null) {
    if (reference.date_fin === null) return false;
    const dateFin = new Date(reference.date_fin);
    if (criteres.periodeDebut !== null && dateFin < new Date(criteres.periodeDebut)) return false;
    if (criteres.periodeFin !== null && dateFin > new Date(criteres.periodeFin)) return false;
  }

  if (criteres.natureTags.length > 0) {
    const intersection = reference.nature_tags.some((tag) => criteres.natureTags.includes(tag));
    if (!intersection) return false;
  }

  if (criteres.montantMinimal !== null) {
    if (reference.montant === null || reference.montant < criteres.montantMinimal) return false;
  }

  return true;
}

export function filtrerReferences<T extends Pick<ReferenceProjet, "date_fin" | "nature_tags" | "montant">>(
  references: T[],
  criteres: CriteresFiltreReference,
): T[] {
  return references.filter((reference) => referenceCorrespondCriteres(reference, criteres));
}
