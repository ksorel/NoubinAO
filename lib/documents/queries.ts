import { createClient } from "@/lib/supabase/server";
import type { Document } from "./types";

export { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";

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
