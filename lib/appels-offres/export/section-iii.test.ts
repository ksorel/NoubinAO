import { describe, expect, it } from "vitest";
import { construirePlanSectionIII } from "./section-iii";
import type {
  ArticleDao,
  ArticleProduit,
  LigneSpecification,
  Produit,
  SpecificationProduit,
} from "../types";

const appelOffres = { titre: "Fourniture d'équipements", acheteur: "CI-ENERGIES", fichier_dao_nom_original: null };
const entreprise = {
  nom: "SARL Exemple",
  representant_legal_nom: "Jean Kouassi",
  representant_legal_qualite: "Gérant",
};

function article(overrides: Partial<ArticleDao> = {}): ArticleDao {
  return {
    id: "article-1",
    appel_offres_id: "ao-1",
    numero: "6.1",
    designation: "Pince ampèremétrique",
    unite: "u",
    quantite: 1,
    ligne_bpu_id: null,
    ordre: 0,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function ligne(overrides: Partial<LigneSpecification> = {}): LigneSpecification {
  return {
    id: "ligne-1",
    article_dao_id: "article-1",
    libelle: "Intensité nominale",
    operateur: ">=",
    valeur: "1500",
    unite: "A",
    source_section: null,
    ordre: 0,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function articleProduit(overrides: Partial<ArticleProduit> = {}): ArticleProduit {
  return {
    id: "ap-1",
    article_dao_id: "article-1",
    produit_id: "produit-1",
    retenu: true,
    justification_ko: null,
    ordre: 0,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function produit(overrides: Partial<Produit> = {}): Produit {
  return {
    id: "produit-1",
    entreprise_id: "ent-1",
    marque: "Fluke",
    modele: "376",
    reference: null,
    fiche_technique_path: null,
    fiche_technique_nom_original: null,
    autorisation_fabricant_path: null,
    autorisation_fabricant_nom_original: null,
    autorisation_valide_jusquau: null,
    certificat_etalonnage_path: null,
    certificat_etalonnage_nom_original: null,
    certificat_etalonnage_valide_jusquau: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function specProduit(overrides: Partial<SpecificationProduit> = {}): SpecificationProduit {
  return {
    id: "spec-1",
    produit_id: "produit-1",
    libelle: "Intensité nominale",
    valeur: "1500",
    unite: "A",
    source_section: null,
    ordre: 0,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("construirePlanSectionIII", () => {
  it("une ligne par article, avec les specs exigées formatées", () => {
    const plan = construirePlanSectionIII(
      appelOffres,
      entreprise,
      [article()],
      { "article-1": [ligne()] },
      { "article-1": [] },
      {},
      {},
      {},
    );

    expect(plan.lignes).toHaveLength(1);
    expect(plan.lignes[0].specsExigees).toEqual(["Intensité nominale >= 1500 A"]);
    expect(plan.lignes[0].produitRetenuLabel).toBeNull();
    expect(plan.lignes[0].specsProposees).toEqual(["-"]);
  });

  it("affiche la valeur proposée par le produit retenu quand elle est conforme", () => {
    const plan = construirePlanSectionIII(
      appelOffres,
      entreprise,
      [article()],
      { "article-1": [ligne()] },
      { "article-1": [articleProduit()] },
      { "produit-1": produit() },
      { "produit-1": [specProduit()] },
      {},
    );

    expect(plan.lignes[0].produitRetenuLabel).toBe("Fluke 376");
    expect(plan.lignes[0].specsProposees).toEqual(["1500 A"]);
  });

  it("annote la valeur proposée quand elle est non conforme", () => {
    const plan = construirePlanSectionIII(
      appelOffres,
      entreprise,
      [article()],
      { "article-1": [ligne({ valeur: "1500", unite: "A" })] },
      { "article-1": [articleProduit()] },
      { "produit-1": produit() },
      { "produit-1": [specProduit({ valeur: "1000", unite: "A" })] },
      {},
    );

    expect(plan.lignes[0].specsProposees).toEqual(["1000 A (ko)"]);
  });

  it("respecte une dérogation forcée dans l'annotation", () => {
    const plan = construirePlanSectionIII(
      appelOffres,
      entreprise,
      [article()],
      { "article-1": [ligne({ valeur: "1500", unite: "A" })] },
      { "article-1": [articleProduit()] },
      { "produit-1": produit() },
      { "produit-1": [specProduit({ valeur: "1000", unite: "A" })] },
      {
        "ligne-1:produit-1": {
          id: "cf-1",
          ligne_specification_id: "ligne-1",
          produit_id: "produit-1",
          statut: "ok",
          justification: "Vérifié manuellement",
          modifie_par: null,
          modifie_le: "2026-01-01T00:00:00Z",
        },
      },
    );

    expect(plan.lignes[0].specsProposees).toEqual(["1000 A"]);
  });
});
