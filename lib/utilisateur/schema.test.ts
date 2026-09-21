import { describe, expect, it } from "vitest";
import { modifierProfilEntrepriseSchema } from "./schema";

describe("modifierProfilEntrepriseSchema", () => {
  it("rejette un nom vide", () => {
    const resultat = modifierProfilEntrepriseSchema.safeParse({
      nom: "",
      rccm: null,
      adresse: null,
      representantLegalNom: null,
      representantLegalQualite: null,
      idu: null,
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
    });
    expect(resultat.success).toBe(false);
  });
});
