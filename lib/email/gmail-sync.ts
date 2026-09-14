import "server-only";
import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { creerClientOAuth } from "./gmail-oauth";
import { dechiffrer } from "./chiffrement";
import {
  extraireCorpsTexte,
  collecterPiecesJointes,
  type PartieMessage,
} from "./extraction-message";

const TRENTE_JOURS_MS = 30 * 24 * 60 * 60 * 1000;

// Plafonne le nombre de messages traités par exécution pour borner le pire
// cas de durée sous la limite maxDuration (60s) des routes Vercel. Un
// premier sync volumineux (1000+ messages) s'étale alors sur plusieurs
// exécutions horaires successives au lieu de se faire tuer en boucle sur
// la même fenêtre — voir la logique de dernier_sync_le plus bas, qui
// avance uniquement jusqu'au dernier message réellement traité dans ce
// cas, sans rien sauter.
const MAX_MESSAGES_PAR_SYNC = 200;

export interface CompteASynchroniser {
  id: string;
  utilisateur_id: string;
  entreprise_id: string;
  refresh_token_chiffre: string;
  dernier_sync_le: string | null;
}

export async function synchroniserCompteEmail(
  supabase: SupabaseClient,
  compte: CompteASynchroniser,
): Promise<{ messagesSynchronises: number } | { erreur: string }> {
  const debutSync = new Date();
  const depuis = compte.dernier_sync_le
    ? new Date(compte.dernier_sync_le)
    : new Date(debutSync.getTime() - TRENTE_JOURS_MS);
  const epochDepuis = Math.floor(depuis.getTime() / 1000);

  let messagesSynchronises = 0;
  // internalDate (epoch ms, tel que renvoyé par Gmail) du dernier message
  // traité dans cette exécution — sert à calculer dernier_sync_le si le
  // plafond MAX_MESSAGES_PAR_SYNC est atteint avant la fin de la
  // pagination (voir plus bas).
  let dernierMessageInternalDate: number | null = null;
  let plafondAtteint = false;

  try {
    const client = creerClientOAuth();
    client.setCredentials({ refresh_token: dechiffrer(compte.refresh_token_chiffre) });
    const gmail = google.gmail({ version: "v1", auth: client });

    let pageToken: string | undefined;

    do {
      const { data } = await gmail.users.messages.list({
        userId: "me",
        q: `after:${epochDepuis}`,
        pageToken,
      });

      for (const { id: messageId } of data.messages ?? []) {
        if (!messageId) continue;

        const { data: message } = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "full",
        });

        const headers = message.payload?.headers ?? [];
        const lireEnTete = (nom: string) =>
          headers.find((h) => h.name?.toLowerCase() === nom.toLowerCase())?.value ?? null;

        const piecesJointes = collecterPiecesJointes(message.payload as PartieMessage);

        const { error: erreurInsertion } = await supabase.from("email").insert({
          entreprise_id: compte.entreprise_id,
          utilisateur_id: compte.utilisateur_id,
          compte_email_connecte_id: compte.id,
          message_id_gmail: messageId,
          expediteur: lireEnTete("From"),
          destinataires: lireEnTete("To"),
          objet: lireEnTete("Subject"),
          contenu: extraireCorpsTexte(message.payload as PartieMessage) ?? message.snippet ?? null,
          pieces_jointes: piecesJointes,
          recu_le: message.internalDate
            ? new Date(Number(message.internalDate)).toISOString()
            : null,
        });

        // 23505 = violation de contrainte unique : message déjà synchronisé
        // lors d'une exécution précédente (fenêtres after: qui se
        // chevauchent) — traité comme un succès idempotent, pas une erreur.
        if (erreurInsertion && erreurInsertion.code !== "23505") {
          throw erreurInsertion;
        }

        if (message.internalDate) {
          dernierMessageInternalDate = Number(message.internalDate);
        }

        if (!erreurInsertion) messagesSynchronises++;
      }

      pageToken = data.nextPageToken ?? undefined;

      // Le plafond se vérifie à la frontière d'une page, jamais en milieu
      // de page : chaque page listée est toujours traitée en entier avant
      // d'être comptabilisée, donc "pageToken truthy après cette page" est
      // un signal fiable de "il restait des messages à traiter" — aucun
      // message d'un lot déjà récupéré n'est laissé de côté silencieusement.
      if (messagesSynchronises >= MAX_MESSAGES_PAR_SYNC) {
        plafondAtteint = Boolean(pageToken);
        break;
      }
    } while (pageToken);
  } catch (erreur) {
    console.error(
      `Échec de la synchronisation du compte email ${compte.id} :`,
      erreur,
    );
    return { erreur: "Échec de la synchronisation." };
  }

  // Run complète (toutes les pages consommées) : rien n'a été sauté, on
  // peut avancer dernier_sync_le jusqu'au début de cette exécution. Run
  // plafonnée : les messages non traités sont les PLUS ANCIENS de la
  // fenêtre (Gmail liste du plus récent au plus ancien), donc on avance
  // seulement jusqu'au dernier message traité (avec une seconde de marge
  // pour éviter tout risque de saut, un doublon éventuel étant inoffensif
  // grâce à l'idempotence 23505 ci-dessus) — ils seront repris à la
  // prochaine exécution.
  const dernierSyncLe =
    plafondAtteint && dernierMessageInternalDate !== null
      ? new Date(dernierMessageInternalDate - 1000).toISOString()
      : debutSync.toISOString();

  const { error: erreurMiseAJour } = await supabase
    .from("compte_email_connecte")
    .update({ dernier_sync_le: dernierSyncLe, statut: "connecte" })
    .eq("id", compte.id);

  if (erreurMiseAJour) {
    console.error(
      `Échec de la mise à jour de dernier_sync_le pour le compte email ${compte.id} :`,
      erreurMiseAJour,
    );
    return { erreur: "Échec de la synchronisation." };
  }

  return { messagesSynchronises };
}
