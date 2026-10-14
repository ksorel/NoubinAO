"use server";

import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import type { NotificationAvecAvis } from "./types";

export async function listerNotifications(): Promise<{
  notifications: NotificationAvecAvis[];
  nonLues: number;
}> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { notifications: [], nonLues: 0 };

  const supabase = await createClient();

  // notification_select_self autorise en RLS l'union de TOUTES les
  // entreprises dont l'utilisateur est membre (RLS ne connaît pas la notion
  // d'entreprise "active", purement applicative). Le filtre explicite
  // utilisateur_id ci-dessous scope donc chaque requête à la ligne
  // utilisateur de l'entreprise active, pour ne pas mélanger les
  // notifications de plusieurs entreprises dans la même cloche.
  const [{ data: notifications, error: erreurListe }, { count, error: erreurCompte }] =
    await Promise.all([
      supabase
        .from("notification")
        .select("id, lu, cree_le, avis:avis_id(objet, autorite_contractante)")
        .eq("utilisateur_id", utilisateur.id)
        .order("cree_le", { ascending: false })
        .limit(10),
      supabase
        .from("notification")
        .select("id", { count: "exact", head: true })
        .eq("utilisateur_id", utilisateur.id)
        .eq("lu", false),
    ]);

  if (erreurListe || erreurCompte) return { notifications: [], nonLues: 0 };

  // Voir app/(app)/layout.tsx pour le même recadrage de type : sans
  // générique Database, postgrest-js infère un embed plusieurs-à-un
  // comme un tableau par défaut, alors qu'il s'agit ici d'une relation
  // notification → avis_ao_national (un avis par notification).
  return {
    notifications: (notifications ?? []) as unknown as NotificationAvecAvis[],
    nonLues: count ?? 0,
  };
}

export async function marquerNotificationLue(id: string): Promise<void> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return;

  const supabase = await createClient();
  await supabase
    .from("notification")
    .update({ lu: true })
    .eq("id", id)
    .eq("utilisateur_id", utilisateur.id);
}

export async function marquerToutesNotificationsLues(): Promise<void> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return;

  const supabase = await createClient();
  await supabase
    .from("notification")
    .update({ lu: true })
    .eq("lu", false)
    .eq("utilisateur_id", utilisateur.id);
}
