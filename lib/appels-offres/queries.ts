import { createClient } from "@/lib/supabase/server";
import type { AppelOffres, ExigenceAo } from "./types";

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

export async function obtenirAppelOffres(
  id: string,
  entrepriseId: string,
): Promise<{ appelOffres: AppelOffres; exigences: ExigenceAo[] } | null> {
  const supabase = await createClient();

  const { data: appelOffres, error: erreurAppelOffres } = await supabase
    .from("appel_offres")
    .select("*")
    .eq("id", id)
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (erreurAppelOffres || !appelOffres) return null;

  const { data: exigences, error: erreurExigences } = await supabase
    .from("exigence_ao")
    .select("*")
    .eq("appel_offres_id", id)
    .order("created_at", { ascending: true });

  if (erreurExigences) throw erreurExigences;

  return {
    appelOffres: appelOffres as AppelOffres,
    exigences: (exigences ?? []) as ExigenceAo[],
  };
}
