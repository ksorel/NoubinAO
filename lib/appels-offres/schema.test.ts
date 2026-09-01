import { describe, expect, it } from "vitest";
import { televerserDaoSchema } from "./schema";
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
