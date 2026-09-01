import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./normalisation/normaliser", () => ({
  normaliserDao: vi.fn(),
}));
vi.mock("./normalisation/extraire", () => ({
  extraireInformationsAo: vi.fn(),
}));

import { traiterDao } from "./traitement";
import { normaliserDao } from "./normalisation/normaliser";
import { extraireInformationsAo } from "./normalisation/extraire";
import type { AppelOffres } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

function creerAppelOffresBase(overrides: Partial<AppelOffres> = {}): AppelOffres {
  return {
    id: "ao-1",
    entreprise_id: "ent-1",
    titre: null,
    acheteur: null,
    secteur: null,
    date_limite: null,
    montant_caution: null,
    statut_pipeline: "identifie",
    statut_traitement: "en_attente",
    erreur_traitement: null,
    fichier_dao_path: "ent-1/appels-offres/ao-1-dao.pdf",
    fichier_dao_nom_original: "dao.pdf",
    dao_markdown: null,
    sommaire_attendu: null,
    created_by: "user-1",
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function creerSupabaseFake(appelOffres: AppelOffres) {
  const misAJour: Record<string, unknown>[] = [];
  const exigencesInserees: Record<string, unknown>[][] = [];

  const appelOffresTable = {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { ...appelOffres }, error: null }),
      }),
    }),
    update: (valeurs: Record<string, unknown>) => ({
      eq: async () => {
        misAJour.push(valeurs);
        Object.assign(appelOffres, valeurs);
        return { error: null };
      },
    }),
  };

  const exigenceTable = {
    delete: () => ({
      eq: async () => ({ error: null }),
    }),
    insert: async (lignes: Record<string, unknown>[]) => {
      exigencesInserees.push(lignes);
      return { error: null };
    },
  };

  const fake = {
    from: (table: string) => (table === "appel_offres" ? appelOffresTable : exigenceTable),
    storage: {
      from: () => ({
        download: async () => ({
          data: { arrayBuffer: async () => new TextEncoder().encode("contenu-pdf").buffer },
          error: null,
        }),
      }),
    },
  };

  return {
    supabase: fake as unknown as SupabaseClient,
    misAJour,
    exigencesInserees,
  };
}

describe("traiterDao", () => {
  beforeEach(() => {
    vi.mocked(normaliserDao).mockReset();
    vi.mocked(extraireInformationsAo).mockReset();
  });

  it("exécute normalisation puis extraction pour un AO en attente, et marque terminé", async () => {
    const appelOffres = creerAppelOffresBase();
    const { supabase, misAJour, exigencesInserees } = creerSupabaseFake(appelOffres);

    vi.mocked(normaliserDao).mockResolvedValue({
      markdown: "## AVIS D'APPEL D'OFFRES\nContenu.",
      sections: [{ titre: "AVIS D'APPEL D'OFFRES", contenu: "Contenu." }],
    });
    vi.mocked(extraireInformationsAo).mockResolvedValue({
      titre: "Construction d'un pont",
      acheteur: "Ministère X",
      secteur: "BTP",
      date_limite: "2026-11-03T12:00:00Z",
      montant_caution: 5000000,
      sommaire_attendu: ["Méthodologie"],
      exigences: [
        {
          type_exigence: "piece_requise",
          libelle: "RCCM",
          description: null,
          ponderation: null,
          source_section: "DPAO",
        },
      ],
    });

    await traiterDao(supabase, "ao-1", "application/pdf");

    expect(normaliserDao).toHaveBeenCalledTimes(1);
    expect(extraireInformationsAo).toHaveBeenCalledTimes(1);
    expect(exigencesInserees).toHaveLength(1);
    expect(exigencesInserees[0]).toHaveLength(1);
    expect(misAJour.some((m) => m.statut_traitement === "normalisation")).toBe(true);
    expect(misAJour.some((m) => m.statut_traitement === "extraction")).toBe(true);
    expect(misAJour.at(-1)?.statut_traitement).toBe("termine");
  });

  it("reprend directement à l'extraction si dao_markdown est déjà rempli", async () => {
    const appelOffres = creerAppelOffresBase({
      statut_traitement: "extraction",
      dao_markdown: "## AVIS D'APPEL D'OFFRES\nContenu déjà normalisé.",
    });
    const { supabase } = creerSupabaseFake(appelOffres);

    vi.mocked(extraireInformationsAo).mockResolvedValue({
      titre: null,
      acheteur: null,
      secteur: null,
      date_limite: null,
      montant_caution: null,
      sommaire_attendu: [],
      exigences: [],
    });

    await traiterDao(supabase, "ao-1", "application/pdf");

    expect(normaliserDao).not.toHaveBeenCalled();
    expect(extraireInformationsAo).toHaveBeenCalledTimes(1);
  });

  it("ne fait rien si le statut est déjà 'termine' (idempotence)", async () => {
    const appelOffres = creerAppelOffresBase({ statut_traitement: "termine" });
    const { supabase } = creerSupabaseFake(appelOffres);

    await traiterDao(supabase, "ao-1", "application/pdf");

    expect(normaliserDao).not.toHaveBeenCalled();
    expect(extraireInformationsAo).not.toHaveBeenCalled();
  });

  it("écrit statut_traitement='erreur' et relance l'exception en cas d'échec", async () => {
    const appelOffres = creerAppelOffresBase();
    const { supabase, misAJour } = creerSupabaseFake(appelOffres);

    vi.mocked(normaliserDao).mockRejectedValue(new Error("échec normalisation"));

    await expect(traiterDao(supabase, "ao-1", "application/pdf")).rejects.toThrow(
      "échec normalisation",
    );

    const derniereMiseAJour = misAJour.at(-1);
    expect(derniereMiseAJour?.statut_traitement).toBe("erreur");
    expect(derniereMiseAJour?.erreur_traitement).toBe("échec normalisation");
  });
});
