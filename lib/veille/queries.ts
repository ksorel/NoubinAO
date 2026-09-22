import { createClient } from "@/lib/supabase/server";
import type { AvisAoNational, BompNumero } from "./types";

export async function obtenirUtilisateurEstSuperAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub as string | undefined;
  if (!userId) return false;

  const { data } = await supabase
    .from("utilisateur")
    .select("super_admin")
    .eq("id", userId)
    .maybeSingle();

  return data?.super_admin ?? false;
}

export async function listerAvisNational(): Promise<AvisAoNational[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("avis_ao_national")
    .select("*")
    .order("date_limite_remise_offres", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as AvisAoNational[];
}

export async function listerImportationsEntreprise(entrepriseId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("avis_ao_national_importation")
    .select("avis_id")
    .eq("entreprise_id", entrepriseId);

  if (error) throw error;
  return new Set((data ?? []).map((ligne) => ligne.avis_id as string));
}

export async function listerBompNumeros(): Promise<BompNumero[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bomp_numero")
    .select("*")
    .order("date_publication", { ascending: false });

  if (error) throw error;
  return (data ?? []) as BompNumero[];
}
