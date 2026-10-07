import { createClient } from "@/lib/supabase/server";
import type { Entreprise, Invitation, RoleUtilisateur } from "./types";

export async function obtenirUtilisateurCourant(): Promise<{
  id: string;
  entreprise_id: string;
  nom: string;
  role: RoleUtilisateur;
} | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub as string | undefined;

  if (!userId) return null;

  const { data: utilisateur } = await supabase
    .from("utilisateur")
    .select("id, entreprise_id, nom, role")
    .eq("id", userId)
    .maybeSingle();

  return utilisateur;
}

export async function listerUtilisateurs(
  entrepriseId: string,
): Promise<{ id: string; nom: string; role: RoleUtilisateur }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("utilisateur")
    .select("id, nom, role")
    .eq("entreprise_id", entrepriseId)
    .order("nom", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function obtenirTauxFraisStructureDefaut(
  entrepriseId: string,
): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entreprise")
    .select("taux_frais_structure_defaut")
    .eq("id", entrepriseId)
    .maybeSingle();
  return data?.taux_frais_structure_defaut ?? null;
}

export async function obtenirNomEntreprise(entrepriseId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entreprise")
    .select("nom")
    .eq("id", entrepriseId)
    .maybeSingle();
  return data?.nom ?? null;
}

export async function obtenirEntreprise(entrepriseId: string): Promise<Entreprise | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entreprise")
    .select("*")
    .eq("id", entrepriseId)
    .maybeSingle();
  return data as Entreprise | null;
}

export async function listerInvitationsEnAttente(
  entrepriseId: string,
): Promise<Invitation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitation_equipe")
    .select("id, role, expire_at")
    .eq("entreprise_id", entrepriseId)
    .eq("statut", "en_attente")
    .gt("expire_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Invitation[];
}

export async function obtenirInvitationPublique(
  token: string,
): Promise<{ entreprise_nom: string | null; role: RoleUtilisateur | null; valide: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("obtenir_invitation_publique", { p_token: token })
    .single();

  if (error || !data) {
    return { entreprise_nom: null, role: null, valide: false };
  }

  const typedData = data as { entreprise_nom: string | null; role: RoleUtilisateur | null; valide: boolean };
  return {
    entreprise_nom: typedData.entreprise_nom,
    role: typedData.role,
    valide: typedData.valide,
  };
}
