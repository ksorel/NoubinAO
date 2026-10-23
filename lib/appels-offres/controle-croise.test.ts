import { describe, expect, it } from "vitest";
import { calculerControleExhaustivite } from "./controle-croise";
import type { ExigenceAo } from "./types";
import type { Document } from "@/lib/documents/types";

function creerExigence(overrides: Partial<ExigenceAo> = {}): ExigenceAo {
  return {
    id: "exigence-1",
    appel_offres_id: "ao-1",
    type_exigence: "piece_requise",
    libelle: "RCCM",
    description: null,
    ponderation: null,
    source_section: "DPAO",
    categorie_exigence: "formelle",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const UN_DOCUMENT = [{ id: "doc-1" } as Document];

describe("calculerControleExhaustivite", () => {
  it("EXH-01 et EXH-02 ok quand toutes les pièces sont fournies et le BPU entièrement chiffré", () => {
    const exigences = [creerExigence({ id: "e1" }), creerExigence({ id: "e2" })];
    const documentsParExigence = { e1: UN_DOCUMENT, e2: UN_DOCUMENT };
    const lignesBpu = [{ quantite: 1, prix_unitaire: 1000 }, { quantite: 1, prix_unitaire: 2000 }];

    const resultats = calculerControleExhaustivite(exigences, documentsParExigence, lignesBpu);

    expect(resultats.find((r) => r.id === "EXH-01")).toMatchObject({ ok: true, nombre: 0 });
    expect(resultats.find((r) => r.id === "EXH-02")).toMatchObject({ ok: true, nombre: 0 });
  });

  it("EXH-01 signale les lignes du BPU sans prix unitaire", () => {
    const lignesBpu = [
      { quantite: 1, prix_unitaire: 1000 },
      { quantite: 1, prix_unitaire: null },
      { quantite: 1, prix_unitaire: null },
    ];

    const resultats = calculerControleExhaustivite([], {}, lignesBpu);

    expect(resultats.find((r) => r.id === "EXH-01")).toMatchObject({
      ok: false,
      nombre: 2,
      severite: "bloquante",
    });
  });

  it("EXH-02 signale les pièces requises sans document associé", () => {
    const exigences = [
      creerExigence({ id: "e1" }),
      creerExigence({ id: "e2" }),
      // Un critère d'évaluation ne doit jamais compter comme pièce manquante.
      creerExigence({ id: "e3", type_exigence: "critere_evaluation" }),
    ];
    const documentsParExigence = { e1: UN_DOCUMENT };

    const resultats = calculerControleExhaustivite(exigences, documentsParExigence, []);

    expect(resultats.find((r) => r.id === "EXH-02")).toMatchObject({ ok: false, nombre: 1 });
  });

  it("EXH-01 ok trivialement quand le BPU n'a aucune ligne", () => {
    const resultats = calculerControleExhaustivite([], {}, []);

    expect(resultats.find((r) => r.id === "EXH-01")).toMatchObject({ ok: true, nombre: 0 });
  });
});
