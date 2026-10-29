import type { SupabaseClient } from "@supabase/supabase-js";

export interface VerificationQuota {
  autorise: boolean;
  utilise: number;
  quota: number;
}

export async function compterAoTraitesCeMois(
  supabase: SupabaseClient,
  entrepriseId: string,
): Promise<number> {
  const debutMois = new Date();
  debutMois.setUTCDate(1);
  debutMois.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("appel_offres")
    .select("id", { count: "exact", head: true })
    .eq("entreprise_id", entrepriseId)
    .gte("created_at", debutMois.toISOString());

  if (error) throw error;
  return count ?? 0;
}

// Si aucune ligne abonnement n'existe (ne devrait jamais arriver après la
// migration de backfill + creer_entreprise étendu - voir Task 1), on
// n'empêche pas l'entreprise de travailler : une donnée manquante est un
// bug de notre côté, pas une raison de bloquer un client.
export async function verifierQuotaDisponible(
  supabase: SupabaseClient,
  entrepriseId: string,
): Promise<VerificationQuota> {
  const { data: abonnement, error } = await supabase
    .from("abonnement")
    .select("quota_mensuel")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (error) throw error;

  const utilise = await compterAoTraitesCeMois(supabase, entrepriseId);

  if (!abonnement) {
    return { autorise: true, utilise, quota: Number.POSITIVE_INFINITY };
  }

  const quota = abonnement.quota_mensuel as number;
  return { autorise: utilise < quota, utilise, quota };
}
