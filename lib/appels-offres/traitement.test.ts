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

const UN_SEUL_FICHIER = [
  { cheminStockage: "ent-1/appels-offres/ao-1-0-dao.pdf", mimeType: "application/pdf" },
];

function creerAppelOffresBase(overrides: Partial<AppelOffres> = {}): AppelOffres {
  return {
    id: "ao-1",
    entreprise_id: "ent-1",
    titre: null,
    acheteur: null,
    secteur: null,
    date_limite: null,
    montant_caution: null,
    contact_retrait: null,
    statut_pipeline: "identifie",
    statut_traitement: "en_attente",
    erreur_traitement: null,
    fichier_dao_path: "ent-1/appels-offres/ao-1-0-dao.pdf",
    fichier_dao_nom_original: "dao.pdf",
    modele_cv_path: null,
    modele_cv_nom_original: null,
    modele_cv_markdown: null,
    dao_markdown: null,
    sommaire_attendu: null,
    assigne_a: null,
    created_by: "user-1",
    raison_resultat: null,
    note_resultat: null,
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function creerSupabaseFake(
  appelOffres: AppelOffres,
  options: {
    echouerMiseAJourFinale?: boolean;
    echouerInsertionDossierReponse?: boolean;
    lancerExceptionClassification?: boolean;
  } = {},
) {
  const misAJour: Record<string, unknown>[] = [];
  const exigencesInserees: Record<string, unknown>[][] = [];
  const dossierReponseInsere: Record<string, unknown>[] = [];
  const fichiersClassifies: { appelOffresId: string; cheminStockage: string; type: unknown }[] = [];

  const appelOffresTable = {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { ...appelOffres }, error: null }),
      }),
    }),
    update: (valeurs: Record<string, unknown>) => ({
      eq: async () => {
        misAJour.push(valeurs);

        if (options.echouerMiseAJourFinale && valeurs.statut_traitement === "termine") {
          return { error: { message: "échec simulé de la mise à jour finale" } };
        }

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

  const dossierReponseTable = {
    insert: async (valeurs: Record<string, unknown>) => {
      if (options.echouerInsertionDossierReponse) {
        return { error: { message: "échec simulé de l'insertion dossier_reponse" } };
      }
      dossierReponseInsere.push(valeurs);
      return { error: null };
    },
  };

  const fichierDaoSupplementaireTable = {
    update: (valeurs: Record<string, unknown>) => ({
      eq: (_colonne1: string, appelOffresId: string) => ({
        eq: async (_colonne2: string, cheminStockage: string) => {
          if (options.lancerExceptionClassification) {
            throw new Error("échec inattendu simulé de la classification");
          }

          fichiersClassifies.push({
            appelOffresId,
            cheminStockage,
            type: valeurs.type_classifie,
          });
          return { error: null };
        },
      }),
    }),
  };

  const fake = {
    from: (table: string) => {
      if (table === "appel_offres") return appelOffresTable;
      if (table === "dossier_reponse") return dossierReponseTable;
      if (table === "fichier_dao_supplementaire") return fichierDaoSupplementaireTable;
      return exigenceTable;
    },
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
    dossierReponseInsere,
    fichiersClassifies,
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
      sourceOcr: false,
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

    await traiterDao(supabase, "ao-1", UN_SEUL_FICHIER);

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

    await traiterDao(supabase, "ao-1", UN_SEUL_FICHIER);

    expect(normaliserDao).not.toHaveBeenCalled();
    expect(extraireInformationsAo).toHaveBeenCalledTimes(1);
  });

  it("ne fait rien si le statut est déjà 'termine' (idempotence)", async () => {
    const appelOffres = creerAppelOffresBase({ statut_traitement: "termine" });
    const { supabase } = creerSupabaseFake(appelOffres);

    await traiterDao(supabase, "ao-1", UN_SEUL_FICHIER);

    expect(normaliserDao).not.toHaveBeenCalled();
    expect(extraireInformationsAo).not.toHaveBeenCalled();
  });

  it("écrit statut_traitement='erreur' et relance l'exception en cas d'échec", async () => {
    const appelOffres = creerAppelOffresBase();
    const { supabase, misAJour } = creerSupabaseFake(appelOffres);

    vi.mocked(normaliserDao).mockRejectedValue(new Error("échec normalisation"));

    await expect(traiterDao(supabase, "ao-1", UN_SEUL_FICHIER)).rejects.toThrow(
      "échec normalisation",
    );

    const derniereMiseAJour = misAJour.at(-1);
    expect(derniereMiseAJour?.statut_traitement).toBe("erreur");
    expect(derniereMiseAJour?.erreur_traitement).toBe("échec normalisation");
  });

  it("écrit statut_traitement='erreur' et relance l'exception si la mise à jour finale échoue en base", async () => {
    const appelOffres = creerAppelOffresBase();
    const { supabase, misAJour } = creerSupabaseFake(appelOffres, {
      echouerMiseAJourFinale: true,
    });

    vi.mocked(normaliserDao).mockResolvedValue({
      markdown: "## AVIS D'APPEL D'OFFRES\nContenu.",
      sections: [{ titre: "AVIS D'APPEL D'OFFRES", contenu: "Contenu." }],
      sourceOcr: false,
    });
    vi.mocked(extraireInformationsAo).mockResolvedValue({
      titre: "Construction d'un pont",
      acheteur: "Ministère X",
      secteur: "BTP",
      date_limite: "2026-11-03T12:00:00Z",
      montant_caution: 5000000,
      sommaire_attendu: ["Méthodologie"],
      exigences: [],
    });

    await expect(traiterDao(supabase, "ao-1", UN_SEUL_FICHIER)).rejects.toThrow(
      "Échec de la mise à jour finale de l'appel d'offres.",
    );

    const derniereMiseAJour = misAJour.at(-1);
    expect(derniereMiseAJour?.statut_traitement).toBe("erreur");
    expect(derniereMiseAJour?.erreur_traitement).toBe(
      "Échec de la mise à jour finale de l'appel d'offres.",
    );
  });

  it("crée un dossier_reponse une fois le traitement terminé", async () => {
    const appelOffres = creerAppelOffresBase();
    const { supabase, dossierReponseInsere } = creerSupabaseFake(appelOffres);

    vi.mocked(normaliserDao).mockResolvedValue({
      markdown: "## AVIS D'APPEL D'OFFRES\nContenu.",
      sections: [{ titre: "AVIS D'APPEL D'OFFRES", contenu: "Contenu." }],
      sourceOcr: false,
    });
    vi.mocked(extraireInformationsAo).mockResolvedValue({
      titre: "Construction d'un pont",
      acheteur: "Ministère X",
      secteur: "BTP",
      date_limite: "2026-11-03T12:00:00Z",
      montant_caution: 5000000,
      sommaire_attendu: [],
      exigences: [],
    });

    await traiterDao(supabase, "ao-1", UN_SEUL_FICHIER);

    expect(dossierReponseInsere).toHaveLength(1);
    expect(dossierReponseInsere[0]).toEqual({ appel_offres_id: "ao-1" });
  });

  it("ne fait pas échouer le traitement si l'insertion du dossier_reponse échoue", async () => {
    // Best-effort : voir spec docs/superpowers/specs/2026-09-05-modele-donnees-dossier-reponse-design.md.
    // L'extraction a réussi, une erreur sur cette table annexe ne doit ni
    // relancer d'exception, ni faire basculer statut_traitement à 'erreur'.
    const appelOffres = creerAppelOffresBase();
    const { supabase, misAJour } = creerSupabaseFake(appelOffres, {
      echouerInsertionDossierReponse: true,
    });

    vi.mocked(normaliserDao).mockResolvedValue({
      markdown: "## AVIS D'APPEL D'OFFRES\nContenu.",
      sections: [{ titre: "AVIS D'APPEL D'OFFRES", contenu: "Contenu." }],
      sourceOcr: false,
    });
    vi.mocked(extraireInformationsAo).mockResolvedValue({
      titre: "Construction d'un pont",
      acheteur: "Ministère X",
      secteur: "BTP",
      date_limite: "2026-11-03T12:00:00Z",
      montant_caution: 5000000,
      sommaire_attendu: [],
      exigences: [],
    });

    await expect(
      traiterDao(supabase, "ao-1", UN_SEUL_FICHIER),
    ).resolves.toBeUndefined();

    expect(misAJour.at(-1)?.statut_traitement).toBe("termine");
  });

  it("classe et concatène plusieurs fichiers en ordre canonique avant l'extraction", async () => {
    const appelOffres = creerAppelOffresBase();
    const { supabase, misAJour, fichiersClassifies } = creerSupabaseFake(appelOffres);

    // Le premier appel normaliserDao correspond au fichier DPAO (uploadé
    // en premier dans le tableau `fichiers` ci-dessous), le second à
    // l'AAO — l'ordre de sortie doit malgré tout suivre l'ordre
    // canonique (AAO avant DPAO), pas l'ordre d'upload.
    vi.mocked(normaliserDao)
      .mockResolvedValueOnce({
        markdown: "## Données Particulières de l'Appel d'Offres\nContenu DPAO.",
        sections: [],
        sourceOcr: false,
      })
      .mockResolvedValueOnce({
        markdown: "## Avis d'Appel d'Offres\nContenu AAO.",
        sections: [],
        sourceOcr: false,
      });
    vi.mocked(extraireInformationsAo).mockResolvedValue({
      titre: null,
      acheteur: null,
      secteur: null,
      date_limite: null,
      montant_caution: null,
      sommaire_attendu: [],
      exigences: [],
    });

    await traiterDao(supabase, "ao-1", [
      { cheminStockage: "ent-1/appels-offres/ao-1-0-dpao.pdf", mimeType: "application/pdf" },
      { cheminStockage: "ent-1/appels-offres/ao-1-1-aao.pdf", mimeType: "application/pdf" },
    ]);

    expect(normaliserDao).toHaveBeenCalledTimes(2);

    const miseAJourMarkdown = misAJour.find((m) => "dao_markdown" in m);
    const markdownEnregistre = miseAJourMarkdown?.dao_markdown as string;
    expect(markdownEnregistre.indexOf("Contenu AAO")).toBeLessThan(
      markdownEnregistre.indexOf("Contenu DPAO"),
    );

    // Seul le fichier d'indice 1 (le second) est un fichier "supplémentaire" —
    // celui d'indice 0 correspond à appel_offres.fichier_dao_path, jamais
    // mis à jour dans fichier_dao_supplementaire.
    expect(fichiersClassifies).toHaveLength(1);
    expect(fichiersClassifies[0]).toEqual({
      appelOffresId: "ao-1",
      cheminStockage: "ent-1/appels-offres/ao-1-1-aao.pdf",
      type: "aao",
    });
  });

  it("ne fait pas échouer le traitement si l'enregistrement du type classifié lance une exception", async () => {
    // Best-effort : la boucle de classification doit survivre non seulement
    // à un { error } retourné par Supabase (cas déjà couvert), mais aussi
    // à une exception rejetée par l'await lui-même (échec de transport) —
    // sans quoi elle remonterait au try/catch extérieur et ferait échouer
    // tout le traitement sur une écriture purement cosmétique.
    const appelOffres = creerAppelOffresBase();
    const { supabase, misAJour } = creerSupabaseFake(appelOffres, {
      lancerExceptionClassification: true,
    });

    vi.mocked(normaliserDao)
      .mockResolvedValueOnce({
        markdown: "## Avis d'Appel d'Offres\nContenu AAO.",
        sections: [],
        sourceOcr: false,
      })
      .mockResolvedValueOnce({
        markdown: "## Données Particulières de l'Appel d'Offres\nContenu DPAO.",
        sections: [],
        sourceOcr: false,
      });
    vi.mocked(extraireInformationsAo).mockResolvedValue({
      titre: null,
      acheteur: null,
      secteur: null,
      date_limite: null,
      montant_caution: null,
      sommaire_attendu: [],
      exigences: [],
    });

    await expect(
      traiterDao(supabase, "ao-1", [
        { cheminStockage: "ent-1/appels-offres/ao-1-0-aao.pdf", mimeType: "application/pdf" },
        { cheminStockage: "ent-1/appels-offres/ao-1-1-dpao.pdf", mimeType: "application/pdf" },
      ]),
    ).resolves.toBeUndefined();

    expect(misAJour.at(-1)?.statut_traitement).toBe("termine");
  });

  it("exclut un fichier classé bpu de dao_markdown", async () => {
    const appelOffres = creerAppelOffresBase();
    const { supabase, misAJour } = creerSupabaseFake(appelOffres);

    vi.mocked(normaliserDao)
      .mockResolvedValueOnce({
        markdown: "## Avis d'Appel d'Offres\nContenu AAO.",
        sections: [],
        sourceOcr: false,
      })
      .mockResolvedValueOnce({
        markdown: "## Bordereau des Prix Unitaires\nContenu BPU.",
        sections: [],
        sourceOcr: false,
      });
    vi.mocked(extraireInformationsAo).mockResolvedValue({
      titre: null,
      acheteur: null,
      secteur: null,
      date_limite: null,
      montant_caution: null,
      sommaire_attendu: [],
      exigences: [],
    });

    await traiterDao(supabase, "ao-1", [
      { cheminStockage: "ent-1/appels-offres/ao-1-0-aao.pdf", mimeType: "application/pdf" },
      { cheminStockage: "ent-1/appels-offres/ao-1-1-bpu.pdf", mimeType: "application/pdf" },
    ]);

    const miseAJourMarkdown = misAJour.find((m) => "dao_markdown" in m);
    expect(miseAJourMarkdown?.dao_markdown).not.toContain("Contenu BPU");
  });
});
