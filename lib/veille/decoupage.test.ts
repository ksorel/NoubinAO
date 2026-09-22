import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/appels-offres/normalisation/pdf", () => ({
  extrairePagesPdf: vi.fn(),
}));
vi.mock("./chunking", () => ({
  decouperEnAvis: vi.fn(),
}));
vi.mock("./file-attente", () => ({
  mettreEnFileStructurationAvis: vi.fn(),
}));

import { traiterDecoupageBomp } from "./decoupage";
import { extrairePagesPdf } from "@/lib/appels-offres/normalisation/pdf";
import { decouperEnAvis } from "./chunking";
import { mettreEnFileStructurationAvis } from "./file-attente";
import type { BompNumero } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

function creerBompNumeroBase(overrides: Partial<BompNumero> = {}): BompNumero {
  return {
    id: "bomp-1",
    numero: "1896",
    date_publication: "2026-09-22",
    fichier_path: "bomp-1-bulletin.pdf",
    statut: "en_attente",
    nombre_avis_extraits: 0,
    erreur_message: null,
    cree_par: "user-1",
    cree_le: "2026-09-22T08:00:00.000Z",
    mis_a_jour_le: "2026-09-22T08:00:00.000Z",
    ...overrides,
  };
}

function creerSupabaseFake(
  bompNumero: BompNumero,
  options: { echouerInsertionAvis?: boolean } = {},
) {
  const misAJourBomp: Record<string, unknown>[] = [];
  const avisInseres: Record<string, unknown>[][] = [];
  const telechargements: string[] = [];

  // Un update Supabase se termine soit par un await direct après .eq(),
  // soit par un .select() (le patron « cette écriture a-t-elle touché une
  // ligne ? »). Le builder est donc à la fois chaînable et thenable.
  function builderUpdate(valeurs: Record<string, unknown>) {
    const filtres: Record<string, unknown> = {};

    const appliquer = () => {
      // Transition conditionnelle : la mise à jour ne s'applique que si le
      // statut courant correspond au filtre demandé.
      if (filtres.statut !== undefined && bompNumero.statut !== filtres.statut) {
        return [];
      }
      misAJourBomp.push(valeurs);
      Object.assign(bompNumero, valeurs);
      return [{ id: bompNumero.id }];
    };

    const builder = {
      eq(colonne: string, valeur: unknown) {
        filtres[colonne] = valeur;
        return builder;
      },
      select: async () => ({ data: appliquer(), error: null }),
      then: (resoudre: (v: { error: null }) => unknown) => {
        appliquer();
        return Promise.resolve({ error: null }).then(resoudre);
      },
    };

    return builder;
  }

  const bompTable = {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { ...bompNumero }, error: null }),
      }),
    }),
    update: builderUpdate,
  };

  const avisTable = {
    insert: (lignes: Record<string, unknown>[]) => ({
      select: async () => {
        if (options.echouerInsertionAvis) {
          return { data: null, error: { message: "échec simulé de l'insertion" } };
        }
        avisInseres.push(lignes);
        return {
          data: lignes.map((_, i) => ({ id: `avis-${i + 1}` })),
          error: null,
        };
      },
    }),
  };

  const fake = {
    from: (table: string) => (table === "bomp_numero" ? bompTable : avisTable),
    storage: {
      from: () => ({
        download: async (chemin: string) => {
          telechargements.push(chemin);
          return {
            data: { arrayBuffer: async () => new TextEncoder().encode("pdf").buffer },
            error: null,
          };
        },
      }),
    },
  };

  return {
    supabase: fake as unknown as SupabaseClient,
    misAJourBomp,
    avisInseres,
    telechargements,
  };
}

