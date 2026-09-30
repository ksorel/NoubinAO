import { describe, expect, it } from "vitest";
import { construireFiltreSecteurs } from "./queries";

describe("construireFiltreSecteurs", () => {
  it("renvoie null pour un tableau vide", () => {
    expect(construireFiltreSecteurs([])).toBeNull();
  });

  it("construit le filtre pour un seul secteur valide", () => {
    expect(construireFiltreSecteurs(["btp"])).toBe(
      "secteur.in.(btp),secteur.is.null",
    );
  });

  it("joint correctement plusieurs secteurs valides", () => {
    expect(construireFiltreSecteurs(["btp", "environnement"])).toBe(
      "secteur.in.(btp,environnement),secteur.is.null",
    );
  });

  it("élimine une valeur hors référentiel mêlée à des valeurs valides", () => {
    expect(construireFiltreSecteurs(["btp", "agriculture"])).toBe(
      "secteur.in.(btp),secteur.is.null",
    );
  });

  it("renvoie null si toutes les valeurs sont hors référentiel", () => {
    expect(construireFiltreSecteurs(["agriculture", "commerce"])).toBeNull();
  });
});
