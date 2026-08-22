import { createClient } from "@/lib/supabase/server";
import type { Document } from "./types";

export async function obtenirUtilisateurCourant() {
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

export async function listerDocuments(entrepriseId: string): Promise<Document[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as Document[];
}
