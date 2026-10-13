import { describe, expect, it } from "vitest";
import { SyntheseGoNoGoExtraiteSchema } from "./schema";

describe("SyntheseGoNoGoExtraiteSchema", () => {
  it("valide un tableau de réponses complet", () => {
    const resultat = SyntheseGoNoGoExtraiteSchema.parse({
      reponses: [
        {
          cle: "facteurs_eliminatoires",
          reponse: "RCCM manquant entraîne le rejet.",
          source_section: "DPAO",
        },
        {
          cle: "personnel_qualifie",
          reponse: "Non précisé dans le DAO.",
          source_section: null,
        },
      ],
    });

    expect(resultat.reponses).toHaveLength(2);
    expect(resultat.reponses[0].cle).toBe("facteurs_eliminatoires");
  });

  it("rejette une clé hors énumération", () => {
    expect(() =>
      SyntheseGoNoGoExtraiteSchema.parse({
        reponses: [{ cle: "invalide", reponse: "x", source_section: null }],
      }),
    ).toThrow();
  });

  it("accepte un tableau vide", () => {
    const resultat = SyntheseGoNoGoExtraiteSchema.parse({ reponses: [] });
    expect(resultat.reponses).toHaveLength(0);
  });
});
