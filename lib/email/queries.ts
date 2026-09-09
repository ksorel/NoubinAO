import { createClient } from "@/lib/supabase/server";
import type { StatutCompteEmail } from "./types";

export async function obtenirCompteEmailConnecte(
  utilisateurId: string,
): Promise<{ adresseEmail: string; statut: StatutCompteEmail } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("compte_email_connecte")
    .select("adresse_email, statut")
    .eq("utilisateur_id", utilisateurId)
    .eq("fournisseur", "gmail")
    .maybeSingle();

  if (!data) return null;
  return { adresseEmail: data.adresse_email, statut: data.statut };
}
