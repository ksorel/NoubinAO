import { describe, expect, it } from "vitest";
import { normaliserDao } from "./normaliser";

describe("normaliserDao", () => {
  it("rejette un type de fichier non supporté", async () => {
    await expect(normaliserDao(Buffer.from(""), "text/plain")).rejects.toThrow(
      "Type de fichier non supporté pour un DAO : text/plain",
    );
  });
});
