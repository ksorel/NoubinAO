import { describe, expect, it } from "vitest";
import { messageErreurAuth } from "./messages-erreur";

describe("messageErreurAuth", () => {
  it("traduit les codes Supabase connus", () => {
    expect(messageErreurAuth({ code: "invalid_credentials" })).toBe(
      "Email ou mot de passe incorrect.",
    );
    expect(messageErreurAuth({ code: "user_already_exists" })).toBe(
      "Un compte existe déjà avec cet email.",
    );
  });

  it("retombe sur un message générique pour un code inconnu ou absent", () => {
    expect(messageErreurAuth({ code: "unexpected_failure" })).toBe(
      "Une erreur est survenue. Réessayez.",
    );
    expect(messageErreurAuth(new Error("network fetch failed"))).toBe(
      "Une erreur est survenue. Réessayez.",
    );
    expect(messageErreurAuth(null)).toBe("Une erreur est survenue. Réessayez.");
  });
});
