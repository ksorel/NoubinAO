import { describe, expect, it } from "vitest";
import { calculerVerdictGoNoGo } from "./go-no-go";

describe("calculerVerdictGoNoGo", () => {
  it("les 3 critères à oui -> go", () => {
    expect(calculerVerdictGoNoGo("oui", "oui", "oui")).toBe("go");
  });

  it("un seul critère à non, les 2 autres à oui -> no_go", () => {
    expect(calculerVerdictGoNoGo("non", "oui", "oui")).toBe("no_go");
    expect(calculerVerdictGoNoGo("oui", "non", "oui")).toBe("no_go");
    expect(calculerVerdictGoNoGo("oui", "oui", "non")).toBe("no_go");
  });

  it("un critère à non l'emporte même si les autres sont encore à évaluer -> no_go", () => {
    expect(calculerVerdictGoNoGo("non", "a_evaluer", "a_evaluer")).toBe("no_go");
  });

  it("les 3 critères à a_evaluer -> en_attente", () => {
    expect(calculerVerdictGoNoGo("a_evaluer", "a_evaluer", "a_evaluer")).toBe("en_attente");
  });

  it("un mélange oui/a_evaluer sans aucun non -> en_attente", () => {
    expect(calculerVerdictGoNoGo("oui", "a_evaluer", "oui")).toBe("en_attente");
  });
});
