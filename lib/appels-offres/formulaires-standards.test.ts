import { describe, expect, it } from "vitest";
import {
  identifierFormulaireStandard,
  genererLettreSoumission,
  genererDeclarationHonneur,
  genererPouvoirHabilitant,
} from "./formulaires-standards";
import type { Entreprise } from "@/lib/utilisateur/types";
import type { AppelOffres } from "./types";

describe("identifierFormulaireStandard", () => {
  it("reconnaît une lettre de soumission", () => {
    expect(identifierFormulaireStandard("Lettre de soumission de l'offre")).toBe(
      "lettre_soumission",
    );
  });

  it("reconnaît une déclaration sur l'honneur (avec accent)", () => {
    expect(identifierFormulaireStandard("Formulaire de déclaration sur l'honneur")).toBe(
      "declaration_honneur",
    );
  });

  it("reconnaît une déclaration sur l'honneur (sans accent)", () => {
    expect(identifierFormulaireStandard("Declaration sur l'honneur du soumissionnaire")).toBe(
      "declaration_honneur",
    );
  });

  it("reconnaît un pouvoir habilitant", () => {
    expect(identifierFormulaireStandard("Pouvoir habilitant du soumissionnaire")).toBe(
      "pouvoir_habilitant",
    );
  });

  it("est insensible à la casse", () => {
    expect(identifierFormulaireStandard("LETTRE DE SOUMISSION")).toBe("lettre_soumission");
  });

  it("retourne null pour un libellé sans correspondance", () => {
    expect(identifierFormulaireStandard("Attestation de régularité fiscale")).toBeNull();
  });
});

const entrepriseComplete: Entreprise = {
  id: "e1",
  nom: "SARL Exemple",
  rccm: "CI-ABJ-2020-B-1234",
  adresse: "Cocody, Abidjan",
  representant_legal_nom: "Jean Kouassi",
  representant_legal_qualite: "Directeur Général",
  idu: "1234567A",
  taux_frais_structure_defaut: null,
  created_at: "2026-01-01T00:00:00Z",
};

const entrepriseVide: Entreprise = {
  id: "e2",
  nom: "SARL Vide",
  rccm: null,
  adresse: null,
  representant_legal_nom: null,
  representant_legal_qualite: null,
  idu: null,
  taux_frais_structure_defaut: null,
  created_at: "2026-01-01T00:00:00Z",
};

const appelOffres = {
  id: "ao1",
  titre: "Construction d'un pont",
  acheteur: "Ministère des Infrastructures",
} as AppelOffres;

describe("genererLettreSoumission", () => {
  it("ne contient aucun [à compléter] avec une entreprise entièrement renseignée et un montant", () => {
    const texte = genererLettreSoumission(entrepriseComplete, appelOffres, 15000000, 0);
    expect(texte).not.toContain("[à compléter]");
    expect(texte).toContain("15 000 000 FCFA");
  });

  it("remplace chaque champ manquant, jamais une chaîne vide", () => {
    const texte = genererLettreSoumission(entrepriseVide, appelOffres, null, 0);
    expect(texte).toContain("[à compléter]");
    expect(texte).toContain("[montant à compléter]");
  });

  it("affiche [montant à compléter] quand le BPU n'est pas chiffré (0)", () => {
    const texte = genererLettreSoumission(entrepriseComplete, appelOffres, 0, 0);
    expect(texte).toContain("[montant à compléter]");
    expect(texte).not.toContain("0 FCFA");
  });

  it("affiche le nombre de lignes non chiffrées quand le BPU est partiellement chiffré", () => {
    const texte = genererLettreSoumission(entrepriseComplete, appelOffres, 9000000, 3);
    expect(texte).toContain("[montant à compléter — 3 ligne(s) du BPU non chiffrée(s)]");
    expect(texte).not.toContain("9 000 000");
  });
});

describe("genererDeclarationHonneur", () => {
  it("ne contient aucun [à compléter] avec une entreprise entièrement renseignée", () => {
    const texte = genererDeclarationHonneur(entrepriseComplete, appelOffres);
    expect(texte).not.toContain("[à compléter]");
  });

  it("remplace chaque champ manquant", () => {
    const texte = genererDeclarationHonneur(entrepriseVide, appelOffres);
    expect(texte).toContain("[à compléter]");
  });
});

describe("genererPouvoirHabilitant", () => {
  it("ne contient aucun [à compléter] pour les champs entreprise avec une entreprise entièrement renseignée", () => {
    const texte = genererPouvoirHabilitant(entrepriseComplete, appelOffres);
    expect(texte).toContain(entrepriseComplete.nom);
    expect(texte).toContain(entrepriseComplete.rccm as string);
  });

  it("remplace chaque champ manquant", () => {
    const texte = genererPouvoirHabilitant(entrepriseVide, appelOffres);
    expect(texte).toContain("[à compléter]");
  });
});
