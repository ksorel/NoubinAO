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
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT);
    expect(jalons[4].dateCible).toBe("2026-01-30");
  });

  it("ne lève pas d'exception quand la date limite est très proche de maintenant", () => {
    const dateLimiteProche = new Date("2026-01-03T00:00:00.000Z"); // 2 jours après MAINTENANT
    expect(() => genererJalonsParDefaut(dateLimiteProche, MAINTENANT)).not.toThrow();
    expect(genererJalonsParDefaut(dateLimiteProche, MAINTENANT).length).toBe(5);
  });
});
