import { describe, expect, it } from "vitest";
import {
  calculerScoreCorrespondance,
  extraireMotsCles,
  SEUIL_SUGGESTION_PERTINENTE,
} from "./correspondance";

describe("extraireMotsCles", () => {
  it("retire les mots vides et les mots courts", () => {
    expect(extraireMotsCles("Construction de deux salles de classe")).toEqual([
      "construction",
      "deux",
      "salles",
      "classe",
    ]);
  });

  it("retire la ponctuation et les nombres entre parenthèses", () => {
    expect(extraireMotsCles("SALLES (02) + BUREAU")).toEqual(["salles", "bureau"]);
  });

  it("retourne un tableau vide pour une chaîne ne contenant que des mots vides/courts", () => {
    expect(extraireMotsCles("de la à un")).toEqual([]);
  });
});

describe("calculerScoreCorrespondance", () => {
  const appelOffres = {
    titre: "CONSTRUCTION DE DEUX SALLES DE CLASSE A L'ECOLE YACE",
    acheteur: "Mairie de Dabou",
    date_limite: "2026-08-24T09:30:00Z",
  };

  it("retourne 0 sans aucune correspondance", () => {
    const email = {
      objet: "Facture électricité",
      contenu: "Merci de régler avant le 30.",
      expediteur: "cie@exemple.ci",
      recu_le: "2026-01-01T00:00:00Z",
    };
    expect(calculerScoreCorrespondance(email, appelOffres)).toBe(0);
  });

  it("ajoute des points si le nom de l'acheteur apparaît dans l'objet", () => {
    const email = {
      objet: "Réponse Mairie de Dabou",
      contenu: null,
      expediteur: null,
      recu_le: null,
    };
    expect(calculerScoreCorrespondance(email, appelOffres)).toBe(10);
  });

  it("est insensible à la casse pour l'acheteur", () => {
    const email = {
      objet: "réponse MAIRIE DE DABOU",
      contenu: null,
      expediteur: null,
      recu_le: null,
    };
    expect(calculerScoreCorrespondance(email, appelOffres)).toBe(10);
  });

  it("ajoute des points par mot-clé du titre trouvé", () => {
    const email = {
      objet: "Salles de classe - suite",
      contenu: null,
      expediteur: null,
      recu_le: null,
    };
    // "salles" et "classe" sont deux mots-clés du titre après extraireMotsCles
    expect(calculerScoreCorrespondance(email, appelOffres)).toBe(4);
  });

  it("ajoute des points si la date de réception est proche de la date limite", () => {
    const email = {
      objet: null,
      contenu: null,
      expediteur: null,
      recu_le: "2026-08-20T00:00:00Z",
    };
    expect(calculerScoreCorrespondance(email, appelOffres)).toBe(3);
  });

  it("n'ajoute pas de points si la date de réception est loin de la date limite", () => {
    const email = {
      objet: null,
      contenu: null,
      expediteur: null,
      recu_le: "2026-01-01T00:00:00Z",
    };
    expect(calculerScoreCorrespondance(email, appelOffres)).toBe(0);
  });

  it("cumule les trois signaux", () => {
    const email = {
      objet: "Mairie de Dabou - Salles de classe",
      contenu: null,
      expediteur: null,
      recu_le: "2026-08-20T00:00:00Z",
    };
    expect(calculerScoreCorrespondance(email, appelOffres)).toBe(10 + 4 + 3);
  });

  it("ne dépasse pas le seuil de pertinence quand seule la proximité de date matche", () => {
    // Signal faible seul (bonus de date = 3 points au maximum) : ne doit
    // jamais suffire, à lui seul, à qualifier une suggestion.
    const email = {
      objet: null,
      contenu: null,
      expediteur: null,
      recu_le: "2026-08-20T00:00:00Z",
    };
    const score = calculerScoreCorrespondance(email, appelOffres);
    expect(score).toBe(3);
    expect(score).toBeLessThanOrEqual(SEUIL_SUGGESTION_PERTINENTE);
  });

  it("dépasse le seuil de pertinence quand un signal textuel matche seul (acheteur)", () => {
    const email = {
      objet: "Réponse Mairie de Dabou",
      contenu: null,
      expediteur: null,
      recu_le: null,
    };
    const score = calculerScoreCorrespondance(email, appelOffres);
    expect(score).toBeGreaterThan(SEUIL_SUGGESTION_PERTINENTE);
  });

  it("dépasse le seuil de pertinence quand un signal textuel matche seul (mot-clé du titre)", () => {
    const email = {
      objet: "Salles de classe - suite",
      contenu: null,
      expediteur: null,
      recu_le: null,
    };
    const score = calculerScoreCorrespondance(email, appelOffres);
    expect(score).toBeGreaterThan(SEUIL_SUGGESTION_PERTINENTE);
  });
});
