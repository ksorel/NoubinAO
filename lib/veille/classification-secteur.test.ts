import { describe, expect, it } from "vitest";
import { classifierSecteur } from "./classification-secteur";

describe("classifierSecteur", () => {
  it("classe un avis de construction/bâtiment en btp", () => {
    const objet =
      "Travaux de construction d'un bâtiment de 03 salles de classes au Groupe Scolaire Sandégué";
    expect(classifierSecteur(objet)).toBe("btp");
  });

  it("classe un avis de bureau d'études en ingenierie", () => {
    const objet =
      "Recrutement d'un bureau d'études pour la supervision de travaux d'assainissement";
    expect(classifierSecteur(objet)).toBe("ingenierie");
  });

  it("classe un avis d'assainissement/déchets en environnement", () => {
    const objet = "Travaux d'assainissement et de gestion des déchets dans la commune";
    expect(classifierSecteur(objet)).toBe("environnement");
  });

  it("classe un avis d'électrification/solaire en energie_climat", () => {
    const objet =
      "Fourniture et installation d'un système d'électrification solaire pour l'éclairage public";
    expect(classifierSecteur(objet)).toBe("energie_climat");
  });

  it("renvoie null si aucun mot-clé ne matche", () => {
    const objet = "Fourniture de matériel de bureau pour l'administration";
    expect(classifierSecteur(objet)).toBeNull();
  });

  it("priorise le premier secteur du registre en cas de chevauchement", () => {
    // Contient à la fois un mot-clé btp ("construction") et un mot-clé
    // ingenierie ("étude") — btp est avant ingenierie dans le registre,
    // doit l'emporter.
    const objet = "Étude et construction d'un pont routier";
    expect(classifierSecteur(objet)).toBe("btp");
  });

  it("ignore la casse", () => {
    expect(classifierSecteur("TRAVAUX DE CONSTRUCTION D'UN BÂTIMENT")).toBe("btp");
  });
});
