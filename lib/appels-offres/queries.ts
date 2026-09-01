import { createClient } from "@/lib/supabase/server";
import type { AppelOffres } from "./types";

export async function listerAppelsOffres(
  entrepriseId: string,
): Promise<AppelOffres[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appel_offres")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as AppelOffres[];
}
