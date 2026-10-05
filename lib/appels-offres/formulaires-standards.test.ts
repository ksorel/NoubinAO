import { describe, expect, it } from "vitest";
import {
  identifierFormulaireStandard,
  genererLettreSoumission,
  genererDeclarationHonneur,
  genererPouvoirHabilitant,
  genererFormulaireIdentification,
  genererTableauDocuments,
} from "./formulaires-standards";
import type { Entreprise } from "@/lib/utilisateur/types";
import type { AppelOffres } from "./types";
import type { Document } from "@/lib/documents/types";

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

  it("reconnaît un pouvoir habilitant (singulier et pluriel)", () => {
    expect(identifierFormulaireStandard("Pouvoir habilitant du soumissionnaire")).toBe(
      "pouvoir_habilitant",
    );
    expect(identifierFormulaireStandard("POUVOIRS HABILITANT DU SOUMISSIONNAIRE")).toBe(
      "pouvoir_habilitant",
    );
  });

  it("reconnaît un formulaire d'identification du soumissionnaire", () => {
    expect(
      identifierFormulaireStandard("Formulaire d'identification du soumissionnaire"),
    ).toBe("formulaire_identification");
    expect(identifierFormulaireStandard("Fiche de renseignements")).toBe(
      "formulaire_identification",
    );
  });

  it("reconnaît un tableau du personnel", () => {
    expect(identifierFormulaireStandard("Tableau du personnel affecté au chantier")).toBe(
      "tableau_personnel",
    );
  });

  it("reconnaît un tableau du matériel", () => {
    expect(identifierFormulaireStandard("Tableau du matériel")).toBe("tableau_materiel");
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
  telephone: "+225 07 00 00 00 00",
  email: "contact@exemple.ci",
  taux_frais_structure_defaut: null,
  secteurs_activite: [],
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
  telephone: null,
  email: null,
  taux_frais_structure_defaut: null,
  secteurs_activite: [],
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

describe("genererFormulaireIdentification", () => {
  it("inclut téléphone et email avec une entreprise entièrement renseignée", () => {
    const texte = genererFormulaireIdentification(entrepriseComplete, appelOffres);
    expect(texte).toContain(entrepriseComplete.telephone as string);
    expect(texte).toContain(entrepriseComplete.email as string);
    expect(texte).not.toContain("[à compléter]");
  });

  it("remplace chaque champ manquant", () => {
    const texte = genererFormulaireIdentification(entrepriseVide, appelOffres);
    expect(texte).toContain("[à compléter]");
  });
});

describe("genererTableauDocuments", () => {
  function creerDocument(nom: string, createdAt: string): Document {
    return {
      id: nom,
      entreprise_id: "e1",
      type: "cv",
      nom,
      fichier_path: `${nom}.pdf`,
      fichier_nom_original: `${nom}.pdf`,
      mime_type: "application/pdf",
      taille_octets: 1000,
      date_expiration: null,
      contenu_markdown: null,
      source_ocr: null,
      created_by: null,
      created_at: createdAt,
    };
  }

  it("liste chaque document associé dans un tableau markdown", () => {
    const texte = genererTableauDocuments(
      [creerDocument("CV Jean Kouassi", "2026-01-15T00:00:00Z")],
      "TABLEAU DU PERSONNEL",
    );
    expect(texte).toContain("TABLEAU DU PERSONNEL");
    expect(texte).toContain("CV Jean Kouassi");
    expect(texte).toContain("| Document | Ajouté le |");
  });

  it("invite à associer des documents quand la liste est vide", () => {
    const texte = genererTableauDocuments([], "TABLEAU DU MATÉRIEL");
    expect(texte).toContain("Aucun document associé");
  });
});
