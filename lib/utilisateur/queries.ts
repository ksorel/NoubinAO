import { createClient } from "@/lib/supabase/server";

export async function obtenirUtilisateurCourant(): Promise<{
  id: string;
  entreprise_id: string;
  nom: string;
} | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub as string | undefined;

  if (!userId) return null;

  const { data: utilisateur } = await supabase
    .from("utilisateur")
    .select("id, entreprise_id, nom")
    .eq("id", userId)
    .maybeSingle();

  return utilisateur;
}

export async function listerUtilisateurs(
  entrepriseId: string,
): Promise<{ id: string; nom: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("utilisateur")
    .select("id, nom")
    .eq("entreprise_id", entrepriseId)
    .order("nom", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
