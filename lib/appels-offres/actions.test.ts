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

vi.mock("@/lib/abonnement/quota", () => ({
  verifierQuotaDisponible: vi.fn(),
}));

import { verifierQuotaDisponible } from "@/lib/abonnement/quota";
import {
  modifierStatutPipeline,
  finaliserTeleversementDao,
  demarrerTeleversementDao,
} from "./actions";

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

describe("demarrerTeleversementDao", () => {
  it("refuse et ne demande aucune URL signée quand le quota mensuel est atteint", async () => {
    vi.mocked(verifierQuotaDisponible).mockResolvedValue({
      autorise: false,
      utilise: 60,
      quota: 60,
    });
    const createSignedUploadUrlSpy = vi.fn();
    creerClientMock.mockResolvedValue({
      storage: {
        from: () => ({ createSignedUploadUrl: createSignedUploadUrlSpy }),
      },
    } as unknown as SupabaseClient);

    const reponse = await demarrerTeleversementDao([
      { nomOriginal: "dao.pdf", mimeType: "application/pdf" },
    ]);

    expect(reponse).toEqual({
      erreur: "Quota mensuel atteint (60/60 AO traités). Contactez-nous pour augmenter votre palier.",
    });
    expect(createSignedUploadUrlSpy).not.toHaveBeenCalled();
  });

  it("renvoie une erreur propre et ne plante pas quand la vérification du quota échoue", async () => {
    vi.mocked(verifierQuotaDisponible).mockRejectedValue(new Error("boom"));
    const createSignedUploadUrlSpy = vi.fn();
    creerClientMock.mockResolvedValue({
      storage: {
        from: () => ({ createSignedUploadUrl: createSignedUploadUrlSpy }),
      },
    } as unknown as SupabaseClient);

    const reponse = await demarrerTeleversementDao([
      { nomOriginal: "dao.pdf", mimeType: "application/pdf" },
    ]);

    expect(reponse).toEqual({ erreur: "Échec de la vérification du quota. Réessayez." });
    expect(createSignedUploadUrlSpy).not.toHaveBeenCalled();
  });
});

describe("finaliserTeleversementDao", () => {
  it("refuse, nettoie les fichiers déjà envoyés et n'insère rien quand le quota mensuel est atteint", async () => {
    vi.mocked(verifierQuotaDisponible).mockResolvedValue({
      autorise: false,
      utilise: 60,
      quota: 60,
    });
    const insertSpy = vi.fn();
    const removeSpy = vi.fn().mockResolvedValue({ error: null });
    creerClientMock.mockResolvedValue({
      from: () => ({ insert: insertSpy }),
      storage: {
        from: () => ({ remove: removeSpy }),
      },
    } as unknown as SupabaseClient);

    const reponse = await finaliserTeleversementDao("ao-1", [
      { nomOriginal: "dao.pdf", mimeType: "application/pdf" },
    ]);

    expect(reponse).toEqual({
      erreur: "Quota mensuel atteint (60/60 AO traités). Contactez-nous pour augmenter votre palier.",
    });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith(["ent-1/appels-offres/ao-1-0-dao.pdf"]);
  });

  it("renvoie une erreur propre et ne plante pas quand la vérification du quota échoue", async () => {
    vi.mocked(verifierQuotaDisponible).mockRejectedValue(new Error("boom"));
    const insertSpy = vi.fn();
    const removeSpy = vi.fn().mockResolvedValue({ error: null });
    creerClientMock.mockResolvedValue({
      from: () => ({ insert: insertSpy }),
      storage: {
        from: () => ({ remove: removeSpy }),
      },
    } as unknown as SupabaseClient);

    const reponse = await finaliserTeleversementDao("ao-1", [
      { nomOriginal: "dao.pdf", mimeType: "application/pdf" },
    ]);

    expect(reponse).toEqual({ erreur: "Échec de la vérification du quota. Réessayez." });
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
