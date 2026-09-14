"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { creerClientOAuth } from "./gmail-oauth";
import { dechiffrer } from "./chiffrement";
import { synchroniserCompteEmail } from "./gmail-sync";

export async function deconnecterCompteEmail(): Promise<
  { erreur: string } | { succes: true }
> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { data: compte } = await supabase
    .from("compte_email_connecte")
    .select("refresh_token_chiffre")
    .eq("utilisateur_id", utilisateur.id)
    .eq("fournisseur", "gmail")
    .maybeSingle();

  if (compte) {
    // Révocation côté Google en best-effort : la ligne locale doit être
    // supprimée même si Google est indisponible ou renvoie une erreur,
    // sinon l'utilisateur reste bloqué avec une connexion qu'il ne peut
    // plus retirer depuis l'interface.
    try {
      const client = creerClientOAuth();
      await client.revokeToken(dechiffrer(compte.refresh_token_chiffre));
    } catch {
      // ignoré délibérément, voir commentaire ci-dessus
    }
  }

  const { error } = await supabase
    .from("compte_email_connecte")
    .delete()
    .eq("utilisateur_id", utilisateur.id)
    .eq("fournisseur", "gmail");

  if (error) return { erreur: "Échec de la déconnexion. Réessayez." };

  revalidatePath("/parametres");
  return { succes: true as const };
}

export async function synchroniserMaintenant(): Promise<
  { erreur: string } | { messagesSynchronises: number }
> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { data: compte } = await supabase
    .from("compte_email_connecte")
    .select("id, utilisateur_id, entreprise_id, refresh_token_chiffre, dernier_sync_le")
    .eq("utilisateur_id", utilisateur.id)
    .eq("fournisseur", "gmail")
    .maybeSingle();

  if (!compte) return { erreur: "Aucun compte Gmail connecté." };

  const resultat = await synchroniserCompteEmail(supabase, compte);

  if ("erreur" in resultat) {
    await supabase
      .from("compte_email_connecte")
      .update({ statut: "erreur" })
      .eq("id", compte.id);
    return resultat;
  }

  revalidatePath("/parametres");
  return resultat;
}

export async function lierEmailAAppelOffres(
  appelOffresId: string,
  emailId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  // Vérifier que l'appel d'offres appartient à l'entreprise de l'utilisateur,
  // pour éviter qu'un utilisateur authentifié puisse rattacher son email à un
  // AO d'une autre entreprise.
  const { data: ao } = await supabase
    .from("appel_offres")
    .select("id")
    .eq("id", appelOffresId)
    .eq("entreprise_id", utilisateur.entreprise_id)
    .maybeSingle();

  if (!ao) {
    return { erreur: "Appel d'offres introuvable." };
  }

  // .select("id") force la requête à renvoyer les lignes réellement
  // modifiées — même défense en profondeur que modifierStatutPipeline
  // (lib/appels-offres/actions.ts) : sans elle, un emailId périmé ou déjà
  // rattaché ailleurs renverrait {succes: true} sans qu'aucune ligne
  // n'ait été modifiée. La policy email_update_self garantit déjà que
  // seul le propriétaire peut modifier CET email ; ce filtre supplémentaire
  // (utilisateur_id) est une seconde barrière explicite, pas la seule.
  const { data, error } = await supabase
    .from("email")
    .update({ appel_offres_id: appelOffresId })
    .eq("id", emailId)
    .eq("utilisateur_id", utilisateur.id)
    .select("id");

  if (error) return { erreur: "Échec du rattachement. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Email introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function delierEmailAppelOffres(
  appelOffresId: string,
  emailId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("email")
    .update({ appel_offres_id: null })
    .eq("id", emailId)
    .eq("utilisateur_id", utilisateur.id)
    .select("id");

  if (error) return { erreur: "Échec de la dissociation. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Email introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}
