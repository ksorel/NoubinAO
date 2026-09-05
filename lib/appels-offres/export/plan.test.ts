import { describe, expect, it } from "vitest";
import { construirePlanExport } from "./plan";
import type { AppelOffres, ExigenceAo } from "../types";
import type { Document } from "@/lib/documents/types";

function creerAppelOffres(overrides: Partial<AppelOffres> = {}): AppelOffres {
  return {
    id: "ao-1",
    entreprise_id: "ent-1",
    titre: "Construction d'un pont",
    acheteur: "Ministère des Infrastructures",
    secteur: "BTP",
    date_limite: null,
    montant_caution: null,
    statut_pipeline: "identifie",
    statut_traitement: "termine",
    erreur_traitement: null,
    fichier_dao_path: "ent-1/appels-offres/ao-1-dao.pdf",
    fichier_dao_nom_original: "dao.pdf",
    dao_markdown: null,
    sommaire_attendu: ["Offre technique", "Offre financière"],
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function creerExigence(overrides: Partial<ExigenceAo> = {}): ExigenceAo {
  return {
    id: "exi-1",
    appel_offres_id: "ao-1",
    type_exigence: "piece_requise",
    libelle: "RCCM",
    description: null,
    ponderation: null,
    source_section: "IS 4.2",
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function creerDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    entreprise_id: "ent-1",
    type: "piece_administrative",
    nom: "RCCM K-Nowledge",
    fichier_path: "ent-1/documents/rccm.pdf",
    fichier_nom_original: "rccm.pdf",
    mime_type: "application/pdf",
    taille_octets: 1024,
    date_expiration: null,
    contenu_markdown: null,
    source_ocr: false,
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("construirePlanExport", () => {
  it("liste les documents associés à une pièce requise", () => {
    const appelOffres = creerAppelOffres();
    const exigence = creerExigence();
    const document = creerDocument();

    const plan = construirePlanExport(
      appelOffres,
      [exigence],
      { [exigence.id]: [document] },
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(plan.piecesRequises).toEqual([
      {
        libelle: "RCCM",
        documents: [{ nom: "RCCM K-Nowledge", type: "Pièce administrative" }],
      },
    ]);
  });

  it("laisse la liste de documents vide pour une pièce non mappée", () => {
    const appelOffres = creerAppelOffres();
    const exigence = creerExigence({ id: "exi-2", libelle: "Attestation CNPS" });

    const plan = construirePlanExport(
      appelOffres,
      [exigence],
      {},
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(plan.piecesRequises).toEqual([{ libelle: "Attestation CNPS", documents: [] }]);
  });

  it("inclut les critères d'évaluation avec leur pondération", () => {
    const appelOffres = creerAppelOffres();
    const critere = creerExigence({
      id: "exi-3",
      type_exigence: "critere_evaluation",
      libelle: "Qualité technique",
      ponderation: 60,
    });

    const plan = construirePlanExport(appelOffres, [critere], {}, new Date("2026-09-10T12:00:00Z"));

    expect(plan.criteresEvaluation).toEqual([{ libelle: "Qualité technique", ponderation: 60 }]);
  });

  it("renvoie une liste de critères vide si aucun n'existe", () => {
    const appelOffres = creerAppelOffres();

    const plan = construirePlanExport(appelOffres, [], {}, new Date("2026-09-10T12:00:00Z"));

    expect(plan.criteresEvaluation).toEqual([]);
  });

  it("conserve sommaire_attendu tel quel quand présent", () => {
    const appelOffres = creerAppelOffres({ sommaire_attendu: ["Section A", "Section B"] });

    const plan = construirePlanExport(appelOffres, [], {}, new Date("2026-09-10T12:00:00Z"));

    expect(plan.sommaireAttendu).toEqual(["Section A", "Section B"]);
  });

  it("renvoie null pour sommaireAttendu quand absent", () => {
    const appelOffres = creerAppelOffres({ sommaire_attendu: null });

    const plan = construirePlanExport(appelOffres, [], {}, new Date("2026-09-10T12:00:00Z"));

    expect(plan.sommaireAttendu).toBeNull();
  });

  it("formate la date d'export en JJ/MM/AAAA (UTC)", () => {
    const appelOffres = creerAppelOffres();

    const plan = construirePlanExport(appelOffres, [], {}, new Date("2026-01-05T23:00:00Z"));

    expect(plan.dateExport).toBe("05/01/2026");
  });

  it("utilise le nom de fichier original comme titre si le titre est absent", () => {
    const appelOffres = creerAppelOffres({ titre: null, fichier_dao_nom_original: "dao-brut.pdf" });

    const plan = construirePlanExport(appelOffres, [], {}, new Date("2026-09-10T12:00:00Z"));

    expect(plan.titre).toBe("dao-brut.pdf");
  });
});
