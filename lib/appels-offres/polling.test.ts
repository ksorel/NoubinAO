import { describe, expect, it } from "vitest";
import { tousLesAoStabilises } from "./polling";
import type { AppelOffres, StatutTraitementAo } from "./types";

function creerAppelOffres(statutTraitement: StatutTraitementAo): AppelOffres {
  return {
    id: "ao-1",
    entreprise_id: "ent-1",
    titre: null,
    acheteur: null,
    secteur: null,
    date_limite: null,
    montant_caution: null,
    statut_pipeline: "identifie",
    statut_traitement: statutTraitement,
    erreur_traitement: null,
    fichier_dao_path: "ent-1/appels-offres/ao-1-dao.pdf",
    fichier_dao_nom_original: "dao.pdf",
    dao_markdown: null,
    sommaire_attendu: null,
    created_by: "user-1",
    created_at: "2026-09-01T00:00:00.000Z",
  };
}

describe("tousLesAoStabilises", () => {
  it("retourne true pour une liste vide", () => {
    expect(tousLesAoStabilises([])).toBe(true);
  });

  it("retourne false si au moins un AO est en_attente", () => {
    expect(tousLesAoStabilises([creerAppelOffres("en_attente")])).toBe(false);
  });

  it("retourne false si au moins un AO est en normalisation", () => {
    expect(
      tousLesAoStabilises([creerAppelOffres("normalisation"), creerAppelOffres("termine")]),
    ).toBe(false);
  });

  it("retourne false si au moins un AO est en extraction", () => {
    expect(tousLesAoStabilises([creerAppelOffres("extraction")])).toBe(false);
  });

  it("retourne true si tous les AO sont termine ou erreur", () => {
    expect(
      tousLesAoStabilises([creerAppelOffres("termine"), creerAppelOffres("erreur")]),
    ).toBe(true);
  });
});
