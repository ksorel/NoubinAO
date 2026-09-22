"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { obtenirUtilisateurEstSuperAdmin } from "./queries";
import { uploaderBompSchema } from "./schema";
import { mettreEnFileDecoupageBomp } from "./file-attente";

export async function uploaderBomp(
  formData: FormData,
): Promise<{ erreur: string } | { succes: true }> {
  const estSuperAdmin = await obtenirUtilisateurEstSuperAdmin();
  if (!estSuperAdmin) return { erreur: "Non autorisé." };

  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = uploaderBompSchema.safeParse({
    numero: formData.get("numero"),
    datePublication: formData.get("datePublication"),
    fichier: formData.get("fichier"),
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const { numero, datePublication, fichier } = parsed.data;
  const bompNumeroId = randomUUID();
  const nomNettoye = fichier.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const cheminStockage = `${bompNumeroId}-${nomNettoye}`;

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("bomp-national")
    .upload(cheminStockage, fichier, { contentType: "application/pdf" });

  if (erreurUpload) {
    return { erreur: "Échec de l'envoi du fichier. Réessayez." };
  }

  const { error: erreurInsertion } = await supabase.from("bomp_numero").insert({
    id: bompNumeroId,
    numero,
    date_publication: datePublication,
    fichier_path: cheminStockage,
    cree_par: utilisateur.id,
  });

  if (erreurInsertion) {
    await supabase.storage.from("bomp-national").remove([cheminStockage]);
    return { erreur: "Échec de l'enregistrement du BOMP. Réessayez." };
  }

  try {
    await mettreEnFileDecoupageBomp(bompNumeroId);
  } catch {
    await supabase.from("bomp_numero").delete().eq("id", bompNumeroId);
    await supabase.storage.from("bomp-national").remove([cheminStockage]);
    return { erreur: "Échec de la mise en file du traitement. Réessayez." };
  }

  revalidatePath("/admin/veille");
  return { succes: true as const };
}

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
