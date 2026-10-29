import { describe, expect, it } from "vitest";
import { ImageRun, TextRun } from "docx";
import { construireZoneDocx, zonesVides, type ContexteEnTetePiedPage } from "./entete-pied-page";

const contexte: ContexteEnTetePiedPage = {
  nomEntreprise: "SARL Exemple",
  dateExport: "19/10/2026",
  logo: { buffer: Buffer.from("fake-png"), type: "png" },
};

describe("construireZoneDocx", () => {
  it("retourne un tableau vide pour un texte vide ou nul", () => {
    expect(construireZoneDocx(null, contexte)).toEqual([]);
    expect(construireZoneDocx("", contexte)).toEqual([]);
  });

  it("résout {{entreprise}} et {{date}} en TextRun, mêlés à du texte brut", () => {
    const resultat = construireZoneDocx("Offre de {{entreprise}} - {{date}}", contexte);
    expect(resultat).toHaveLength(4);
    expect(resultat.every((r) => r instanceof TextRun)).toBe(true);
  });

  it("résout {{logo}} en ImageRun quand un logo est fourni, en TextRun vide sinon", () => {
    const avecLogo = construireZoneDocx("{{logo}}", contexte);
    expect(avecLogo[0]).toBeInstanceOf(ImageRun);

    const sansLogo = construireZoneDocx("{{logo}}", { ...contexte, logo: null });
    expect(sansLogo[0]).toBeInstanceOf(TextRun);
  });

  it("ne lève pas d'exception sur {{page}}/{{pages}} (champs Word dynamiques)", () => {
    expect(() => construireZoneDocx("Page {{page}} / {{pages}}", contexte)).not.toThrow();
  });
});

describe("zonesVides", () => {
  it("vrai quand toutes les zones sont nulles ou vides", () => {
    expect(zonesVides([null, "", "   "])).toBe(true);
  });

  it("faux dès qu'une zone a du contenu", () => {
    expect(zonesVides([null, "", "{{logo}}"])).toBe(false);
  });
});
