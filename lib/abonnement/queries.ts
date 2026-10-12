import { createClient } from "@/lib/supabase/server";
import { compterAoTraitesCeMois } from "./quota";
import type { Abonnement } from "./types";

export async function obtenirAbonnementAvecUsage(
  entrepriseId: string,
): Promise<{ abonnement: Abonnement; utilise: number } | null> {
  const supabase = await createClient();

  const { data: abonnement } = await supabase
    .from("abonnement")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (!abonnement) return null;

  const utilise = await compterAoTraitesCeMois(supabase, entrepriseId);

  return { abonnement: abonnement as Abonnement, utilise };
}
