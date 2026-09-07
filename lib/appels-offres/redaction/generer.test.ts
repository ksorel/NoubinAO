import { describe, expect, it } from "vitest";
import { construirePromptRedaction } from "./generer";
import type { Document } from "@/lib/documents/types";

function creerDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    entreprise_id: "ent-1",
    type: "reference_projet",
    nom: "Référence Projet X",
    fichier_path: "ent-1/documents/ref-x.pdf",
    fichier_nom_original: "ref-x.pdf",
    mime_type: "application/pdf",
    taille_octets: 1024,
    date_expiration: null,
    contenu_markdown: "Contenu de la référence projet X.",
    source_ocr: false,
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("construirePromptRedaction", () => {
  it("inclut le titre de la section demandée", () => {
    const prompt = construirePromptRedaction("Méthodologie", null, []);
    expect(prompt).toContain('"Méthodologie"');
  });

  it("inclut l'extrait du DAO quand fourni", () => {
    const prompt = construirePromptRedaction("Méthodologie", "Contenu du DAO.", []);
    expect(prompt).toContain("Contenu du DAO.");
  });

  it("n'inclut aucune section DAO quand daoMarkdown est null", () => {
    const prompt = construirePromptRedaction("Méthodologie", null, []);
    expect(prompt).not.toContain("Extrait du dossier d'appel d'offres");
  });

  it("tronque le DAO au-delà de la longueur maximale (100 000 caractères)", () => {
    const daoLong = "A".repeat(150000);
    const prompt = construirePromptRedaction("Méthodologie", daoLong, []);
    expect(prompt).toContain("A".repeat(100000));
    expect(prompt).not.toContain("A".repeat(100001));
  });

  it("inclut le nom et le contenu de chaque document source", () => {
    const document = creerDocument();
    const prompt = construirePromptRedaction("Méthodologie", null, [document]);
    expect(prompt).toContain("Référence Projet X");
    expect(prompt).toContain("Contenu de la référence projet X.");
  });

  it("indique l'absence de document source quand la liste est vide", () => {
    const prompt = construirePromptRedaction("Méthodologie", null, []);
    expect(prompt).toContain("Aucun document de référence fourni");
  });

  it("tronque le contenu d'un document source au-delà de la longueur maximale (20 000 caractères)", () => {
    const documentLong = creerDocument({ contenu_markdown: "B".repeat(30000) });
    const prompt = construirePromptRedaction("Méthodologie", null, [documentLong]);
    expect(prompt).toContain("B".repeat(20000));
    expect(prompt).not.toContain("B".repeat(20001));
  });
});
