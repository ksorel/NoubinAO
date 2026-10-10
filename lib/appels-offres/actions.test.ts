import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/utilisateur/queries", () => ({
  obtenirUtilisateurCourant: vi.fn().mockResolvedValue({
    id: "user-1",
    entreprise_id: "ent-1",
    nom: "Utilisateur Test",
    role: "membre",
  }),
}));

const creerClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => creerClientMock(),
}));

import { modifierStatutPipeline } from "./actions";

// Fake Supabase minimal, construit sur le même principe que
// `creerSupabaseFake` dans ./traitement.test.ts : seule la table
// `appel_offres` et la méthode `.update().eq().select()` effectivement
// exercées par `modifierStatutPipeline` sont modélisées.
function creerSupabaseFake() {
  const appelsMisAJour: Record<string, unknown>[] = [];

  const fake = {
    from: () => ({
      update: (valeurs: Record<string, unknown>) => ({
        eq: () => ({
          select: async () => {
            appelsMisAJour.push(valeurs);
            return { data: [{ id: "ao-1" }], error: null };
          },
        }),
      }),
    }),
  };

  return { supabase: fake as unknown as SupabaseClient, appelsMisAJour };
}

describe("modifierStatutPipeline", () => {
  it("omet raison_resultat et note_resultat du payload UPDATE quand appelé avec 2 arguments (bouton Passer)", async () => {
    const { supabase, appelsMisAJour } = creerSupabaseFake();
    creerClientMock.mockResolvedValue(supabase);

    const reponse = await modifierStatutPipeline("ao-1", "perdu");

    expect("erreur" in reponse).toBe(false);
    expect(appelsMisAJour).toHaveLength(1);
    const payload = appelsMisAJour[0];
    expect(Object.keys(payload)).not.toContain("raison_resultat");
    expect(Object.keys(payload)).not.toContain("note_resultat");
    expect(payload.statut_pipeline).toBe("perdu");
  });

  it("inclut raison_resultat et note_resultat dans le payload UPDATE quand appelé avec 4 arguments (dialogue Enregistrer)", async () => {
    const { supabase, appelsMisAJour } = creerSupabaseFake();
    creerClientMock.mockResolvedValue(supabase);

    const reponse = await modifierStatutPipeline(
      "ao-1",
      "perdu",
      "prix_trop_eleve",
      "Concurrent moins cher",
    );

    expect("erreur" in reponse).toBe(false);
    expect(appelsMisAJour).toHaveLength(1);
    const payload = appelsMisAJour[0];
    expect(payload.statut_pipeline).toBe("perdu");
    expect(payload.raison_resultat).toBe("prix_trop_eleve");
    expect(payload.note_resultat).toBe("Concurrent moins cher");
  });
});
