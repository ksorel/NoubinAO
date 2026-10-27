import { describe, expect, it } from "vitest";
import { calculerEtatPreparation, calculerProchaineAction } from "./radar";
import type { ExigenceAo } from "./types";
import type { Document } from "@/lib/documents/types";
import type { ResultatControle } from "./controle-croise";

function creerExigence(overrides: Partial<ExigenceAo> = {}): ExigenceAo {
  return {
    id: "e1",
    appel_offres_id: "ao-1",
    type_exigence: "piece_requise",
    libelle: "RCCM",
    description: null,
    ponderation: null,
    source_section: "DPAO",
    categorie_exigence: "formelle",
    note_simulee: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const UN_DOCUMENT = [{ id: "doc-1" } as Document];

describe("calculerEtatPreparation", () => {
  it("100 % trivialement quand il n'y a aucune pièce requise", () => {
    const resultat = calculerEtatPreparation([], {});

    expect(resultat.preparationPct).toBe(100);
    expect(resultat.eliminatoiresTotal).toBe(0);
  });

  it("50 % quand la moitié (en poids) des pièces requises sont fournies", () => {
    const exigences = [
      creerExigence({ id: "e1" }),
      creerExigence({ id: "e2" }),
    ];
    const documentsParExigence = { e1: UN_DOCUMENT };

    const resultat = calculerEtatPreparation(exigences, documentsParExigence);

    expect(resultat.preparationPct).toBe(50);
  });

  it("pondère une pièce éliminatoire au double d'une pièce formelle", () => {
    // 1 éliminatoire (poids 2) manquante + 1 formelle (poids 1) fournie
    // → 1 / 3 ≈ 33 %, pas 50 % (ce que donnerait un calcul non pondéré).
    const exigences = [
      creerExigence({ id: "e1", categorie_exigence: "eliminatoire" }),
      creerExigence({ id: "e2", categorie_exigence: "formelle" }),
    ];
    const documentsParExigence = { e2: UN_DOCUMENT };

    const resultat = calculerEtatPreparation(exigences, documentsParExigence);

    expect(resultat.preparationPct).toBe(33);
  });

  it("compte les éliminatoires levés séparément du pourcentage global", () => {
    const exigences = [
      creerExigence({ id: "e1", categorie_exigence: "eliminatoire" }),
      creerExigence({ id: "e2", categorie_exigence: "eliminatoire" }),
    ];
    const documentsParExigence = { e1: UN_DOCUMENT };

    const resultat = calculerEtatPreparation(exigences, documentsParExigence);

    expect(resultat.eliminatoiresLevees).toBe(1);
    expect(resultat.eliminatoiresTotal).toBe(2);
  });

  it("ignore les critères d'évaluation dans le calcul (seules les pièces requises comptent)", () => {
    const exigences = [creerExigence({ id: "e1", type_exigence: "critere_evaluation" })];

    const resultat = calculerEtatPreparation(exigences, {});

    expect(resultat.preparationPct).toBe(100);
  });
});

describe("calculerProchaineAction", () => {
  const CONTROLE_OK: ResultatControle[] = [
    { id: "EXH-01", severite: "bloquante", ok: true, nombre: 0 },
    { id: "VAL-01", severite: "bloquante", ok: true, nombre: 0 },
  ];

  it("aucune action quand tout est en ordre", () => {
    const resultat = calculerProchaineAction([], {}, CONTROLE_OK, []);

    expect(resultat).toBeNull();
  });

  it("priorité 1 : une pièce éliminatoire manquante, même si des contrôles bloquants existent aussi", () => {
    const exigences = [
      creerExigence({ id: "e1", categorie_exigence: "eliminatoire", libelle: "Agrément" }),
    ];
    const controleAvecBloquant: ResultatControle[] = [
      { id: "SAI-01", severite: "bloquante", ok: false, nombre: 1 },
    ];

    const resultat = calculerProchaineAction(exigences, {}, controleAvecBloquant, []);

    expect(resultat).toEqual({ type: "eliminatoire_manquante", libelle: "Agrément" });
  });

  it("priorité 2 : une pièce qui expirera avant le dépôt (VAL-01), avant un contrôle bloquant générique", () => {
    const controle: ResultatControle[] = [
      { id: "VAL-01", severite: "bloquante", ok: false, nombre: 1 },
      { id: "SAI-01", severite: "bloquante", ok: false, nombre: 1 },
    ];

    const resultat = calculerProchaineAction([], {}, controle, []);

    expect(resultat).toEqual({ type: "piece_perimee", libelle: "VAL-01" });
  });

  it("priorité 3 : un contrôle bloquant générique (ex. EXH-02, pièce manquante)", () => {
    const controle: ResultatControle[] = [
      { id: "EXH-02", severite: "bloquante", ok: false, nombre: 1 },
      { id: "IDN-01", severite: "avertissement", ok: false, nombre: 2 },
    ];

    const resultat = calculerProchaineAction([], {}, controle, []);

    expect(resultat).toEqual({ type: "controle_bloquant", libelle: "EXH-02" });
  });

  it("n'est pas déclenché par un avertissement (seulement par une bloquante)", () => {
    const controle: ResultatControle[] = [
      { id: "IDN-01", severite: "avertissement", ok: false, nombre: 2 },
    ];

    const resultat = calculerProchaineAction([], {}, controle, []);

    expect(resultat).toBeNull();
  });

  it("priorité 4 : un jalon de rétroplanning en retard, en dernier recours", () => {
    const jalons = [{ libelle: "Envoyer les questions", date_cible: "2026-01-01", coche: false }];

    const resultat = calculerProchaineAction(
      [],
      {},
      CONTROLE_OK,
      jalons,
      new Date("2026-01-05"),
    );

    expect(resultat).toEqual({ type: "jalon_en_retard", libelle: "Envoyer les questions" });
  });

  it("ignore un jalon en retard mais déjà coché", () => {
    const jalons = [{ libelle: "Déjà fait", date_cible: "2026-01-01", coche: true }];

    const resultat = calculerProchaineAction([], {}, CONTROLE_OK, jalons, new Date("2026-01-05"));

    expect(resultat).toBeNull();
  });
});
