"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "./queries";
import { modifierProfilEntrepriseSchema } from "./schema";

export async function modifierProfilEntreprise(input: {
  nom: string;
  rccm: string | null;
  adresse: string | null;
  representantLegalNom: string | null;
  representantLegalQualite: string | null;
  idu: string | null;
}): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = modifierProfilEntrepriseSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("entreprise")
    .update({
      nom: parsed.data.nom,
      rccm: parsed.data.rccm,
      adresse: parsed.data.adresse,
      representant_legal_nom: parsed.data.representantLegalNom,
      representant_legal_qualite: parsed.data.representantLegalQualite,
      idu: parsed.data.idu,
    })
    .eq("id", utilisateur.entreprise_id);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath("/parametres");
  return { succes: true as const };
}
