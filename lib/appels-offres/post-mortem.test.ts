import { describe, expect, it } from "vitest";
import { calculerEcartPrixAttributaire } from "./post-mortem";

describe("calculerEcartPrixAttributaire", () => {
  it("renvoie un écart positif quand notre prix est plus élevé que l'attributaire", () => {
    const ecart = calculerEcartPrixAttributaire(11_000_000, 10_000_000);
    expect(ecart).toEqual({ ecartAbsolu: 1_000_000, ecartPourcentage: 10 });
  });

  it("renvoie un écart négatif quand notre prix est plus bas que l'attributaire", () => {
    const ecart = calculerEcartPrixAttributaire(9_000_000, 10_000_000);
    expect(ecart).toEqual({ ecartAbsolu: -1_000_000, ecartPourcentage: -10 });
  });

  it("renvoie null quand le prix de l'attributaire est à zéro", () => {
    expect(calculerEcartPrixAttributaire(1000, 0)).toBeNull();
  });

  it("renvoie un écart nul quand les deux prix sont identiques", () => {
    const ecart = calculerEcartPrixAttributaire(5000, 5000);
    expect(ecart).toEqual({ ecartAbsolu: 0, ecartPourcentage: 0 });
  });
});
