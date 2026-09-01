import { describe, expect, it } from "vitest";
import { obtenirConfigStatutTraitement } from "./statut-traitement";

describe("obtenirConfigStatutTraitement", () => {
  it("retourne la config pour en_attente", () => {
    expect(obtenirConfigStatutTraitement("en_attente")).toEqual({
      couleur: "identifie",
      icone: "horloge",
      cleLibelle: "badge.enAttente",
    });
  });

  it("retourne la config pour normalisation", () => {
    expect(obtenirConfigStatutTraitement("normalisation")).toEqual({
      couleur: "preparation",
      icone: "chargement",
      cleLibelle: "badge.normalisationEnCours",
    });
  });

  it("retourne la config pour extraction", () => {
    expect(obtenirConfigStatutTraitement("extraction")).toEqual({
      couleur: "preparation",
      icone: "chargement",
      cleLibelle: "badge.extractionEnCours",
    });
  });

  it("retourne la config pour termine", () => {
    expect(obtenirConfigStatutTraitement("termine")).toEqual({
      couleur: "gagne",
      icone: "coche",
      cleLibelle: "badge.termine",
    });
  });

  it("retourne la config pour erreur", () => {
    expect(obtenirConfigStatutTraitement("erreur")).toEqual({
      couleur: "perdu",
      icone: "alerte",
      cleLibelle: "badge.erreur",
    });
  });
});
