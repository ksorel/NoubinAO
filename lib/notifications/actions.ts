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

  const [{ data: notifications, error: erreurListe }, { count, error: erreurCompte }] =
    await Promise.all([
      supabase
        .from("notification")
        .select("id, lu, cree_le, avis:avis_id(objet, autorite_contractante)")
        .order("cree_le", { ascending: false })
        .limit(10),
      supabase
        .from("notification")
        .select("id", { count: "exact", head: true })
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
  const supabase = await createClient();
  await supabase.from("notification").update({ lu: true }).eq("id", id);
}

export async function marquerToutesNotificationsLues(): Promise<void> {
  const supabase = await createClient();
  await supabase.from("notification").update({ lu: true }).eq("lu", false);
}
