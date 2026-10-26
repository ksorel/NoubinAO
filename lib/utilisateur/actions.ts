"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "./queries";
import { poserCookieEntrepriseActive } from "./entreprise-active-cookie";
import {
  modifierProfilEntrepriseSchema,
  creerInvitationSchema,
  rejoindreEntrepriseSchema,
  changerEntrepriseActiveSchema,
  entetePiedPageSchema,
  televerserLogoSchema,
} from "./schema";
import { construireLienInvitation } from "./lien-invitation";
import { construireCheminStockageLogo } from "./storage-path";
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
  regimeFiscal: string | null;
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
      regime_fiscal: parsed.data.regimeFiscal,
    })
    .eq("id", utilisateur.entreprise_id);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath("/parametres");
  return { succes: true as const };
}

export async function modifierEnTetePiedPage(input: {
  enteteGauche: string | null;
  enteteCentre: string | null;
  enteteDroite: string | null;
  piedGauche: string | null;
  piedCentre: string | null;
  piedDroite: string | null;
}): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };
  if (utilisateur.role !== "admin") {
    return { erreur: "Réservé aux administrateurs." };
  }

  const parsed = entetePiedPageSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("entreprise")
    .update({
      entete_gauche: parsed.data.enteteGauche,
      entete_centre: parsed.data.enteteCentre,
      entete_droite: parsed.data.enteteDroite,
      pied_gauche: parsed.data.piedGauche,
      pied_centre: parsed.data.piedCentre,
      pied_droite: parsed.data.piedDroite,
    })
    .eq("id", utilisateur.entreprise_id);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath("/parametres");
  return { succes: true as const };
}

export async function televerserLogoEntreprise(
  formData: FormData,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };
  if (utilisateur.role !== "admin") {
    return { erreur: "Réservé aux administrateurs." };
  }

  const parsed = televerserLogoSchema.safeParse({ fichier: formData.get("fichier") });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Fichier invalide" };
  }

  const { fichier } = parsed.data;
  const cheminStockage = construireCheminStockageLogo(utilisateur.entreprise_id, fichier.name);

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, fichier, { contentType: fichier.type, upsert: true });

  if (erreurUpload) {
    return { erreur: "Échec de l'envoi du logo. Réessayez." };
  }

  const { error: erreurMiseAJour } = await supabase
    .from("entreprise")
    .update({
      logo_path: cheminStockage,
      logo_nom_original: fichier.name,
      logo_mime_type: fichier.type,
    })
    .eq("id", utilisateur.entreprise_id);

  if (erreurMiseAJour) {
    await supabase.storage.from("documents").remove([cheminStockage]);
    return { erreur: "Échec de l'enregistrement du logo. Réessayez." };
  }

  revalidatePath("/parametres");
  return { succes: true as const };
}

export async function retirerLogoEntreprise(
  cheminStockage: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };
  if (utilisateur.role !== "admin") {
    return { erreur: "Réservé aux administrateurs." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("entreprise")
    .update({ logo_path: null, logo_nom_original: null, logo_mime_type: null })
    .eq("id", utilisateur.entreprise_id);

  if (error) return { erreur: "Échec de la suppression. Réessayez." };

  await supabase.storage.from("documents").remove([cheminStockage]);

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
  const { data, error } = await supabase.rpc("rejoindre_entreprise", {
    p_token: parsed.data.token,
    p_nom: parsed.data.nom,
  });

  if (error) {
    if (error.message === "deja_membre_de_cette_entreprise") {
      return { erreur: "Vous êtes déjà membre de cette entreprise." };
    }
    return { erreur: "Ce lien d'invitation est invalide ou a expiré." };
  }

  if (data) {
    await poserCookieEntrepriseActive(data);
  }

  revalidatePath("/accueil", "layout");
  redirect("/accueil");
}

export async function changerEntrepriseActive(
  entrepriseId: string,
): Promise<{ erreur: string } | undefined> {
  const parsed = changerEntrepriseActiveSchema.safeParse({ entrepriseId });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Entreprise invalide" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const authId = authData?.claims?.sub as string | undefined;
  if (!authId) return { erreur: "Non authentifié" };

  const { data: membership } = await supabase
    .from("utilisateur")
    .select("id")
    .eq("auth_id", authId)
    .eq("entreprise_id", parsed.data.entrepriseId)
    .maybeSingle();

  if (!membership) {
    return { erreur: "Vous n'êtes pas membre de cette entreprise." };
  }

  await poserCookieEntrepriseActive(parsed.data.entrepriseId);

  revalidatePath("/", "layout");
  redirect("/accueil");
}
