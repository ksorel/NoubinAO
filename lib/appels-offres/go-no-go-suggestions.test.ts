import { describe, expect, it } from "vitest";
import { suggererReponseAgrement, suggererReponseAttestations } from "./go-no-go-suggestions";
import type { Document } from "@/lib/documents/types";

function document(partiel: Partial<Document>): Document {
  return {
    id: "doc-1",
    entreprise_id: "entreprise-1",
    type: "piece_administrative",
    nom: "Test",
    fichier_path: "x",
    fichier_nom_original: "x.pdf",
    mime_type: "application/pdf",
    taille_octets: 100,
    date_expiration: null,
    contenu_markdown: null,
    source_ocr: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...partiel,
  };
}

describe("suggererReponseAgrement", () => {
  it("aucun document de type agrement -> non", () => {
    expect(suggererReponseAgrement([document({ type: "piece_administrative" })])).toBe("non");
  });

  it("un agrément sans date d'expiration -> oui", () => {
    expect(suggererReponseAgrement([document({ type: "agrement", date_expiration: null })])).toBe("oui");
  });

  it("un agrément expiré -> non", () => {
    expect(
      suggererReponseAgrement([document({ type: "agrement", date_expiration: "2020-01-01" })]),
    ).toBe("non");
  });

  it("un agrément expiré et un valide -> oui (au moins un valide suffit)", () => {
    expect(
      suggererReponseAgrement([
        document({ type: "agrement", date_expiration: "2020-01-01" }),
        document({ type: "agrement", date_expiration: "2099-01-01" }),
      ]),
    ).toBe("oui");
  });
});

describe("suggererReponseAttestations", () => {
  it("aucune pièce administrative -> non", () => {
    expect(suggererReponseAttestations([document({ type: "agrement" })])).toBe("non");
  });

  it("toutes les pièces administratives valides -> oui", () => {
    expect(
      suggererReponseAttestations([
        document({ type: "piece_administrative", date_expiration: "2099-01-01" }),
        document({ type: "piece_administrative", date_expiration: null }),
      ]),
    ).toBe("oui");
  });

  it("au moins une pièce administrative expirée -> non (toutes doivent être à jour)", () => {
    expect(
      suggererReponseAttestations([
        document({ type: "piece_administrative", date_expiration: "2099-01-01" }),
        document({ type: "piece_administrative", date_expiration: "2020-01-01" }),
      ]),
    ).toBe("non");
  });
});
