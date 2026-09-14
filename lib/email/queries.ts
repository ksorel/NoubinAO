import { createClient } from "@/lib/supabase/server";
import type { Email, EmailResume, StatutCompteEmail } from "./types";
import { calculerScoreCorrespondanceDetaille, type AppelOffresAScorer } from "./correspondance";

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

// Projection minimale pour le fil de suivi : `page.tsx` ne garde que
// id/objet/expediteur après coup, autant projeter directement dans la
// requête plutôt que de renvoyer `*` (contenu, pièces jointes...) pour le
// jeter côté serveur juste après.
export async function listerEmailsLies(appelOffresId: string): Promise<EmailResume[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email")
    .select("id, objet, expediteur")
    .eq("appel_offres_id", appelOffresId)
    .order("recu_le", { ascending: false });

  if (error) throw error;
  return (data ?? []) as EmailResume[];
}

const NB_SUGGESTIONS_MAX = 10;

// Champs nécessaires au scoring (contenu, recu_le) + à l'affichage projeté
// (id, objet, expediteur) — rien de plus.
type EmailAScorerAvecId = Pick<Email, "id" | "objet" | "expediteur" | "contenu" | "recu_le">;

// Scoring et projection côté serveur : ne renvoie jamais `contenu` ni les
// autres champs internes à l'UI, et exige une part de score "sans date"
// (acheteur et/ou mots-clés du titre) strictement positive — la proximité
// de date seule (bonus fixe de 3 points, voir correspondance.ts) ne doit
// jamais suffire à qualifier une suggestion, mais un signal textuel, même
// faible, qualifie toujours (voir calculerScoreCorrespondanceDetaille).
export async function obtenirSuggestionsEmail(
  utilisateurId: string,
  appelOffres: AppelOffresAScorer,
): Promise<EmailResume[]> {
  const emails = await listerEmailsNonLies(utilisateurId);
  return emails
    .map((email) => ({ email, score: calculerScoreCorrespondanceDetaille(email, appelOffres) }))
    .filter(({ score }) => score.sansDate > 0)
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, NB_SUGGESTIONS_MAX)
    .map(({ email }) => ({ id: email.id, objet: email.objet, expediteur: email.expediteur }));
}

// Non exportée : uniquement consommée par obtenirSuggestionsEmail ci-dessus.
// Bornée à 1000 lignes (limite PostgREST par défaut chez Supabase, rendue
// explicite ici — pas une nouvelle contrainte produit) et triée par date de
// réception décroissante pour prioriser les emails les plus récents en cas
// de troncature.
async function listerEmailsNonLies(utilisateurId: string): Promise<EmailAScorerAvecId[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email")
    .select("id, objet, expediteur, contenu, recu_le")
    .eq("utilisateur_id", utilisateurId)
    .is("appel_offres_id", null)
    .order("recu_le", { ascending: false })
    .limit(1000);

  if (error) throw error;
  return (data ?? []) as EmailAScorerAvecId[];
}
