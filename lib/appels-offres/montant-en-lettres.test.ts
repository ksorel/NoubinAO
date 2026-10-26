import { describe, expect, it } from "vitest";
import { montantEnLettres, nombreEnLettres } from "./montant-en-lettres";

describe("nombreEnLettres", () => {
  it.each([
    [0, "zéro"],
    [1, "un"],
    [10, "dix"],
    [11, "onze"],
    [15, "quinze"],
    [16, "seize"],
    [17, "dix-sept"],
    [19, "dix-neuf"],
    [20, "vingt"],
    [21, "vingt et un"],
    [22, "vingt-deux"],
    [30, "trente"],
    [31, "trente et un"],
    [69, "soixante-neuf"],
    [70, "soixante-dix"],
    [71, "soixante et onze"],
    [75, "soixante-quinze"],
    [79, "soixante-dix-neuf"],
    [80, "quatre-vingts"],
    [81, "quatre-vingt-un"],
    [89, "quatre-vingt-neuf"],
    [90, "quatre-vingt-dix"],
    [91, "quatre-vingt-onze"],
    [99, "quatre-vingt-dix-neuf"],
    [100, "cent"],
    [101, "cent un"],
    [110, "cent dix"],
    [171, "cent soixante et onze"],
    [180, "cent quatre-vingts"],
    [181, "cent quatre-vingt-un"],
    [200, "deux cents"],
    [201, "deux cent un"],
    [280, "deux cent quatre-vingts"],
    [300, "trois cents"],
    [999, "neuf cent quatre-vingt-dix-neuf"],
    [1000, "mille"],
    [1001, "mille un"],
    [1080, "mille quatre-vingts"],
    [2000, "deux mille"],
    [2001, "deux mille un"],
    [21000, "vingt et un mille"],
    [80000, "quatre-vingt mille"],
    [200000, "deux cent mille"],
    [200001, "deux cent mille un"],
    [280000, "deux cent quatre-vingt mille"],
    [1000000, "un million"],
    [2000000, "deux millions"],
    [21000000, "vingt et un millions"],
    [80000000, "quatre-vingts millions"],
    [200000000, "deux cents millions"],
    [1000000000, "un milliard"],
    [2000000000, "deux milliards"],
    [1234567, "un million deux cent trente-quatre mille cinq cent soixante-sept"],
    [
      123456789,
      "cent vingt-trois millions quatre cent cinquante-six mille sept cent quatre-vingt-neuf",
    ],
  ])("convertit %i en %s", (n, attendu) => {
    expect(nombreEnLettres(n)).toBe(attendu);
  });
});

describe("montantEnLettres", () => {
  it("ajoute la devise et met en majuscule la première lettre", () => {
    expect(montantEnLettres(15000000)).toBe("Quinze millions francs CFA");
  });

  it("accepte une devise personnalisée", () => {
    expect(montantEnLettres(1000, "euros")).toBe("Mille euros");
  });

  it("arrondit un montant décimal", () => {
    expect(montantEnLettres(1999.6)).toBe("Deux mille francs CFA");
  });

  it("traite une valeur négative comme sa valeur absolue", () => {
    expect(montantEnLettres(-500)).toBe("Cinq cents francs CFA");
  });

  it("gère zéro", () => {
    expect(montantEnLettres(0)).toBe("Zéro francs CFA");
  });
});
