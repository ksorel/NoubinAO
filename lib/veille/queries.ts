import { createClient } from "@/lib/supabase/server";
import { SECTEURS_CIBLES } from "./classification-secteur";
import type { AvisAoNational, VeilleExecution } from "./types";

// Extrait pour être testé en isolation (logique pure, pas d'appel
// Supabase) — défensif contre toute valeur hors référentiel qui
// atteindrait quand même secteursEntreprise (ceinture et bretelles au-
// dessus de la migration de nettoyage et de la validation Zod à
// l'enregistrement, voir lib/utilisateur/schema.ts).
export function construireFiltreSecteurs(secteursEntreprise: string[]): string | null {
  const secteursValides = secteursEntreprise.filter((s) =>
    (SECTEURS_CIBLES as readonly string[]).includes(s),
  );
  if (secteursValides.length === 0) return null;
  return `secteur.in.(${secteursValides.join(",")}),secteur.is.null`;
}

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

export async function listerAvisNational(secteursEntreprise: string[]): Promise<AvisAoNational[]> {
  const supabase = await createClient();
  let requete = supabase
    .from("avis_ao_national")
    .select("*")
    .order("date_limite_remise_offres", { ascending: true, nullsFirst: false });

  // Un avis hors des secteurs de l'entreprise n'est jamais renvoyé — sauf
  // s'il n'a pas pu être classé (secteur null), toujours visible pour ne
  // pas perdre une vraie opportunité sur un faux négatif de classification
  // par mots-clés (voir spec).
  const filtre = construireFiltreSecteurs(secteursEntreprise);
  if (filtre) {
    requete = requete.or(filtre);
  }

  const { data, error } = await requete;

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

export async function listerVeilleExecutions(): Promise<VeilleExecution[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("veille_execution")
    .select("*")
    .order("execute_le", { ascending: false })
    .limit(30);

  if (error) throw error;
  return (data ?? []) as VeilleExecution[];
}
