import { describe, expect, it } from "vitest";
import { modifierProfilEntrepriseSchema } from "./schema";
import { creerInvitationSchema, rejoindreEntrepriseSchema } from "./schema";

describe("modifierProfilEntrepriseSchema", () => {
  it("rejette un nom vide", () => {
    const resultat = modifierProfilEntrepriseSchema.safeParse({
      nom: "",
      rccm: null,
      adresse: null,
      representantLegalNom: null,
      representantLegalQualite: null,
      idu: null,
      telephone: null,
      email: null,
      secteursActivite: [],
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un nom composé uniquement d'espaces", () => {
    const resultat = modifierProfilEntrepriseSchema.safeParse({
      nom: "   ",
      rccm: null,
      adresse: null,
      representantLegalNom: null,
      representantLegalQualite: null,
      idu: null,
      telephone: null,
      email: null,
      secteursActivite: [],
    });
    expect(resultat.success).toBe(false);
  });

  it("accepte un nom valide et normalise les champs optionnels vides en null", () => {
    const resultat = modifierProfilEntrepriseSchema.safeParse({
      nom: "  SARL Exemple  ",
      rccm: "   ",
      adresse: null,
      representantLegalNom: "  Jean Kouassi  ",
      representantLegalQualite: null,
      idu: null,
      telephone: null,
      email: null,
      secteursActivite: [],
    });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.nom).toBe("SARL Exemple");
      expect(resultat.data.rccm).toBeNull();
      expect(resultat.data.representantLegalNom).toBe("Jean Kouassi");
    }
  });

  it("rejette un nom de plus de 200 caractères", () => {
    const resultat = modifierProfilEntrepriseSchema.safeParse({
      nom: "a".repeat(201),
      rccm: null,
      adresse: null,
      representantLegalNom: null,
      representantLegalQualite: null,
      idu: null,
      telephone: null,
      email: null,
      secteursActivite: [],
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un secteur hors du référentiel fermé", () => {
    const resultat = modifierProfilEntrepriseSchema.safeParse({
      nom: "SARL Exemple",
      rccm: null,
      adresse: null,
      representantLegalNom: null,
      representantLegalQualite: null,
      idu: null,
      telephone: null,
      email: null,
      secteursActivite: ["agriculture"],
    });
    expect(resultat.success).toBe(false);
  });
});

describe("creerInvitationSchema", () => {
  it("accepte 'admin' et 'membre'", () => {
    expect(creerInvitationSchema.safeParse({ role: "admin" }).success).toBe(true);
    expect(creerInvitationSchema.safeParse({ role: "membre" }).success).toBe(true);
  });

  it("rejette un rôle hors de l'énumération", () => {
    expect(creerInvitationSchema.safeParse({ role: "super_admin" }).success).toBe(false);
  });
});

describe("rejoindreEntrepriseSchema", () => {
  it("rejette un token vide", () => {
    expect(
      rejoindreEntrepriseSchema.safeParse({ token: "", nom: "Jean Kouassi" }).success,
    ).toBe(false);
  });

  it("rejette un nom vide", () => {
    expect(
      rejoindreEntrepriseSchema.safeParse({ token: "abc123", nom: "" }).success,
    ).toBe(false);
  });

  it("accepte un token et un nom valides, et coupe les espaces du nom", () => {
    const resultat = rejoindreEntrepriseSchema.safeParse({
      token: "abc123",
      nom: "  Jean Kouassi  ",
    });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.nom).toBe("Jean Kouassi");
    }
  });
});
