"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "./queries";
import {
  modifierProfilEntrepriseSchema,
  creerInvitationSchema,
  rejoindreEntrepriseSchema,
} from "./schema";
import { construireLienInvitation } from "./lien-invitation";
import type { Invitation } from "./types";

export async function modifierProfilEntreprise(input: {
  nom: string;
  rccm: string | null;
  adresse: string | null;
  representantLegalNom: string | null;
  representantLegalQualite: string | null;
  idu: string | null;
  telephone: string | null;
  email: string | null;
  secteursActivite: string[];
}): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };
  if (utilisateur.role !== "admin") {
    return { erreur: "Réservé aux administrateurs." };
  }

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
      telephone: parsed.data.telephone,
      email: parsed.data.email,
      secteurs_activite: parsed.data.secteursActivite,
    })
    .eq("id", utilisateur.entreprise_id);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath("/parametres");
  return { succes: true as const };
}

export async function creerInvitation(
  input: { role: string },
): Promise<{ erreur: string } | { succes: true; lien: string; invitation: Invitation }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };
  if (utilisateur.role !== "admin") {
    return { erreur: "Réservé aux administrateurs." };
  }

  const parsed = creerInvitationSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const token = randomUUID();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitation_equipe")
    .insert({
      entreprise_id: utilisateur.entreprise_id,
      token,
      role: parsed.data.role,
      cree_par: utilisateur.id,
    })
    .select("id, role, expire_at")
    .single();

  if (error || !data) {
    return { erreur: "Échec de la création de l'invitation. Réessayez." };
  }

  revalidatePath("/parametres");
  return {
    succes: true as const,
    lien: construireLienInvitation(token),
    invitation: data as Invitation,
  };
}

export async function revoquerInvitation(
  id: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };
  if (utilisateur.role !== "admin") {
    return { erreur: "Réservé aux administrateurs." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("invitation_equipe")
    .update({ statut: "revoquee" })
    .eq("id", id)
    .eq("entreprise_id", utilisateur.entreprise_id)
    .eq("statut", "en_attente");

  if (error) return { erreur: "Échec de la révocation. Réessayez." };

  revalidatePath("/parametres");
  return { succes: true as const };
}

export async function rejoindreEntreprise(
  formData: FormData,
): Promise<{ erreur: string } | undefined> {
  const parsed = rejoindreEntrepriseSchema.safeParse({
    token: formData.get("token"),
    nom: formData.get("nom"),
  });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("rejoindre_entreprise", {
    p_token: parsed.data.token,
    p_nom: parsed.data.nom,
  });

  if (error) {
    if (error.message === "utilisateur_deja_rattache") {
      return { erreur: "Vous êtes déjà rattaché à une entreprise." };
    }
    return { erreur: "Ce lien d'invitation est invalide ou a expiré." };
  }

  revalidatePath("/accueil", "layout");
  redirect("/accueil");
}
