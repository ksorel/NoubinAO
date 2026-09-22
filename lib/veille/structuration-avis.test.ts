import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./structurer", () => ({
  structurerAvis: vi.fn(),
}));

import { traiterStructurationAvis } from "./structuration-avis";
import { structurerAvis } from "./structurer";
import type { AvisAoNational } from "./types";
import type { AvisStructure } from "./schema";
import type { SupabaseClient } from "@supabase/supabase-js";

function creerAvisBase(overrides: Partial<AvisAoNational> = {}): AvisAoNational {
  return {
    id: "avis-1",
    bomp_numero_id: "bomp-1",
    reference: "T 1364/2026",
    type: null,
    autorite_contractante: null,
    objet: null,
    secteur: null,
    montant_caution: null,
    date_limite_remise_offres: null,
    contact_retrait: null,
    nombre_lots: null,
    texte_brut: "ARTICLE 1 : AUTORITE CONTRACTANTE\nMairie de Ouragahio.",
    cree_le: "2026-09-22T08:00:00.000Z",
    structure_le: null,
    ...overrides,
  };
}

function creerStructureBase(overrides: Partial<AvisStructure> = {}): AvisStructure {
  return {
    type: "travaux",
    autorite_contractante: "Mairie de Ouragahio",
    objet: "Travaux d'extension du réseau électrique",
    secteur: "BTP",
    montant_caution: 2300000,
    date_limite_remise_offres: "2026-10-23",
    contact_retrait: "Direction des marchés, Abidjan — 07 00 00 00 00",
    nombre_lots: 1,
    ...overrides,
  };
}

function creerSupabaseFake(
  avis: AvisAoNational,
  options: {
    // Nombre d'avis du même BOMP qui n'ont PAS encore de structure_le,
    // une fois cet avis-ci écrit.
    avisRestantsApresEcriture?: number;
    echouerMiseAJourAvis?: boolean;
  } = {},
) {
  const misAJourAvis: Record<string, unknown>[] = [];
  const misAJourBomp: Record<string, unknown>[] = [];
  const colonnesComptees: string[] = [];

  const avisTable = {
    select: (_colonnes: string, opts?: { count?: string; head?: boolean }) => {
      // Lecture de l'avis à structurer.
      if (!opts?.count) {
        return {
          eq: () => ({
            maybeSingle: async () => ({ data: { ...avis }, error: null }),
          }),
        };
      }

      // Comptage « reste-t-il des avis non structurés dans ce BOMP ? »
      return {
        eq: () => ({
          is: async (colonne: string) => {
            colonnesComptees.push(colonne);
            return { count: options.avisRestantsApresEcriture ?? 0, error: null };
          },
        }),
      };
    },
    update: (valeurs: Record<string, unknown>) => ({
      eq: async () => {
        if (options.echouerMiseAJourAvis) {
          return { error: { message: "échec simulé de la mise à jour" } };
        }
        misAJourAvis.push(valeurs);
        Object.assign(avis, valeurs);
        return { error: null };
      },
    }),
  };

  const bompTable = {
    update: (valeurs: Record<string, unknown>) => ({
      eq: async () => {
        misAJourBomp.push(valeurs);
        return { error: null };
      },
    }),
  };

  const fake = {
    from: (table: string) => (table === "bomp_numero" ? bompTable : avisTable),
  };

  return {
    supabase: fake as unknown as SupabaseClient,
    misAJourAvis,
    misAJourBomp,
    colonnesComptees,
  };
}

describe("traiterStructurationAvis", () => {
  beforeEach(() => {
    vi.mocked(structurerAvis).mockReset();
  });

  it("écrit les champs structurés renvoyés par Claude sur l'avis", async () => {
    const avis = creerAvisBase();
    const { supabase, misAJourAvis } = creerSupabaseFake(avis);
    vi.mocked(structurerAvis).mockResolvedValue(creerStructureBase());

    await traiterStructurationAvis(supabase, "avis-1");

    expect(misAJourAvis).toHaveLength(1);
    expect(misAJourAvis[0]).toMatchObject({
      type: "travaux",
      autorite_contractante: "Mairie de Ouragahio",
      secteur: "BTP",
      montant_caution: 2300000,
    });
    expect(typeof misAJourAvis[0].structure_le).toBe("string");
  });

  it("fait passer le BOMP à 'termine' quand plus aucun avis n'est à structurer", async () => {
    const avis = creerAvisBase();
    const { supabase, misAJourBomp } = creerSupabaseFake(avis, {
      avisRestantsApresEcriture: 0,
    });
    vi.mocked(structurerAvis).mockResolvedValue(creerStructureBase());

    await traiterStructurationAvis(supabase, "avis-1");

    expect(misAJourBomp).toHaveLength(1);
    expect(misAJourBomp[0].statut).toBe("termine");
    expect(typeof misAJourBomp[0].mis_a_jour_le).toBe("string");
  });

  it("ne touche pas au BOMP tant qu'il reste des avis à structurer", async () => {
    const avis = creerAvisBase();
    const { supabase, misAJourBomp } = creerSupabaseFake(avis, {
      avisRestantsApresEcriture: 3,
    });
    vi.mocked(structurerAvis).mockResolvedValue(creerStructureBase());

    await traiterStructurationAvis(supabase, "avis-1");

    expect(misAJourBomp).toHaveLength(0);
  });

  it("bascule le BOMP à 'termine' même quand le dernier avis est classé type=null", async () => {
    // Régression : `type` est légitimement nullable (Claude peut ne pas
    // savoir classer un avis). Tant que la complétion était déduite de
    // `type is null`, un tel avis restait indistinguable d'un avis jamais
    // traité — le compte ne tombait jamais à 0 et le bulletin entier
    // restait bloqué en 'extraction_en_cours' à vie alors que tout le
    // reste avait réussi. Le marqueur est désormais `structure_le`.
    const avis = creerAvisBase();
    const { supabase, misAJourAvis, misAJourBomp, colonnesComptees } = creerSupabaseFake(
      avis,
      { avisRestantsApresEcriture: 0 },
    );
    vi.mocked(structurerAvis).mockResolvedValue(creerStructureBase({ type: null }));

    await traiterStructurationAvis(supabase, "avis-1");

    // L'avis est bien marqué comme structuré malgré son type null...
    expect(misAJourAvis[0].type).toBeNull();
    expect(typeof misAJourAvis[0].structure_le).toBe("string");
    // ...et c'est structure_le, pas type, qui sert de sentinelle de complétion.
    expect(colonnesComptees).toEqual(["structure_le"]);
    expect(misAJourBomp[0]?.statut).toBe("termine");
  });

  it("relance l'exception si la mise à jour de l'avis échoue, sans toucher au BOMP", async () => {
    const avis = creerAvisBase();
    const { supabase, misAJourBomp } = creerSupabaseFake(avis, {
      echouerMiseAJourAvis: true,
    });
    vi.mocked(structurerAvis).mockResolvedValue(creerStructureBase());

    await expect(traiterStructurationAvis(supabase, "avis-1")).rejects.toThrow(
      "Échec de la mise à jour de l'avis",
    );

    expect(misAJourBomp).toHaveLength(0);
  });

  it("lève une erreur explicite si l'avis est introuvable", async () => {
    const fake = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    } as unknown as SupabaseClient;

    await expect(traiterStructurationAvis(fake, "avis-inconnu")).rejects.toThrow(
      "Avis introuvable",
    );
    expect(structurerAvis).not.toHaveBeenCalled();
  });
});
