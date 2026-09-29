"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";

export async function importerAvis(
  avisId: string,
): Promise<{ erreur: string } | { succes: true; appelOffresId: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("importer_avis_national", {
    p_avis_id: avisId,
    p_entreprise_id: utilisateur.entreprise_id,
    p_utilisateur_id: utilisateur.id,
  });

  // Code Postgres 23505 = violation de contrainte unique
  // (avis_id, entreprise_id) : déjà importé (double-clic, autre onglet).
  if (error?.code === "23505") {
    return { erreur: "Cet avis a déjà été importé." };
  }

  if (error || !data) {
    return { erreur: "Échec de l'import. Réessayez." };
  }

  revalidatePath("/veille");
  revalidatePath("/appels-offres");
  return { succes: true as const, appelOffresId: data as string };
}
