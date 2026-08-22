import { describe, expect, it } from "vitest";
import { calculerStatutExpiration } from "./expiration";

describe("calculerStatutExpiration", () => {
  const aujourdhui = new Date("2026-08-22T00:00:00Z");

  it("retourne null si aucune date d'expiration", () => {
    expect(calculerStatutExpiration(null, aujourdhui)).toBeNull();
  });

  it("retourne rouge si déjà expiré", () => {
    expect(calculerStatutExpiration("2026-01-01", aujourdhui)).toBe("rouge");
  });

  it("retourne rouge si expire dans moins de 30 jours", () => {
    expect(calculerStatutExpiration("2026-09-01", aujourdhui)).toBe("rouge");
  });

  it("retourne orange si expire entre 30 et 90 jours", () => {
    expect(calculerStatutExpiration("2026-10-15", aujourdhui)).toBe("orange");
  });

  it("retourne vert si expire dans plus de 90 jours", () => {
    expect(calculerStatutExpiration("2027-06-01", aujourdhui)).toBe("vert");
  });

  it("retourne orange à exactement 30 jours", () => {
    expect(calculerStatutExpiration("2026-09-21", aujourdhui)).toBe("orange");
  });

  it("retourne rouge à 29 jours", () => {
    expect(calculerStatutExpiration("2026-09-20", aujourdhui)).toBe("rouge");
  });

  it("retourne vert à exactement 90 jours", () => {
    expect(calculerStatutExpiration("2026-11-20", aujourdhui)).toBe("vert");
  });

  it("retourne orange à 89 jours", () => {
    expect(calculerStatutExpiration("2026-11-19", aujourdhui)).toBe("orange");
  });
});
