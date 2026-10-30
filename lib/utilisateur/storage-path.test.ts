import { describe, expect, it } from "vitest";
import {
  construireCheminStockageLogo,
  construireCheminStockageCachet,
  construireCheminStockageSignature,
} from "./storage-path";

describe("construireCheminStockageLogo", () => {
  it("préfixe le chemin par l'id entreprise et le segment logo", () => {
    expect(construireCheminStockageLogo("ent-1", "logo.png")).toBe("ent-1/logo/logo.png");
  });

  it("nettoie les caractères non sûrs du nom de fichier", () => {
    expect(construireCheminStockageLogo("ent-1", "Logo K-Nowledge (2026).png")).toBe(
      "ent-1/logo/Logo_K-Nowledge__2026_.png",
    );
  });
});

describe("construireCheminStockageCachet", () => {
  it("préfixe le chemin par l'id entreprise et le segment cachet", () => {
    expect(construireCheminStockageCachet("ent-1", "cachet.png")).toBe("ent-1/cachet/cachet.png");
  });

  it("nettoie les caractères non sûrs du nom de fichier", () => {
    expect(construireCheminStockageCachet("ent-1", "Cachet K-Nowledge (2026).png")).toBe(
      "ent-1/cachet/Cachet_K-Nowledge__2026_.png",
    );
  });
});

describe("construireCheminStockageSignature", () => {
  it("préfixe le chemin par l'id entreprise et le segment signature", () => {
    expect(construireCheminStockageSignature("ent-1", "signature.png")).toBe(
      "ent-1/signature/signature.png",
    );
  });

  it("nettoie les caractères non sûrs du nom de fichier", () => {
    expect(construireCheminStockageSignature("ent-1", "Signature Jean K. (2026).png")).toBe(
      "ent-1/signature/Signature_Jean_K.__2026_.png",
    );
  });
});
