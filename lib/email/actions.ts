"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { creerClientOAuth } from "./gmail-oauth";
import { dechiffrer } from "./chiffrement";

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
