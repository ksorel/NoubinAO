"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { documentUploadSchema } from "./schema";
import { construireCheminStockage } from "./storage-path";
import { obtenirUtilisateurCourant } from "./queries";

export async function ajouterDocument(formData: FormData) {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = documentUploadSchema.safeParse({
    type: formData.get("type"),
    nom: formData.get("nom"),
    dateExpiration: formData.get("dateExpiration") || null,
    fichier: formData.get("fichier"),
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const { type, nom, dateExpiration, fichier } = parsed.data;
  const documentId = randomUUID();
  const cheminStockage = construireCheminStockage(
    utilisateur.entreprise_id,
    documentId,
    fichier.name,
  );

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, fichier, { contentType: fichier.type });

  if (erreurUpload) {
    return { erreur: "Échec de l'envoi du fichier. Réessayez." };
  }

  const { error: erreurInsertion } = await supabase.from("document").insert({
    id: documentId,
    entreprise_id: utilisateur.entreprise_id,
    type,
    nom,
    fichier_path: cheminStockage,
    fichier_nom_original: fichier.name,
    mime_type: fichier.type,
    taille_octets: fichier.size,
    date_expiration: dateExpiration ?? null,
    created_by: utilisateur.id,
  });

  if (erreurInsertion) {
    await supabase.storage.from("documents").remove([cheminStockage]);
    return { erreur: "Échec de l'enregistrement du document. Réessayez." };
  }

  revalidatePath("/bibliotheque");
  return { succes: true as const };
}

export async function supprimerDocument(documentId: string, cheminStockage: string) {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { error: erreurSuppression } = await supabase
    .from("document")
    .delete()
    .eq("id", documentId);

  if (erreurSuppression) {
    return { erreur: "Échec de la suppression. Réessayez." };
  }

  await supabase.storage.from("documents").remove([cheminStockage]);

  revalidatePath("/bibliotheque");
  return { succes: true as const };
}

export async function genererUrlTelechargement(cheminStockage: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(cheminStockage, 60);

  if (error || !data) return { erreur: "Impossible de générer le lien." };
  return { url: data.signedUrl };
}
