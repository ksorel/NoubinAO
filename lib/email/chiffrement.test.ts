import { describe, expect, it } from "vitest";
import { chiffrer, dechiffrer } from "./chiffrement";

// Clé de test fixe (32 octets aléatoires encodés en base64) — jamais la
// vraie clé de production, qui ne vit que dans .env.local et Vercel.
process.env.EMAIL_TOKEN_ENCRYPTION_KEY =
  "oEtDycWloZ7myD+XeC/Ip9ngJFHc1FyG+QGg+0J/Xc4=";

describe("chiffrer / dechiffrer", () => {
  it("dechiffre exactement ce qui a été chiffré", () => {
    const original = "ya29.a0AfH6SMC_exemple_refresh_token";
    expect(dechiffrer(chiffrer(original))).toBe(original);
  });

  it("produit une sortie différente à chaque appel (IV aléatoire)", () => {
    const original = "meme-texte";
    expect(chiffrer(original)).not.toBe(chiffrer(original));
  });

  it("lève une erreur explicite si la clé de chiffrement est absente", () => {
    const cleOriginale = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
    delete process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
    expect(() => chiffrer("x")).toThrow("EMAIL_TOKEN_ENCRYPTION_KEY manquante");
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY = cleOriginale;
  });
});
