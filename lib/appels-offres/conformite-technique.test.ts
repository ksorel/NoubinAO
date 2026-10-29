import { describe, expect, it } from "vitest";
import { comparerSpecLine, produitKoSurAuMoinsUneLigne } from "./conformite-technique";
import type { LigneSpecification, SpecificationProduit } from "./types";

function ligne(overrides: Partial<LigneSpecification> = {}): LigneSpecification {
  return {
    id: "l1",
    article_dao_id: "a1",
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

function spec(overrides: Partial<SpecificationProduit> = {}): SpecificationProduit {
  return {
    id: "s1",
    produit_id: "p1",
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

describe("comparerSpecLine", () => {
  it("renvoie inconnu quand aucune spec produit ne correspond au libellé", () => {
    const resultat = comparerSpecLine(ligne(), [spec({ libelle: "Autre chose" })]);
    expect(resultat.statut).toBe("inconnu");
    expect(resultat.specificationProduit).toBeNull();
  });

  it("cas réel : pince 1000 A au lieu de 1500 A exigés (>=) - ko", () => {
    const resultat = comparerSpecLine(ligne({ valeur: "1500", unite: "A" }), [
      spec({ valeur: "1000", unite: "A" }),
    ]);
    expect(resultat.statut).toBe("ko");
  });

  it("1500 A proposé pour 1500 A exigés (>=) - ok", () => {
    const resultat = comparerSpecLine(ligne({ valeur: "1500", unite: "A" }), [
      spec({ valeur: "1500", unite: "A" }),
    ]);
    expect(resultat.statut).toBe("ok");
  });

  it("cas réel : débroussailleuse 20 V / 300 mm au lieu de 0,8 kW / 380 mm - conversion d'unité, ko", () => {
    const puissance = comparerSpecLine(
      ligne({ libelle: "Puissance", valeur: "0.8", unite: "kW" }),
      [spec({ libelle: "Puissance", valeur: "20", unite: "V" })],
    );
    // kW et V ne sont pas la même famille d'unité : inconnu, pas un faux ko.
    expect(puissance.statut).toBe("inconnu");

    const largeur = comparerSpecLine(ligne({ libelle: "Largeur", valeur: "380", unite: "mm" }), [
      spec({ libelle: "Largeur", valeur: "300", unite: "mm" }),
    ]);
    expect(largeur.statut).toBe("ko");
  });

  it("convertit entre unités d'une même famille (kW vs W)", () => {
    const resultat = comparerSpecLine(ligne({ valeur: "0.8", unite: "kW" }), [
      spec({ valeur: "900", unite: "W" }),
    ]);
    expect(resultat.statut).toBe("ok");
  });

  it("cas réel : caisse plastique au lieu de métallique (texte, operateur =) - ko", () => {
    const resultat = comparerSpecLine(
      ligne({ libelle: "Matériau", operateur: "=", valeur: "métallique", unite: null }),
      [spec({ libelle: "Matériau", valeur: "plastique", unite: null })],
    );
    expect(resultat.statut).toBe("ko");
  });

  it("operateur includes : vérifie une sous-chaîne, insensible à la casse", () => {
    const resultat = comparerSpecLine(
      ligne({ operateur: "includes", valeur: "IP65", unite: null }),
      [spec({ valeur: "Certifié ip65 / ip67", unite: null })],
    );
    expect(resultat.statut).toBe("ok");
  });

  it("compare les catégories ordinales (CAT) sans conversion numérique", () => {
    const resultat = comparerSpecLine(
      ligne({ libelle: "Catégorie", operateur: ">=", valeur: "III", unite: "CAT" }),
      [spec({ libelle: "Catégorie", valeur: "IV", unite: "CAT" })],
    );
    expect(resultat.statut).toBe("ok");
  });

  it("cas réel : variante interdite (tondeuse pour débroussailleuse) - libellé différent, inconnu", () => {
    const resultat = comparerSpecLine(ligne({ libelle: "Type d'équipement" }), [
      spec({ libelle: "Type de machine", valeur: "Tondeuse" }),
    ]);
    expect(resultat.statut).toBe("inconnu");
  });
});

describe("produitKoSurAuMoinsUneLigne", () => {
  const lignes = [
    ligne({ id: "l1", libelle: "Intensité", valeur: "1500", unite: "A" }),
    ligne({ id: "l2", libelle: "Largeur", valeur: "380", unite: "mm" }),
  ];
  const specsProduit = [
    spec({ id: "s1", libelle: "Intensité", valeur: "1000", unite: "A" }),
    spec({ id: "s2", libelle: "Largeur", valeur: "380", unite: "mm" }),
  ];

  it("détecte un produit ko sur au moins une ligne", () => {
    expect(produitKoSurAuMoinsUneLigne(lignes, specsProduit, {})).toBe(true);
  });

  it("ne détecte rien quand toutes les lignes sont ok", () => {
    const specsConformes = [
      spec({ id: "s1", libelle: "Intensité", valeur: "1500", unite: "A" }),
      spec({ id: "s2", libelle: "Largeur", valeur: "380", unite: "mm" }),
    ];
    expect(produitKoSurAuMoinsUneLigne(lignes, specsConformes, {})).toBe(false);
  });

  it("une dérogation forcée en ok retire la ligne du calcul", () => {
    expect(produitKoSurAuMoinsUneLigne(lignes, specsProduit, { l1: "ok" })).toBe(false);
  });
});
