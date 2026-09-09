import { describe, expect, it } from "vitest";
import { calculerStatutEcheance } from "./echeance";

describe("calculerStatutEcheance", () => {
  const aujourdhui = new Date("2026-08-22T00:00:00Z");

  it("retourne null si aucune date limite", () => {
    expect(calculerStatutEcheance(null, aujourdhui)).toBeNull();
  });

  it("retourne depassee si la date limite est déjà passée", () => {
    expect(calculerStatutEcheance("2026-08-01", aujourdhui)).toBe("depassee");
  });

  it("retourne rouge si la date limite est aujourd'hui", () => {
    expect(calculerStatutEcheance("2026-08-22", aujourdhui)).toBe("rouge");
  });

  it("retourne rouge si l'échéance est dans moins de 30 jours", () => {
    expect(calculerStatutEcheance("2026-09-01", aujourdhui)).toBe("rouge");
  });

  it("retourne orange si l'échéance est entre 30 et 90 jours", () => {
    expect(calculerStatutEcheance("2026-10-15", aujourdhui)).toBe("orange");
  });

  it("retourne vert si l'échéance est dans plus de 90 jours", () => {
    expect(calculerStatutEcheance("2027-06-01", aujourdhui)).toBe("vert");
  });

  it("retourne orange à exactement 30 jours", () => {
    expect(calculerStatutEcheance("2026-09-21", aujourdhui)).toBe("orange");
  });

  it("retourne vert à exactement 90 jours", () => {
    expect(calculerStatutEcheance("2026-11-20", aujourdhui)).toBe("vert");
  });
});
