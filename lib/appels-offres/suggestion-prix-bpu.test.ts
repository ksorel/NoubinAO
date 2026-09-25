import { describe, expect, it } from "vitest";
import { trouverMeilleureSuggestionPrix, type LigneBpuHistorique } from "./suggestion-prix-bpu";

function creerLigne(overrides: Partial<LigneBpuHistorique> = {}): LigneBpuHistorique {
  return {
    designation: "Fourniture et pose de béton armé dosé à 350 kg/m³",
    unite: "m3",
    prixUnitaire: 45000,
    appelOffresId: "ao1",
    appelOffresTitre: "Construction école Yopougon",
    appelOffresCreatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("trouverMeilleureSuggestionPrix", () => {
  it("retourne null quand aucune ligne historique ne partage de mot-clé", () => {
    const lignes = [
      creerLigne({ designation: "Terrassement en pleine masse" }),
    ];
    expect(trouverMeilleureSuggestionPrix("Peinture murale intérieure", lignes)).toBeNull();
  });

  it("retourne null quand la liste historique est vide", () => {
    expect(trouverMeilleureSuggestionPrix("Béton armé", [])).toBeNull();
  });

  it("retourne null quand la désignation recherchée n'a aucun mot-clé exploitable", () => {
    const lignes = [creerLigne()];
    // "de la" : uniquement des mots vides / trop courts, filtrés par extraireMotsCles.
    expect(trouverMeilleureSuggestionPrix("de la", lignes)).toBeNull();
  });

  it("retourne la ligne dont la désignation partage des mots-clés, avec son prix", () => {
    const lignes = [creerLigne({ prixUnitaire: 45000 })];
    const resultat = trouverMeilleureSuggestionPrix("Béton armé dosé à 350 kg/m³", lignes);
    expect(resultat).not.toBeNull();
    expect(resultat?.prixUnitaire).toBe(45000);
    expect(resultat?.designationOrigine).toBe(
      "Fourniture et pose de béton armé dosé à 350 kg/m³",
    );
  });

  it("retient la ligne au score le plus élevé entre plusieurs candidates", () => {
    const lignes = [
      creerLigne({
        designation: "Terrassement en pleine masse",
        prixUnitaire: 3000,
        appelOffresId: "ao1",
      }),
      creerLigne({
        designation: "Fourniture et pose de béton armé dosé à 350 kg/m³",
        prixUnitaire: 45000,
        appelOffresId: "ao2",
      }),
    ];
    const resultat = trouverMeilleureSuggestionPrix("Béton armé dosé à 350 kg/m³", lignes);
    expect(resultat?.prixUnitaire).toBe(45000);
  });

  it("départage un score égal par la ligne la plus récente", () => {
    const ligneAncienne = creerLigne({
      appelOffresId: "ao1",
      prixUnitaire: 40000,
      appelOffresCreatedAt: "2026-01-01T00:00:00Z",
    });
    const ligneRecente = creerLigne({
      appelOffresId: "ao2",
      prixUnitaire: 47000,
      appelOffresCreatedAt: "2026-06-01T00:00:00Z",
    });
    const resultat = trouverMeilleureSuggestionPrix(
      "Béton armé dosé à 350 kg/m³",
      [ligneAncienne, ligneRecente],
    );
    expect(resultat?.prixUnitaire).toBe(47000);
  });
});
