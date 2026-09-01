"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { televerserDaoSchema } from "./schema";
import { construireCheminStockageDao } from "./storage-path";
import { mettreEnFileTraitementDao } from "./file-attente";

export async function televerserDao(
  formData: FormData,
): Promise<{ erreur: string } | { succes: true; appelOffresId: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = televerserDaoSchema.safeParse({
    fichier: formData.get("fichier"),
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Fichier invalide" };
  }

  const { fichier } = parsed.data;
  const appelOffresId = randomUUID();
  const cheminStockage = construireCheminStockageDao(
    utilisateur.entreprise_id,
    appelOffresId,
    fichier.name,
  );

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, fichier, { contentType: fichier.type });

  if (erreurUpload) {
    return { erreur: "Échec de l'envoi du fichier. Réessayez." };
  }

  const { error: erreurInsertion } = await supabase.from("appel_offres").insert({
    id: appelOffresId,
    entreprise_id: utilisateur.entreprise_id,
    fichier_dao_path: cheminStockage,
    fichier_dao_nom_original: fichier.name,
    created_by: utilisateur.id,
  });

  if (erreurInsertion) {
    await supabase.storage.from("documents").remove([cheminStockage]);
    return { erreur: "Échec de l'enregistrement de l'appel d'offres. Réessayez." };
  }

  try {
    await mettreEnFileTraitementDao(appelOffresId, fichier.type);
  } catch {
    await supabase.from("appel_offres").delete().eq("id", appelOffresId);
    await supabase.storage.from("documents").remove([cheminStockage]);
    return { erreur: "Échec de la mise en file du traitement. Réessayez." };
  }

  return { succes: true as const, appelOffresId };
}
