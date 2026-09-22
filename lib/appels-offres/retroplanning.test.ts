import { describe, expect, it } from "vitest";
import { genererJalonsParDefaut } from "./retroplanning";

describe("genererJalonsParDefaut", () => {
  const MAINTENANT = new Date("2026-01-01T00:00:00.000Z");
  const DATE_LIMITE = new Date("2026-01-31T00:00:00.000Z"); // 30 jours après MAINTENANT

  it("calcule les 5 jalons avec les dates exactes attendues", () => {
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT);

    expect(jalons).toEqual([
      { libelle: "Analyse du DAO et décision Go/No-Go", dateCible: "2026-01-04" },
      {
        libelle: "Constitution du dossier (pièces, mapping, rédaction)",
        dateCible: "2026-01-13",
      },
      { libelle: "Revue interne de l'offre", dateCible: "2026-01-20" },
      { libelle: "Relecture finale et vérifications", dateCible: "2026-01-26" },
      { libelle: "Dépôt du dossier", dateCible: "2026-01-30" },
    ]);
  });

  it("retourne exactement 5 jalons", () => {
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT);
    expect(jalons.length).toBe(5);
  });

  it("le dernier jalon (dépôt) est toujours la veille de la date limite, indépendamment des fractions", () => {
    const dateLimiteCourte = new Date("2026-01-11T00:00:00.000Z"); // 10 jours après MAINTENANT (au lieu des 30 jours du test 1)
    const jalons = genererJalonsParDefaut(dateLimiteCourte, MAINTENANT);
    expect(jalons[4].dateCible).toBe("2026-01-10");
  });

  it("ne lève pas d'exception quand la date limite est très proche de maintenant", () => {
    const dateLimiteProche = new Date("2026-01-03T00:00:00.000Z"); // 2 jours après MAINTENANT
    expect(() => genererJalonsParDefaut(dateLimiteProche, MAINTENANT)).not.toThrow();
    expect(genererJalonsParDefaut(dateLimiteProche, MAINTENANT).length).toBe(5);
  });
});

describe("genererJalonsParDefaut — jalon caution", () => {
  const MAINTENANT = new Date("2026-01-01T00:00:00.000Z");
  const DATE_LIMITE = new Date("2026-01-31T00:00:00.000Z"); // 30 jours après MAINTENANT

  it("ajoute le jalon caution en 2e position quand montantCaution est positif", () => {
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT, 5000000);

    expect(jalons).toEqual([
      { libelle: "Analyse du DAO et décision Go/No-Go", dateCible: "2026-01-04" },
      { libelle: "Obtenir la caution de soumission", dateCible: "2026-01-04" },
      {
        libelle: "Constitution du dossier (pièces, mapping, rédaction)",
        dateCible: "2026-01-13",
      },
      { libelle: "Revue interne de l'offre", dateCible: "2026-01-20" },
      { libelle: "Relecture finale et vérifications", dateCible: "2026-01-26" },
      { libelle: "Dépôt du dossier", dateCible: "2026-01-30" },
    ]);
  });

  it("retourne 6 jalons quand montantCaution est positif", () => {
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT, 5000000);
    expect(jalons.length).toBe(6);
  });

  it("n'ajoute aucun jalon caution quand montantCaution est null", () => {
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT, null);
    expect(jalons.length).toBe(5);
    expect(jalons.some((j) => j.libelle === "Obtenir la caution de soumission")).toBe(false);
  });

  it("n'ajoute aucun jalon caution quand montantCaution est undefined", () => {
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT, undefined);
    expect(jalons.length).toBe(5);
  });

  it("n'ajoute aucun jalon caution quand montantCaution vaut 0", () => {
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT, 0);
    expect(jalons.length).toBe(5);
  });

  it("n'ajoute aucun jalon caution en l'absence du 3e argument (rétrocompatibilité)", () => {
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT);
    expect(jalons.length).toBe(5);
  });
});
