import { createClient } from "@/lib/supabase/server";
import type { Email, StatutCompteEmail } from "./types";

export async function obtenirCompteEmailConnecte(
  utilisateurId: string,
): Promise<
  { adresseEmail: string; statut: StatutCompteEmail; dernierSyncLe: string | null } | null
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("compte_email_connecte")
    .select("adresse_email, statut, dernier_sync_le")
    .eq("utilisateur_id", utilisateurId)
    .eq("fournisseur", "gmail")
    .maybeSingle();

  if (!data) return null;
  return {
    adresseEmail: data.adresse_email,
    statut: data.statut,
    dernierSyncLe: data.dernier_sync_le,
  };
}

export async function listerEmailsLies(appelOffresId: string): Promise<Email[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .order("recu_le", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Email[];
}

export async function listerEmailsNonLies(utilisateurId: string): Promise<Email[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email")
    .select("*")
    .eq("utilisateur_id", utilisateurId)
    .is("appel_offres_id", null)
    .order("recu_le", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Email[];
}
