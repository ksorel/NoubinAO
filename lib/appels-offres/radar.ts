import type { ExigenceAo, JalonRetroplanning } from "./types";
import type { Document } from "@/lib/documents/types";
import type { ResultatControle } from "./controle-croise";

// Radar du dossier (sprint S4, parcours expert v2 - voir CLAUDE.md) :
// "piloter à rebours depuis la date de dépôt". Calcul pur, aucune nouvelle
// colonne - tout provient de categorie_exigence (S2), documentsParExigence
// (module 4) et controle-croise.ts (S3), déjà en place.

export interface EtatPreparation {
  /** 0-100, pondéré ×2 pour une pièce requise éliminatoire. */
  preparationPct: number;
  eliminatoiresLevees: number;
  eliminatoiresTotal: number;
}

// Formule de la spec (Étape 1 Pipeline, reprise en Radar) : pièces requises
// présentes ÷ pièces requises, pondéré ×2 pour les éliminatoires. 100 %
// trivialement si aucune pièce requise (rien à préparer).
export function calculerEtatPreparation(
  exigences: ExigenceAo[],
  documentsParExigence: Record<string, Document[]>,
): EtatPreparation {
  const piecesRequises = exigences.filter((e) => e.type_exigence === "piece_requise");

  let numerateur = 0;
  let denominateur = 0;
  let eliminatoiresLevees = 0;
  let eliminatoiresTotal = 0;

  for (const piece of piecesRequises) {
    const poids = piece.categorie_exigence === "eliminatoire" ? 2 : 1;
    const fournie = (documentsParExigence[piece.id]?.length ?? 0) > 0;

    denominateur += poids;
    if (fournie) numerateur += poids;

    if (piece.categorie_exigence === "eliminatoire") {
      eliminatoiresTotal += 1;
      if (fournie) eliminatoiresLevees += 1;
    }
  }

  return {
    preparationPct: denominateur === 0 ? 100 : Math.round((numerateur / denominateur) * 100),
    eliminatoiresLevees,
    eliminatoiresTotal,
  };
}

export type TypeProchaineAction =
  | "eliminatoire_manquante"
  | "piece_perimee"
  | "controle_bloquant"
  | "jalon_en_retard";

export interface ProchaineAction {
  type: TypeProchaineAction;
  /** Nom de la pièce/du jalon concerné, ou id de règle ("EXH-02") pour controle_bloquant. */
  libelle: string;
}

// Un seul signal à la fois, dans l'ordre de priorité de la spec : un
// éliminatoire non levé prime sur tout, puis une pièce qui périmera avant
// le dépôt, puis n'importe quel contrôle bloquant (EXH-02 couvre déjà "pièce
// requise manquante" à ce palier - pas de second passage redondant), puis
// un jalon de rétroplanning en retard.
export function calculerProchaineAction(
  exigences: ExigenceAo[],
  documentsParExigence: Record<string, Document[]>,
  controleCroise: ResultatControle[],
  jalons: Pick<JalonRetroplanning, "libelle" | "date_cible" | "coche">[],
  maintenant: Date = new Date(),
): ProchaineAction | null {
  const eliminatoireManquante = exigences.find(
    (e) =>
      e.type_exigence === "piece_requise" &&
      e.categorie_exigence === "eliminatoire" &&
      (documentsParExigence[e.id]?.length ?? 0) === 0,
  );
  if (eliminatoireManquante) {
    return { type: "eliminatoire_manquante", libelle: eliminatoireManquante.libelle };
  }

  const pieceExpirera = controleCroise.find((r) => r.id === "VAL-01" && !r.ok);
  if (pieceExpirera) {
    return { type: "piece_perimee", libelle: pieceExpirera.id };
  }

  const controleBloquant = controleCroise.find((r) => r.severite === "bloquante" && !r.ok);
  if (controleBloquant) {
    return { type: "controle_bloquant", libelle: controleBloquant.id };
  }

  const jalonEnRetard = jalons.find((j) => !j.coche && new Date(j.date_cible) < maintenant);
  if (jalonEnRetard) {
    return { type: "jalon_en_retard", libelle: jalonEnRetard.libelle };
  }

  return null;
}
