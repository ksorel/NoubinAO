import { describe, expect, it } from "vitest";
import { deviserTypeDocumentPrefere, classerCvParPertinence } from "./suggestion-document";

describe("deviserTypeDocumentPrefere", () => {
  it("reconnaît un CV, insensible à la casse", () => {
    expect(deviserTypeDocumentPrefere("CV du chef de chantier")).toBe("cv");
    expect(deviserTypeDocumentPrefere("cv de l'ingénieur")).toBe("cv");
  });

  it("reconnaît une référence de projet", () => {
    expect(deviserTypeDocumentPrefere("Référence de projet similaire")).toBe(
      "reference_projet",
    );
    expect(deviserTypeDocumentPrefere("Projet similaire réalisé")).toBe(
      "reference_projet",
    );
  });

  it("reconnaît un agrément", () => {
    expect(deviserTypeDocumentPrefere("Agrément technique requis")).toBe("agrement");
  });

  it("retombe sur piece_administrative par défaut", () => {
    expect(deviserTypeDocumentPrefere("Extrait RCCM")).toBe("piece_administrative");
    expect(deviserTypeDocumentPrefere("Attestation fiscale")).toBe("piece_administrative");
  });
});

function creerCv(id: string, nom: string, contenuMarkdown: string | null) {
  return {
    id,
    entreprise_id: "e1",
    type: "cv" as const,
    nom,
    fichier_path: `documents/${id}.pdf`,
    fichier_nom_original: `${nom}.pdf`,
    mime_type: "application/pdf",
    taille_octets: 1024,
    date_expiration: null,
    contenu_markdown: contenuMarkdown,
    source_ocr: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("classerCvParPertinence", () => {
  it("ne change pas l'ordre quand aucun critère ne partage de mot-clé avec la pièce", () => {
    const cvs = [
      creerCv("cv1", "CV Kouassi", "Ingénieur électricité, 8 ans d'expérience"),
      creerCv("cv2", "CV Traoré", "Chef comptable, 5 ans d'expérience"),
    ];
    const criteres = [
      { libelle: "Chiffre d'affaires minimum", description: "500 000 000 FCFA sur 3 ans" },
    ];

    const resultat = classerCvParPertinence("CV du Directeur des travaux", criteres, cvs);
    expect(resultat).toEqual(cvs);
  });

  it("classe en premier le CV dont le contenu correspond le mieux au critère matché", () => {
    const cvGenieCivil = creerCv(
      "cv1",
      "CV Kouassi",
      "Ingénieur génie civil, spécialiste travaux routiers, 12 ans d'expérience",
    );
    const cvComptable = creerCv("cv2", "CV Traoré", "Chef comptable, 5 ans d'expérience");
    const criteres = [
      {
        libelle: "Directeur des travaux",
        description: "Ingénieur génie civil, minimum 10 ans d'expérience travaux routiers",
      },
    ];

    const resultat = classerCvParPertinence(
      "CV du Directeur des travaux",
      criteres,
      [cvComptable, cvGenieCivil],
    );
    expect(resultat[0].id).toBe("cv1");
  });

  it("combine le texte de plusieurs critères correspondants pour le scoring", () => {
    const cv = creerCv("cv1", "CV Kouassi", "Ingénieur génie civil, travaux routiers, 12 ans");
    const criteres = [
      { libelle: "Directeur des travaux", description: "Ingénieur génie civil requis" },
      { libelle: "Expérience travaux routiers", description: "Minimum 10 ans" },
    ];

    const resultat = classerCvParPertinence("CV du Directeur des travaux", criteres, [cv]);
    expect(resultat).toEqual([cv]);
  });

  it("attribue un score de 0 à un CV sans contenu_markdown, sans lever d'exception", () => {
    const cvSansContenu = creerCv("cv1", "CV Kouassi", null);
    const cvAvecContenu = creerCv(
      "cv2",
      "CV Traoré",
      "Ingénieur génie civil, travaux routiers, 10 ans",
    );
    const criteres = [
      { libelle: "Directeur des travaux", description: "Ingénieur génie civil, travaux routiers" },
    ];

    expect(() =>
      classerCvParPertinence("CV du Directeur des travaux", criteres, [cvSansContenu, cvAvecContenu]),
    ).not.toThrow();

    const resultat = classerCvParPertinence(
      "CV du Directeur des travaux",
      criteres,
      [cvSansContenu, cvAvecContenu],
    );
    expect(resultat[0].id).toBe("cv2");
  });

  it("retourne la liste inchangée quand il n'y a aucun critère de qualification du tout", () => {
    const cvs = [creerCv("cv1", "CV Kouassi", "Ingénieur génie civil")];
    const resultat = classerCvParPertinence("CV du Directeur des travaux", [], cvs);
    expect(resultat).toEqual(cvs);
  });

  it("ne corrèle pas un critère non lié à cause d'un mot générique partagé uniquement dans sa description", () => {
    const cvDirecteur = creerCv(
      "cv1",
      "CV Kouassi",
      "Ingénieur génie civil, Directeur des travaux, 14 ans d'expérience routière",
    );
    const cvChefChantier = creerCv(
      "cv2",
      "CV Yao",
      "Technicien supérieur, chef de chantier, terrassement, maîtrise des engins",
    );
    const criteres = [
      { libelle: "Directeur des travaux", description: "Ingénieur génie civil, 10 ans minimum" },
      {
        libelle: "Chef de chantier",
        description:
          "Technicien supérieur en travaux publics, 5 ans sur chantiers routiers, maîtrise des engins de terrassement et suivi des travaux",
      },
    ];

    const resultat = classerCvParPertinence(
      "CV du Directeur des travaux",
      criteres,
      [cvChefChantier, cvDirecteur],
    );
    expect(resultat[0].id).toBe("cv1");
  });
});
