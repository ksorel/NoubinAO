import { describe, expect, it } from "vitest";
import { construireLignesNotification } from "./notifications";

describe("construireLignesNotification", () => {
  it("notifie les utilisateurs d'une entreprise dont un secteur matche", () => {
    const avisNouveaux = [{ id: "avis-1", secteur: "btp" }];
    const entreprises = [{ id: "ent-1", secteursActivite: ["btp", "ingenierie"] }];
    const utilisateursParEntreprise = new Map([["ent-1", ["user-1", "user-2"]]]);

    const lignes = construireLignesNotification(avisNouveaux, entreprises, utilisateursParEntreprise);

    expect(lignes).toEqual(
      expect.arrayContaining([
        { utilisateur_id: "user-1", avis_id: "avis-1" },
        { utilisateur_id: "user-2", avis_id: "avis-1" },
      ]),
    );
    expect(lignes).toHaveLength(2);
  });

  it("ignore un avis non classé (secteur null)", () => {
    const avisNouveaux = [{ id: "avis-1", secteur: null }];
    const entreprises = [{ id: "ent-1", secteursActivite: ["btp"] }];
    const utilisateursParEntreprise = new Map([["ent-1", ["user-1"]]]);

    const lignes = construireLignesNotification(avisNouveaux, entreprises, utilisateursParEntreprise);

    expect(lignes).toHaveLength(0);
  });

  it("ignore une entreprise dont aucun secteur configuré ne matche", () => {
    const avisNouveaux = [{ id: "avis-1", secteur: "energie_climat" }];
    const entreprises = [{ id: "ent-1", secteursActivite: ["btp", "ingenierie"] }];
    const utilisateursParEntreprise = new Map([["ent-1", ["user-1"]]]);

    const lignes = construireLignesNotification(avisNouveaux, entreprises, utilisateursParEntreprise);

    expect(lignes).toHaveLength(0);
  });

  it("ignore une entreprise sans secteur configuré (0 sur 4)", () => {
    const avisNouveaux = [{ id: "avis-1", secteur: "btp" }];
    const entreprises = [{ id: "ent-1", secteursActivite: [] }];
    const utilisateursParEntreprise = new Map([["ent-1", ["user-1"]]]);

    const lignes = construireLignesNotification(avisNouveaux, entreprises, utilisateursParEntreprise);

    expect(lignes).toHaveLength(0);
  });

  it("fan-out sur plusieurs avis et plusieurs entreprises sans doublon croisé", () => {
    const avisNouveaux = [
      { id: "avis-1", secteur: "btp" },
      { id: "avis-2", secteur: "environnement" },
    ];
    const entreprises = [
      { id: "ent-1", secteursActivite: ["btp"] },
      { id: "ent-2", secteursActivite: ["environnement"] },
    ];
    const utilisateursParEntreprise = new Map([
      ["ent-1", ["user-1"]],
      ["ent-2", ["user-2"]],
    ]);

    const lignes = construireLignesNotification(avisNouveaux, entreprises, utilisateursParEntreprise);

    expect(lignes).toEqual(
      expect.arrayContaining([
        { utilisateur_id: "user-1", avis_id: "avis-1" },
        { utilisateur_id: "user-2", avis_id: "avis-2" },
      ]),
    );
    expect(lignes).toHaveLength(2);
  });
});
