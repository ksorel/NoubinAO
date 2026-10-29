import { describe, expect, it } from "vitest";
import { calculerIndicateursChiffrage, calculerPositionFourchette } from "./indicateurs-chiffrage";
import type { LigneBpu } from "./types";

function ligne(overrides: Partial<LigneBpu> = {}): LigneBpu {
  return {
    id: "l1",
    section_bpu_id: "s1",
    code_article: null,
    designation: "Article",
    unite: "u",
    quantite: 1,
    prix_unitaire: null,
    debourse_sec: null,
    taux_frais_structure: null,
    ordre: 0,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("calculerIndicateursChiffrage", () => {
  it("calcule le total HT et ignore la TVA quand le régime fiscal est inconnu", () => {
    const resultat = calculerIndicateursChiffrage(
      [ligne({ quantite: 2, prix_unitaire: 500000 })],
      null,
      null,
      null,
      null,
    );
    expect(resultat.totalHt).toBe(1000000);
    expect(resultat.tva).toBeNull();
  });

  it("calcule la TVA quand le régime fiscal est connu", () => {
    const resultat = calculerIndicateursChiffrage(
      [ligne({ quantite: 1, prix_unitaire: 1000000 })],
      "rni",
      null,
      null,
      null,
    );
    expect(resultat.tva).toEqual({
      montantHt: 1000000,
      tauxTva: 18,
      montantTva: 180000,
      montantTtc: 1180000,
    });
  });

  it("calcule coût de revient et marge brute depuis les lignes avec données de coût", () => {
    const resultat = calculerIndicateursChiffrage(
      [
        ligne({
          quantite: 2,
          prix_unitaire: 1000,
          debourse_sec: 600,
          taux_frais_structure: 10, // frais de structure = 60/unité
        }),
      ],
      null,
      null,
      null,
      null,
    );
    // coût de revient / unité = 600 + 60 = 660 ; marge / unité = 1000 - 660 = 340
    expect(resultat.coutDeRevient).toBe(1320);
    expect(resultat.margeBrute).toBe(680);
    expect(resultat.margeBrutePourcentage).toBeCloseTo(34, 5);
  });

  it("ignore les lignes sans donnée de coût dans le coût de revient et la marge", () => {
    const resultat = calculerIndicateursChiffrage(
      [
        ligne({ quantite: 1, prix_unitaire: 1000, debourse_sec: 700 }),
        ligne({ id: "l2", quantite: 1, prix_unitaire: 500, debourse_sec: null }),
      ],
      null,
      null,
      null,
      null,
    );
    expect(resultat.totalHt).toBe(1500);
    expect(resultat.coutDeRevient).toBe(700);
    expect(resultat.margeBrute).toBe(300);
  });

  it("retourne une position null quand la fourchette ou le montant estimatif manque", () => {
    const lignes = [ligne({ quantite: 1, prix_unitaire: 1000000 })];
    expect(calculerIndicateursChiffrage(lignes, null, 80, 110, null).positionFourchette).toBeNull();
    expect(calculerIndicateursChiffrage(lignes, null, null, null, 1000000).positionFourchette).toBeNull();
  });

  it("signale une offre dans la fourchette normale", () => {
    const resultat = calculerIndicateursChiffrage(
      [ligne({ quantite: 1, prix_unitaire: 950000 })],
      null,
      80,
      110,
      1000000,
    );
    expect(resultat.positionFourchette).toEqual({
      pourcentageDuMontantEstimatif: 95,
      statut: "normale",
    });
  });

  it("signale une offre anormalement basse", () => {
    const resultat = calculerIndicateursChiffrage(
      [ligne({ quantite: 1, prix_unitaire: 700000 })],
      null,
      80,
      110,
      1000000,
    );
    expect(resultat.positionFourchette).toEqual({
      pourcentageDuMontantEstimatif: 70,
      statut: "basse",
    });
  });

  it("signale une offre anormalement haute", () => {
    const resultat = calculerIndicateursChiffrage(
      [ligne({ quantite: 1, prix_unitaire: 1200000 })],
      null,
      80,
      110,
      1000000,
    );
    expect(resultat.positionFourchette).toEqual({
      pourcentageDuMontantEstimatif: 120,
      statut: "haute",
    });
  });

  it("ne signale aucun plancher quand margePlancherPct n'est pas paramétré", () => {
    const resultat = calculerIndicateursChiffrage(
      [ligne({ quantite: 1, prix_unitaire: 1000, debourse_sec: 900 })],
      null,
      null,
      null,
      null,
    );
    expect(resultat.sousMargePlancher).toBe(false);
  });

  it("signale une marge globale sous le plancher paramétré (gré à gré)", () => {
    const resultat = calculerIndicateursChiffrage(
      // marge = 10%
      [ligne({ quantite: 1, prix_unitaire: 1000, debourse_sec: 900 })],
      null,
      null,
      null,
      null,
      15,
    );
    expect(resultat.sousMargePlancher).toBe(true);
  });

  it("ne signale pas de plancher franchi quand la marge globale l'atteint", () => {
    const resultat = calculerIndicateursChiffrage(
      [ligne({ quantite: 1, prix_unitaire: 1000, debourse_sec: 900 })],
      null,
      null,
      null,
      null,
      10,
    );
    expect(resultat.sousMargePlancher).toBe(false);
  });

  it("ne signale aucun plancher sans aucune ligne chiffrée", () => {
    const resultat = calculerIndicateursChiffrage([], null, null, null, null, 15);
    expect(resultat.sousMargePlancher).toBe(false);
  });
});

// Étape 9 "Après dépôt" (post-mortem.ts) réutilise cette fonction pour
// situer le prix de l'attributaire - même formule que positionFourchette
// ci-dessus, testée directement ici une fois pour ne pas la dupliquer via
// calculerIndicateursChiffrage dans post-mortem.test.ts.
describe("calculerPositionFourchette", () => {
  it("renvoie null quand la fourchette ou le montant estimatif manque", () => {
    expect(calculerPositionFourchette(950000, 80, 110, null)).toBeNull();
    expect(calculerPositionFourchette(950000, null, null, 1000000)).toBeNull();
  });

  it("situe un montant dans la fourchette normale", () => {
    expect(calculerPositionFourchette(950000, 80, 110, 1000000)).toEqual({
      pourcentageDuMontantEstimatif: 95,
      statut: "normale",
    });
  });

  it("situe un montant anormalement bas", () => {
    expect(calculerPositionFourchette(700000, 80, 110, 1000000)).toEqual({
      pourcentageDuMontantEstimatif: 70,
      statut: "basse",
    });
  });
});
