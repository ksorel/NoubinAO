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

// Plafonne le nombre de messages EXAMINÉS (nouveaux + doublons déjà
// synchronisés) par exécution pour borner le pire cas de durée sous la
// limite maxDuration (60s) des routes Vercel. Un premier sync volumineux
// (1000+ messages) s'étale alors sur plusieurs exécutions horaires
// successives au lieu de se faire tuer en boucle sur la même fenêtre —
// voir plus bas : un run plafonné ne touche PAS dernier_sync_le, pour que
// le run suivant reparte de la même borne et progresse dans le backlog
// sans jamais rien sauter.
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
  // Compte TOUS les messages examinés (nouveaux + doublons 23505), pas
  // seulement les nouveaux — c'est ce qui borne réellement le temps
  // d'exécution/le nombre d'appels API, y compris sur un run qui
  // ré-examine surtout des doublons déjà synchronisés (cas typique du run
  // qui suit un run plafonné, voir plus bas).
  let messagesExamines = 0;
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

        messagesExamines++;
        if (!erreurInsertion) messagesSynchronises++;
      }

      pageToken = data.nextPageToken ?? undefined;

      // Le plafond se vérifie à la frontière d'une page, jamais en milieu
      // de page : chaque page listée est toujours traitée en entier avant
      // d'être comptabilisée, donc "pageToken truthy après cette page" est
      // un signal fiable de "il restait des messages à traiter" — aucun
      // message d'un lot déjà récupéré n'est laissé de côté silencieusement.
      if (messagesExamines >= MAX_MESSAGES_PAR_SYNC) {
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

  // Gmail's `after:` n'est qu'une borne BASSE ("messages plus récents que
  // ceci") — il n'existe aucune borne haute correspondante côté requête,
  // et aucun curseur de pagination n'est persisté entre deux exécutions.
  // Avancer dernier_sync_le vers une date qui ne couvre pas tout le
  // backlog reviendrait donc à exclure définitivement et silencieusement
  // tout message plus ancien que cette date — il ne serait plus jamais
  // redemandé à Gmail. Sur un run plafonné (il restait des messages plus
  // anciens non examinés), on ne touche donc PAS dernier_sync_le : le
  // champ est omis de l'update ci-dessous, la colonne garde sa valeur
  // actuelle. Le prochain run repart alors de la même borne `depuis`, ce
  // qui lui fait ré-examiner les messages déjà synchronisés dans ce run
  // (doublons 23505, absorbés sans coût) avant de progresser naturellement
  // plus loin dans le backlog — plusieurs runs successifs finissent par
  // le drainer entièrement. Seul un run qui se termine SANS toucher le
  // plafond (toutes les pages consommées) a réellement tout couvert
  // jusqu'à `depuis`, et peut donc avancer dernier_sync_le jusqu'au début
  // de cette exécution.
  const donneesMiseAJour: Record<string, string> = { statut: "connecte" };
  if (!plafondAtteint) {
    donneesMiseAJour.dernier_sync_le = debutSync.toISOString();
  }

  const { error: erreurMiseAJour } = await supabase
    .from("compte_email_connecte")
    .update(donneesMiseAJour)
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
