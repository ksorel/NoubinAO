import { describe, expect, it } from "vitest";
import {
  calculerSectionB,
  noteMargeAuto,
  noteTresorerieAuto,
  calculerNoteTotale,
  calculerDecision,
  type MontantsGoNoGo,
} from "./go-no-go";

function montants(partiel: Partial<MontantsGoNoGo>): MontantsGoNoGo {
  return {
    montantMarcheEstime: null,
    coutTotalRealisation: null,
    prixDao: null,
    cautionSoumission: null,
    fraisPreparation: null,
    avancePourcentage: null,
    delaiPaiementJours: null,
    argentDisponibleBanque: null,
    ...partiel,
  };
}

describe("calculerSectionB", () => {
  it("reproduit l'exemple du xls (AO n°012/2026/MENA)", () => {
    const resultat = calculerSectionB(
      montants({
        montantMarcheEstime: 45_000_000,
        coutTotalRealisation: 36_000_000,
        prixDao: 100_000,
        cautionSoumission: 900_000,
        fraisPreparation: 150_000,
        avancePourcentage: 0.15,
        delaiPaiementJours: 120,
        argentDisponibleBanque: 12_000_000,
      }),
    );
    expect(resultat.coutPourRepondre).toBe(1_150_000);
    expect(resultat.beneficeEstime).toBe(9_000_000);
    expect(resultat.margeEstimee).toBeCloseTo(0.2, 5);
    expect(resultat.avanceRecue).toBe(6_750_000);
    expect(resultat.argentAAvancer).toBe(30_150_000);
    expect(resultat.couverture).toBeCloseTo(0.398009950248756, 10);
    expect(resultat.moisATenir).toBe(4);
  });

  it("montant du marché à 0 -> marge à 0 plutôt qu'une division par zéro", () => {
    const resultat = calculerSectionB(montants({ montantMarcheEstime: 0, coutTotalRealisation: 100 }));
    expect(resultat.margeEstimee).toBe(0);
  });

  it("champs tous vides -> tous les résultats à 0, couverture à 1 (rien à avancer)", () => {
    const resultat = calculerSectionB(montants({}));
    expect(resultat.coutPourRepondre).toBe(0);
    expect(resultat.beneficeEstime).toBe(0);
    expect(resultat.margeEstimee).toBe(0);
    expect(resultat.argentAAvancer).toBe(0);
    expect(resultat.couverture).toBe(1);
    expect(resultat.moisATenir).toBe(0);
  });

  it("argent à avancer ne descend jamais sous 0 (avance + caution négative évitée)", () => {
    const resultat = calculerSectionB(
      montants({ coutTotalRealisation: 1000, montantMarcheEstime: 10_000, avancePourcentage: 1, cautionSoumission: 0 }),
    );
    expect(resultat.argentAAvancer).toBe(0);
  });
});

describe("noteMargeAuto", () => {
  it("marge >= 25% -> 4", () => {
    expect(noteMargeAuto(0.3, 0.15)).toBe(4);
    expect(noteMargeAuto(0.25, 0.15)).toBe(4);
  });
  it("marge >= seuil mais < 25% -> 3", () => {
    expect(noteMargeAuto(0.2, 0.15)).toBe(3);
  });
  it("marge >= 10% mais < seuil -> 2", () => {
    expect(noteMargeAuto(0.12, 0.15)).toBe(2);
  });
  it("marge >= 5% mais < 10% -> 1", () => {
    expect(noteMargeAuto(0.07, 0.15)).toBe(1);
  });
  it("marge < 5% -> 0", () => {
    expect(noteMargeAuto(0.02, 0.15)).toBe(0);
  });
});

describe("noteTresorerieAuto", () => {
  it("couverture >= 100% -> 4", () => expect(noteTresorerieAuto(1)).toBe(4));
  it("couverture >= 75% mais < 100% -> 3", () => expect(noteTresorerieAuto(0.8)).toBe(3));
  it("couverture >= 50% mais < 75% -> 2", () => expect(noteTresorerieAuto(0.6)).toBe(2));
  it("couverture >= 30% mais < 50% -> 1", () => expect(noteTresorerieAuto(0.35)).toBe(1));
  it("couverture < 30% -> 0", () => expect(noteTresorerieAuto(0.1)).toBe(0));
});

describe("calculerNoteTotale", () => {
  it("additionne les 6 sous-notes", () => {
    expect(
      calculerNoteTotale({
        noteMarge: 3,
        noteTresorerie: 1,
        noteInteretStrategique: 4,
        noteClientPaie: 2,
        noteConcurrence: 1,
        noteRisques: 2,
      }),
    ).toBe(13);
  });
});

describe("calculerDecision", () => {
  const base = { nombreNon: 0, questionsNonRepondues: 0, champsVides: 0, noteTotale: 15, noteMinGo: 14 };

  it("un seul NON l'emporte sur tout le reste -> no_go", () => {
    expect(calculerDecision({ ...base, nombreNon: 1 })).toBe("no_go");
  });
  it("aucun NON mais questions non répondues -> a_completer", () => {
    expect(calculerDecision({ ...base, questionsNonRepondues: 2 })).toBe("a_completer");
  });
  it("aucun NON mais champs vides -> a_completer", () => {
    expect(calculerDecision({ ...base, champsVides: 1 })).toBe("a_completer");
  });
  it("tout rempli, note >= seuil -> go", () => {
    expect(calculerDecision({ ...base, noteTotale: 14 })).toBe("go");
  });
  it("tout rempli, note < seuil -> no_go", () => {
    expect(calculerDecision({ ...base, noteTotale: 13, noteMinGo: 14 })).toBe("no_go");
  });
});
