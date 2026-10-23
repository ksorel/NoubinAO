import type { ExigenceAo, LigneBpu } from "./types";
import type { Document } from "@/lib/documents/types";
import { compterLignesNonChiffrees } from "./bpu";

// Contrôle croisé (parcours expert v2, voir CLAUDE.md) : relit le dossier
// comme la commission, avant elle — catalogue de règles par famille
// (MNT/EXH/ENG/TEC/IDN/PER/SIG/DAT/VAL/SAI/FMT/CAN/PRC dans la spec), dont
// seule la famille EXH (exhaustivité) est construite pour l'instant : les
// autres dépendent d'une modélisation pas encore en place (ex. MNT compare
// des montants F4/DQE/F3 qui n'existent pas comme entités distinctes ici,
// SAI scanne le texte des pièces jointes).

export const SEVERITES_CONTROLE = ["bloquante", "avertissement", "info"] as const;
export type SeveriteControle = (typeof SEVERITES_CONTROLE)[number];

export interface ResultatControle {
  id: string;
  severite: SeveriteControle;
  ok: boolean;
  /** Nombre d'éléments concernés (0 si ok), pour un message type "2 lignes sans prix". */
  nombre: number;
}

export function calculerControleExhaustivite(
  exigences: ExigenceAo[],
  documentsParExigence: Record<string, Document[]>,
  lignesBpu: Pick<LigneBpu, "quantite" | "prix_unitaire">[],
): ResultatControle[] {
  const piecesRequises = exigences.filter((e) => e.type_exigence === "piece_requise");
  const piecesManquantes = piecesRequises.filter(
    (e) => (documentsParExigence[e.id] ?? []).length === 0,
  ).length;

  const lignesNonChiffrees = compterLignesNonChiffrees(lignesBpu);

  return [
    {
      id: "EXH-01",
      severite: "bloquante",
      ok: lignesNonChiffrees === 0,
      nombre: lignesNonChiffrees,
    },
    {
      id: "EXH-02",
      severite: "bloquante",
      ok: piecesManquantes === 0,
      nombre: piecesManquantes,
    },
  ];
}
