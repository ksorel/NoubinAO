import { describe, expect, it } from "vitest";
import { versValeurDatetimeLocal } from "./datetime-local";

describe("versValeurDatetimeLocal", () => {
  it("retourne une chaîne vide si la date est nulle", () => {
    expect(versValeurDatetimeLocal(null)).toBe("");
  });

  it("convertit une date ISO en valeur datetime-local", () => {
    expect(versValeurDatetimeLocal("2026-11-03T12:00:00.000Z")).toBe("2026-11-03T12:00");
  });

  it("tronque les secondes et millisecondes", () => {
    expect(versValeurDatetimeLocal("2026-11-03T12:30:45.123Z")).toBe("2026-11-03T12:30");
  });
});
