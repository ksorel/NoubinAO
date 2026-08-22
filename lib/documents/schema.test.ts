import { describe, expect, it } from "vitest";
import { documentUploadSchema } from "./schema";

function creerFichier(nom: string, type: string, tailleOctets: number): File {
  return new File([new Uint8Array(tailleOctets)], nom, { type });
}

describe("documentUploadSchema", () => {
  it("accepte une référence projet sans date d'expiration", () => {
    const resultat = documentUploadSchema.safeParse({
      type: "reference_projet",
      nom: "Référence - École ABC",
      dateExpiration: null,
      fichier: creerFichier("ref.pdf", "application/pdf", 1024),
    });
    expect(resultat.success).toBe(true);
  });

  it("refuse une pièce administrative sans date d'expiration", () => {
    const resultat = documentUploadSchema.safeParse({
      type: "piece_administrative",
      nom: "RCCM",
      dateExpiration: null,
      fichier: creerFichier("rccm.pdf", "application/pdf", 1024),
    });
    expect(resultat.success).toBe(false);
  });

  it("accepte une pièce administrative avec date d'expiration", () => {
    const resultat = documentUploadSchema.safeParse({
      type: "piece_administrative",
      nom: "RCCM",
      dateExpiration: "2027-01-01",
      fichier: creerFichier("rccm.pdf", "application/pdf", 1024),
    });
    expect(resultat.success).toBe(true);
  });

  it("refuse un fichier de plus de 10 Mo", () => {
    const resultat = documentUploadSchema.safeParse({
      type: "cv",
      nom: "CV Jean",
      dateExpiration: null,
      fichier: creerFichier("cv.pdf", "application/pdf", 11 * 1024 * 1024),
    });
    expect(resultat.success).toBe(false);
  });

  it("refuse un type MIME non accepté", () => {
    const resultat = documentUploadSchema.safeParse({
      type: "cv",
      nom: "CV Jean",
      dateExpiration: null,
      fichier: creerFichier("cv.exe", "application/x-msdownload", 1024),
    });
    expect(resultat.success).toBe(false);
  });

  it("refuse un nom vide", () => {
    const resultat = documentUploadSchema.safeParse({
      type: "cv",
      nom: "",
      dateExpiration: null,
      fichier: creerFichier("cv.pdf", "application/pdf", 1024),
    });
    expect(resultat.success).toBe(false);
  });
});
