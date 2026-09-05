import { describe, expect, it } from "vitest";
import { deviserTypeDocumentPrefere } from "./suggestion-document";

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