describe("traiterDecoupageBomp", () => {
  beforeEach(() => {
    vi.mocked(extrairePagesPdf).mockReset();
    vi.mocked(decouperEnAvis).mockReset();
    vi.mocked(mettreEnFileStructurationAvis).mockReset();
    vi.mocked(mettreEnFileStructurationAvis).mockResolvedValue(undefined);
  });

  it("découpe le BOMP, insère un avis par bloc et met un job de structuration en file", async () => {
    const bomp = creerBompNumeroBase();
    const { supabase, misAJourBomp, avisInseres } = creerSupabaseFake(bomp);

    vi.mocked(extrairePagesPdf).mockResolvedValue([
      { numero: 1, texte: "ARTICLE 1 : AUTORITE CONTRACTANTE ...", ocr: false },
    ]);
    vi.mocked(decouperEnAvis).mockReturnValue([
      { reference: "T 1364/2026", texteBrut: "bloc 1" },
      { reference: "T 1365/2026", texteBrut: "bloc 2" },
    ]);

    await traiterDecoupageBomp(supabase, "bomp-1");

    expect(avisInseres).toHaveLength(1);
    expect(avisInseres[0]).toHaveLength(2);
    expect(misAJourBomp.some((m) => m.statut === "extraction_en_cours")).toBe(true);
    expect(misAJourBomp.some((m) => m.nombre_avis_extraits === 2)).toBe(true);
    expect(mettreEnFileStructurationAvis).toHaveBeenCalledTimes(2);
  });

  it("plafonne l'OCR de repli : le BOMP est du PDF texte, pas un scan", async () => {
    // Sans plafond, chaque page quasi vide d'un bulletin de 240 pages
    // déclenche un appel Claude vision facturé et séquentiel — coût non
    // borné et cause probable du dépassement des 60 s de la fonction.
    const bomp = creerBompNumeroBase();
    const { supabase } = creerSupabaseFake(bomp);

    vi.mocked(extrairePagesPdf).mockResolvedValue([
      { numero: 1, texte: "ARTICLE 1 ...", ocr: false },
    ]);
    vi.mocked(decouperEnAvis).mockReturnValue([
      { reference: "T 1364/2026", texteBrut: "bloc 1" },
    ]);

    await traiterDecoupageBomp(supabase, "bomp-1");

    expect(vi.mocked(extrairePagesPdf).mock.calls[0][1]).toBe(5);
  });

  it("ne retraite pas un BOMP déjà en cours d'extraction (idempotence face aux retries QStash)", async () => {
    // Sans cette garde, un retry QStash ré-insère un jeu COMPLET d'avis
    // (aucune contrainte d'unicité ne l'empêche) puis republie autant de
    // jobs de structuration — donc autant d'appels Claude facturés.
    const bomp = creerBompNumeroBase({ statut: "extraction_en_cours" });
    const { supabase, misAJourBomp, avisInseres, telechargements } =
      creerSupabaseFake(bomp);

    await traiterDecoupageBomp(supabase, "bomp-1");

    expect(telechargements).toHaveLength(0);
    expect(extrairePagesPdf).not.toHaveBeenCalled();
    expect(decouperEnAvis).not.toHaveBeenCalled();
    expect(avisInseres).toHaveLength(0);
    expect(mettreEnFileStructurationAvis).not.toHaveBeenCalled();
    expect(misAJourBomp).toHaveLength(0);
  });

  it("ne retraite pas un BOMP déjà terminé", async () => {
    const bomp = creerBompNumeroBase({ statut: "termine", nombre_avis_extraits: 40 });
    const { supabase, avisInseres } = creerSupabaseFake(bomp);

    await traiterDecoupageBomp(supabase, "bomp-1");

    expect(extrairePagesPdf).not.toHaveBeenCalled();
    expect(avisInseres).toHaveLength(0);
  });

  it("écrit statut='erreur' et relance l'exception si aucun avis n'est reconnu", async () => {
    const bomp = creerBompNumeroBase();
    const { supabase, misAJourBomp } = creerSupabaseFake(bomp);

    vi.mocked(extrairePagesPdf).mockResolvedValue([
      { numero: 1, texte: "Document sans structure reconnue.", ocr: false },
    ]);
    vi.mocked(decouperEnAvis).mockReturnValue([]);

    await expect(traiterDecoupageBomp(supabase, "bomp-1")).rejects.toThrow(
      "Aucun avis reconnu",
    );

    const derniere = misAJourBomp.at(-1);
    expect(derniere?.statut).toBe("erreur");
    expect(String(derniere?.erreur_message)).toContain("Aucun avis reconnu");
    expect(mettreEnFileStructurationAvis).not.toHaveBeenCalled();
  });

  it("écrit statut='erreur' si l'insertion des avis échoue", async () => {
    const bomp = creerBompNumeroBase();
    const { supabase, misAJourBomp } = creerSupabaseFake(bomp, {
      echouerInsertionAvis: true,
    });

    vi.mocked(extrairePagesPdf).mockResolvedValue([
      { numero: 1, texte: "ARTICLE 1 ...", ocr: false },
    ]);
    vi.mocked(decouperEnAvis).mockReturnValue([
      { reference: "T 1364/2026", texteBrut: "bloc 1" },
    ]);

    await expect(traiterDecoupageBomp(supabase, "bomp-1")).rejects.toThrow(
      "Échec de l'insertion des avis",
    );

    expect(misAJourBomp.at(-1)?.statut).toBe("erreur");
  });

  it("horodate mis_a_jour_le à chaque écriture de statut (détection d'un traitement mort)", async () => {
    const bomp = creerBompNumeroBase();
    const { supabase, misAJourBomp } = creerSupabaseFake(bomp);

    vi.mocked(extrairePagesPdf).mockResolvedValue([
      { numero: 1, texte: "ARTICLE 1 ...", ocr: false },
    ]);
    vi.mocked(decouperEnAvis).mockReturnValue([
      { reference: "T 1364/2026", texteBrut: "bloc 1" },
    ]);

    await traiterDecoupageBomp(supabase, "bomp-1");

    expect(misAJourBomp.every((m) => typeof m.mis_a_jour_le === "string")).toBe(true);
  });

  it("lève une erreur explicite si le BOMP est introuvable", async () => {
    const fake = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    } as unknown as SupabaseClient;

    await expect(traiterDecoupageBomp(fake, "bomp-inconnu")).rejects.toThrow(
      "BOMP introuvable",
    );
  });
});
