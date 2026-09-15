import { describe, expect, it } from "vitest";
import { calculerChecklistAutomatique } from "./checklist";
import type { ExigenceAo, SectionDossier } from "./types";
import type { Document } from "@/lib/documents/types";

function exigence(overrides: Partial<ExigenceAo> = {}): ExigenceAo {
  return {
    id: "exigence-1",
    appel_offres_id: "ao-1",
    type_exigence: "piece_requise",
    libelle: "RCCM",
    description: null,
    ponderation: null,
    source_section: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function section(overrides: Partial<SectionDossier> = {}): SectionDossier {
  return {
    id: "section-1",
    dossier_reponse_id: "dossier-1",
    titre: "Méthodologie",
    contenu: null,
    statut: "validee",
    generated_at: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function document(overrides: Partial<Document> = {}): Document {
  return {
    id: "document-1",
    entreprise_id: "entreprise-1",
    type: "piece_administrative",
    nom: "RCCM",
    fichier_path: "path/to/file",
    fichier_nom_original: "rccm.pdf",
    mime_type: "application/pdf",
    taille_octets: 1000,
    date_expiration: null,
    contenu_markdown: null,
    source_ocr: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const MAINTENANT = new Date("2026-09-15T00:00:00Z");

describe("calculerChecklistAutomatique", () => {
  it("toutes les pièces requises couvertes -> ok", () => {
    const e = exigence({ id: "e1", type_exigence: "piece_requise" });
    const doc = document({ id: "d1" });
    const resultat = calculerChecklistAutomatique([e], { e1: [doc] }, [], {});
    expect(resultat.find((i) => i.cle === "pieces_manquantes")).toEqual({
      cle: "pieces_manquantes",
      ok: true,
      nombre: 0,
    });
  });

  it("une pièce requise sans document -> problème", () => {
    const e = exigence({ id: "e1", type_exigence: "piece_requise" });
    const resultat = calculerChecklistAutomatique([e], {}, [], {});
    expect(resultat.find((i) => i.cle === "pieces_manquantes")).toEqual({
      cle: "pieces_manquantes",
      ok: false,
      nombre: 1,
    });
  });

  it("un critère d'évaluation sans document ne compte pas comme pièce manquante", () => {
    const e = exigence({ id: "e1", type_exigence: "critere_evaluation" });
    const resultat = calculerChecklistAutomatique([e], {}, [], {});
    expect(resultat.find((i) => i.cle === "pieces_manquantes")).toEqual({
      cle: "pieces_manquantes",
      ok: true,
      nombre: 0,
    });
  });

  it("toutes les sections validées -> ok", () => {
    const s = section({ statut: "validee" });
    const resultat = calculerChecklistAutomatique([], {}, [s], {});
    expect(resultat.find((i) => i.cle === "sections_en_brouillon")).toEqual({
      cle: "sections_en_brouillon",
      ok: true,
      nombre: 0,
    });
  });

  it("une section en brouillon -> problème", () => {
    const s = section({ statut: "brouillon" });
    const resultat = calculerChecklistAutomatique([], {}, [s], {});
    expect(resultat.find((i) => i.cle === "sections_en_brouillon")).toEqual({
      cle: "sections_en_brouillon",
      ok: false,
      nombre: 1,
    });
  });

  it("un document dont la date d'expiration est future n'est pas compté", () => {
    const e = exigence({ id: "e1", type_exigence: "piece_requise" });
    const doc = document({ id: "d1", date_expiration: "2027-01-01T00:00:00Z" });
    const resultat = calculerChecklistAutomatique([e], { e1: [doc] }, [], {}, MAINTENANT);
    expect(resultat.find((i) => i.cle === "documents_expires")).toEqual({
      cle: "documents_expires",
      ok: true,
      nombre: 0,
    });
  });

  it("un document déjà expiré utilisé comme pièce requise est compté", () => {
    const e = exigence({ id: "e1", type_exigence: "piece_requise" });
    const doc = document({ id: "d1", date_expiration: "2026-01-01T00:00:00Z" });
    const resultat = calculerChecklistAutomatique([e], { e1: [doc] }, [], {}, MAINTENANT);
    expect(resultat.find((i) => i.cle === "documents_expires")).toEqual({
      cle: "documents_expires",
      ok: false,
      nombre: 1,
    });
  });

  it("le même document expiré utilisé en pièce requise et en section n'est compté qu'une fois", () => {
    const e = exigence({ id: "e1", type_exigence: "piece_requise" });
    const s = section({ id: "s1", statut: "validee" });
    const doc = document({ id: "d1", date_expiration: "2026-01-01T00:00:00Z" });
    const resultat = calculerChecklistAutomatique(
      [e],
      { e1: [doc] },
      [s],
      { s1: [doc] },
      MAINTENANT,
    );
    expect(resultat.find((i) => i.cle === "documents_expires")).toEqual({
      cle: "documents_expires",
      ok: false,
      nombre: 1,
    });
  });

  it("aucune exigence/section/document -> tous les items sont ok", () => {
    const resultat = calculerChecklistAutomatique([], {}, [], {});
    expect(resultat).toEqual([
      { cle: "pieces_manquantes", ok: true, nombre: 0 },
      { cle: "sections_en_brouillon", ok: true, nombre: 0 },
      { cle: "documents_expires", ok: true, nombre: 0 },
    ]);
  });
});
