import { describe, expect, it } from "vitest";
import { calculerControleExhaustivite, calculerControleValidite } from "./controle-croise";
import type { ExigenceAo } from "./types";
import type { Document } from "@/lib/documents/types";

function creerDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    entreprise_id: "ent-1",
    type: "piece_administrative",
    nom: "RCCM",
    fichier_path: "ent-1/documents/doc-1.pdf",
    fichier_nom_original: "RCCM.pdf",
    mime_type: "application/pdf",
    taille_octets: 1024,
    date_expiration: null,
    contenu_markdown: null,
    source_ocr: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

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

describe("calculerControleValidite", () => {
  const dateDepot = new Date("2026-11-03T12:00:00Z");

  it("VAL-01 ok quand aucune pièce n'expire avant la date de dépôt", () => {
    const documentsParExigence = {
      e1: [creerDocument({ id: "d1", date_expiration: "2026-12-01T00:00:00Z" })],
      e2: [creerDocument({ id: "d2", date_expiration: null })],
    };

    const resultats = calculerControleValidite(documentsParExigence, dateDepot);

    expect(resultats.find((r) => r.id === "VAL-01")).toMatchObject({ ok: true, nombre: 0 });
  });

  it("VAL-01 signale une pièce qui expirera avant le dépôt, même si valide aujourd'hui", () => {
    // Cas réel que la checklist existante (checklist.ts, comparaison à
    // "maintenant") ne détecte pas : un document valide aujourd'hui mais
    // dont l'expiration tombe avant la date de dépôt de l'offre.
    const documentsParExigence = {
      e1: [creerDocument({ id: "d1", date_expiration: "2026-10-30T00:00:00Z" })],
    };

    const resultats = calculerControleValidite(documentsParExigence, dateDepot);

    expect(resultats.find((r) => r.id === "VAL-01")).toMatchObject({
      ok: false,
      nombre: 1,
      severite: "bloquante",
    });
  });

  it("VAL-01 ne compte pas deux fois un même document associé à plusieurs exigences", () => {
    const documentPerime = creerDocument({ id: "d1", date_expiration: "2026-10-30T00:00:00Z" });
    const documentsParExigence = {
      e1: [documentPerime],
      e2: [documentPerime],
    };

    const resultats = calculerControleValidite(documentsParExigence, dateDepot);

    expect(resultats.find((r) => r.id === "VAL-01")).toMatchObject({ nombre: 1 });
  });
});
