import { describe, expect, it } from "vitest";
import { televerserDaoSchema, modifierAppelOffresSchema } from "./schema";
import { MIME_PDF, MIME_DOCX } from "./normalisation/normaliser";

function creerFichier(taille: number, type: string, nom = "dao.pdf"): File {
  return new File([new Uint8Array(taille)], nom, { type });
}

describe("televerserDaoSchema", () => {
  it("accepte un PDF de taille valide", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichier: creerFichier(1024, MIME_PDF),
    });
    expect(resultat.success).toBe(true);
  });

  it("accepte un DOCX de taille valide", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichier: creerFichier(1024, MIME_DOCX, "dao.docx"),
    });
    expect(resultat.success).toBe(true);
  });

  it("rejette un fichier de plus de 20 Mo", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichier: creerFichier(21 * 1024 * 1024, MIME_PDF),
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un fichier vide", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichier: creerFichier(0, MIME_PDF),
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un type MIME non supporté", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichier: creerFichier(1024, "image/png"),
    });
    expect(resultat.success).toBe(false);
  });
});

function champsBase(montantCaution: string | null) {
  return { titre: null, acheteur: null, secteur: null, dateLimite: null, montantCaution };
}

describe("modifierAppelOffresSchema.montantCaution", () => {
  it("accepte un montant entier positif", () => {
    const resultat = modifierAppelOffresSchema.safeParse(champsBase("545000"));
    expect(resultat.success).toBe(true);
    if (resultat.success) expect(resultat.data.montantCaution).toBe(545000);
  });

  it("accepte une chaîne vide ou null comme absence de montant", () => {
    expect(modifierAppelOffresSchema.safeParse(champsBase(null)).success).toBe(true);
    expect(modifierAppelOffresSchema.safeParse(champsBase("")).success).toBe(true);
  });

  it("rejette un montant négatif", () => {
    // Number.isFinite(-500) est vrai : sans vérification du format de la
    // chaîne source, un montant négatif passait silencieusement.
    const resultat = modifierAppelOffresSchema.safeParse(champsBase("-500"));
    expect(resultat.success).toBe(false);
  });

  it("rejette la notation scientifique", () => {
    // "1e10" et "10000000000" donnent le même nombre fini une fois
    // convertis par Number() — seule la chaîne source permet de les
    // distinguer.
    const resultat = modifierAppelOffresSchema.safeParse(champsBase("1e10"));
    expect(resultat.success).toBe(false);
  });

  it("rejette un texte non numérique", () => {
    const resultat = modifierAppelOffresSchema.safeParse(champsBase("abc"));
    expect(resultat.success).toBe(false);
  });
});
