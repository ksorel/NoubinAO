import { createClient } from "@/lib/supabase/server";
import type { Email, EmailResume, StatutCompteEmail } from "./types";
import {
  calculerScoreCorrespondance,
  SEUIL_SUGGESTION_PERTINENTE,
  type AppelOffresAScorer,
} from "./correspondance";

export async function obtenirCompteEmailConnecte(
  utilisateurId: string,
): Promise<
  { adresseEmail: string; statut: StatutCompteEmail; dernierSyncLe: string | null } | null
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("compte_email_connecte")
    .select("adresse_email, statut, dernier_sync_le")
    .eq("utilisateur_id", utilisateurId)
    .eq("fournisseur", "gmail")
    .maybeSingle();

  if (!data) return null;
  return {
    adresseEmail: data.adresse_email,
    statut: data.statut,
    dernierSyncLe: data.dernier_sync_le,
  };
}

export async function listerEmailsLies(appelOffresId: string): Promise<Email[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .order("recu_le", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Email[];
}

const NB_SUGGESTIONS_MAX = 10;

// Scoring et projection côté serveur : ne renvoie jamais `contenu` ni les
// autres champs internes à l'UI, et exige un score strictement supérieur à
// SEUIL_SUGGESTION_PERTINENTE (le bonus de proximité de date, 3 points au
// maximum, ne doit jamais suffire seul à qualifier une suggestion).
export async function obtenirSuggestionsEmail(
  utilisateurId: string,
  appelOffres: AppelOffresAScorer,
): Promise<EmailResume[]> {
  const emails = await listerEmailsNonLies(utilisateurId);
  return emails
    .map((email) => ({ email, score: calculerScoreCorrespondance(email, appelOffres) }))
    .filter(({ score }) => score > SEUIL_SUGGESTION_PERTINENTE)
    .sort((a, b) => b.score - a.score)
    .slice(0, NB_SUGGESTIONS_MAX)
    .map(({ email }) => ({ id: email.id, objet: email.objet, expediteur: email.expediteur }));
}

export async function listerEmailsNonLies(utilisateurId: string): Promise<Email[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email")
    .select("*")
    .eq("utilisateur_id", utilisateurId)
    .is("appel_offres_id", null)
    .order("recu_le", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Email[];
}
