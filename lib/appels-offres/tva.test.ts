import { describe, expect, it } from "vitest";
import { calculerMontantAvecTva } from "./tva";

describe("calculerMontantAvecTva", () => {
  it("retourne null quand le régime fiscal n'est pas renseigné", () => {
    expect(calculerMontantAvecTva(1000000, null)).toBeNull();
  });

  it("applique un taux de 0 pour le régime TEE", () => {
    const resultat = calculerMontantAvecTva(1000000, "tee");
    expect(resultat).toEqual({
      montantHt: 1000000,
      tauxTva: 0,
      montantTva: 0,
      montantTtc: 1000000,
    });
  });

  it("applique le taux standard de 18% pour le régime RNI", () => {
    const resultat = calculerMontantAvecTva(1000000, "rni");
    expect(resultat).toEqual({
      montantHt: 1000000,
      tauxTva: 18,
      montantTva: 180000,
      montantTtc: 1180000,
    });
  });

  it("applique le taux standard de 18% pour le régime RSI", () => {
    const resultat = calculerMontantAvecTva(500000, "rsi");
    expect(resultat).toEqual({
      montantHt: 500000,
      tauxTva: 18,
      montantTva: 90000,
      montantTtc: 590000,
    });
  });

  it("gère un montant nul", () => {
    expect(calculerMontantAvecTva(0, "rni")).toEqual({
      montantHt: 0,
      tauxTva: 18,
      montantTva: 0,
      montantTtc: 0,
    });
  });
});
