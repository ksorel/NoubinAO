import { describe, expect, it } from "vitest";
import { ExtractionAoSchema } from "./schema";

describe("ExtractionAoSchema", () => {
  it("valide un objet d'extraction complet", () => {
    const resultat = ExtractionAoSchema.parse({
      titre: "Construction d'un pont",
      acheteur: "Ministère des Infrastructures",
      secteur: "BTP",
      date_limite: "2026-11-03T12:00:00Z",
      montant_caution: 5000000,
      sommaire_attendu: ["Présentation de l'entreprise"],
      exigences: [
        {
          type_exigence: "piece_requise",
          libelle: "RCCM",
          description: "Registre du Commerce",
          ponderation: null,
          source_section: "DPAO",
          categorie_exigence: "eliminatoire",
        },
        {
          type_exigence: "critere_evaluation",
          libelle: "Conformité administrative",
          description: null,
          ponderation: 20,
          source_section: "DPAO",
          categorie_exigence: "notee",
        },
      ],
    });

    expect(resultat.titre).toBe("Construction d'un pont");
    expect(resultat.exigences).toHaveLength(2);
    expect(resultat.exigences[1].ponderation).toBe(20);
    expect(resultat.exigences[0].categorie_exigence).toBe("eliminatoire");
    expect(resultat.exigences[1].categorie_exigence).toBe("notee");
  });

  it("accepte le profil procédure × canal × acheteur quand il est détecté", () => {
    const resultat = ExtractionAoSchema.parse({
      titre: null,
      acheteur: "CI-ENERGIES",
      secteur: null,
      date_limite: null,
      montant_caution: null,
      sommaire_attendu: [],
      type_acheteur: "entreprise_publique",
      procedure_marche: "procedure_simplifiee",
      canal_depot: "sigomap",
      exigences: [],
    });

    expect(resultat.type_acheteur).toBe("entreprise_publique");
    expect(resultat.procedure_marche).toBe("procedure_simplifiee");
    expect(resultat.canal_depot).toBe("sigomap");
  });

  it("accepte le mode d'évaluation et les paramètres de prix quand ils sont détectés", () => {
    const resultat = ExtractionAoSchema.parse({
      titre: null,
      acheteur: null,
      secteur: null,
      date_limite: null,
      montant_caution: null,
      sommaire_attendu: [],
      mode_evaluation: "conformite_moins_disant",
      fourchette_prix_basse: 80,
      fourchette_prix_haute: 110,
      variation_quantite_hausse: 50,
      variation_quantite_baisse: 20,
      taux_redevance_reglementation: 0.5,
      timbre_requis: true,
      exigences: [],
    });

    expect(resultat.mode_evaluation).toBe("conformite_moins_disant");
    expect(resultat.fourchette_prix_basse).toBe(80);
    expect(resultat.fourchette_prix_haute).toBe(110);
    expect(resultat.timbre_requis).toBe(true);
  });

  it("accepte les points flous et la date limite des questions quand ils sont détectés", () => {
    const resultat = ExtractionAoSchema.parse({
      titre: null,
      acheteur: null,
      secteur: null,
      date_limite: null,
      date_limite_questions: "2026-10-13T12:00:00Z",
      montant_caution: null,
      sommaire_attendu: [],
      exigences: [],
      points_flous: [
        { description: "Deux formulaires numérotés F10", source_section: "Formulaires" },
        { description: "Quantité absente pour l'article 4", source_section: null },
      ],
    });

    expect(resultat.date_limite_questions).toBe("2026-10-13T12:00:00Z");
    expect(resultat.points_flous).toHaveLength(2);
    expect(resultat.points_flous?.[1].source_section).toBeNull();
  });

  it("accepte l'absence de points_flous (rétrocompatibilité)", () => {
    const resultat = ExtractionAoSchema.parse({
      titre: null,
      acheteur: null,
      secteur: null,
      date_limite: null,
      montant_caution: null,
      sommaire_attendu: [],
      exigences: [],
    });

    expect(resultat.points_flous).toBeUndefined();
  });

  it("accepte l'absence du profil procédure × canal × acheteur (rétrocompatibilité)", () => {
    const resultat = ExtractionAoSchema.parse({
      titre: null,
      acheteur: null,
      secteur: null,
      date_limite: null,
      montant_caution: null,
      sommaire_attendu: [],
      exigences: [],
    });

    expect(resultat.type_acheteur).toBeUndefined();
    expect(resultat.procedure_marche).toBeUndefined();
    expect(resultat.canal_depot).toBeUndefined();
  });

  it("rejette une valeur hors énumération pour procedure_marche", () => {
    expect(() =>
      ExtractionAoSchema.parse({
        titre: null,
        acheteur: null,
        secteur: null,
        date_limite: null,
        montant_caution: null,
        sommaire_attendu: [],
        procedure_marche: "invalide",
        exigences: [],
      }),
    ).toThrow();
  });

  it("accepte des champs nuls quand l'information est absente", () => {
    const resultat = ExtractionAoSchema.parse({
      titre: null,
      acheteur: null,
      secteur: null,
      date_limite: null,
      montant_caution: null,
      sommaire_attendu: [],
      exigences: [],
    });

    expect(resultat.titre).toBeNull();
    expect(resultat.date_limite).toBeNull();
  });

  it("rejette un type_exigence hors énumération", () => {
    expect(() =>
      ExtractionAoSchema.parse({
        titre: null,
        acheteur: null,
        secteur: null,
        date_limite: null,
        montant_caution: null,
        sommaire_attendu: [],
        exigences: [
          {
            type_exigence: "invalide",
            libelle: "X",
            description: null,
            ponderation: null,
            source_section: "DPAO",
            categorie_exigence: "formelle",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejette une categorie_exigence hors énumération", () => {
    expect(() =>
      ExtractionAoSchema.parse({
        titre: null,
        acheteur: null,
        secteur: null,
        date_limite: null,
        montant_caution: null,
        sommaire_attendu: [],
        exigences: [
          {
            type_exigence: "piece_requise",
            libelle: "X",
            description: null,
            ponderation: null,
            source_section: "DPAO",
            categorie_exigence: "invalide",
          },
        ],
      }),
    ).toThrow();
  });

  it("exige categorie_exigence (plus de booléen caché est_eliminatoire)", () => {
    expect(() =>
      ExtractionAoSchema.parse({
        titre: null,
        acheteur: null,
        secteur: null,
        date_limite: null,
        montant_caution: null,
        sommaire_attendu: [],
        exigences: [
          {
            type_exigence: "piece_requise",
            libelle: "X",
            description: null,
            ponderation: null,
            source_section: "DPAO",
            est_eliminatoire: false,
          },
        ],
      }),
    ).toThrow();
  });

  it("rejette une date_limite qui n'est pas au format ISO 8601", () => {
    expect(() =>
      ExtractionAoSchema.parse({
        titre: null,
        acheteur: null,
        secteur: null,
        date_limite: "3 novembre 2026",
        montant_caution: null,
        sommaire_attendu: [],
        exigences: [],
      }),
    ).toThrow();
  });
});
