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
// limite maxDuration (60s) des routes Vercel. Après un run, dernier_sync_le
// suit cette table de décision (voir le commentaire détaillé près de la
// mise à jour, plus bas) :
//   - run complet (pagination épuisée)           -> avance à debutSync
//   - run plafonné, 1er sync (depuis était null)  -> fige à `depuis`
//     (la borne de repli 30 jours déjà utilisée ce run)
//   - run plafonné, sync déjà amorcé              -> inchangé (omis)
// Objectif dans tous les cas : ne jamais avancer dernier_sync_le au-delà
// de ce qui a été réellement couvert par ce run, pour ne jamais rien
// sauter silencieusement.
//
// LIMITE CONNUE (acceptée, voir "Hors périmètre" du spec du sous-projet) :
// aucun curseur de pagination (pageToken) n'est persisté entre deux
// exécutions. Une fois `depuis` figé (voir ci-dessus), la requête
// `after:` est identique d'un run à l'autre tant qu'elle reste plafonnée
// — chaque run repart donc de la page 1 et ré-examine le même haut de
// liste (les ~200-300 messages les plus récents de la fenêtre, déjà
// synchronisés, doublons sans coût), sans progresser vers les plus
// anciens, SAUF si suffisamment de nouveaux messages arrivent entre deux
// runs pour repousser les anciens hors de ce haut de liste. Conséquence
// concrète : un compte dont la fenêtre glissante dépasse durablement
// ~200-300 messages ne termine jamais son rattrapage tant que le flux de
// nouveaux messages ne le fait pas progresser naturellement — aucune
// perte de données (rien n'est jamais exclu silencieusement), mais pas de
// garantie de complétude non plus dans ce cas. Corrigible plus tard en
// persistant un curseur de pagination (nouvelle colonne) si ça s'avère un
// problème réel en usage — non fait ici, accepté comme limite pour ce
// sous-projet.
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
  // Mémorise si ce run est parti de la borne de repli 30 jours (compte
  // jamais encore synchronisé) plutôt que d'un dernier_sync_le réel —
  // nécessaire pour la logique de fige-la-fenêtre plus bas (voir
  // MAX_MESSAGES_PAR_SYNC ci-dessus).
  const premierSync = compte.dernier_sync_le === null;
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
  // redemandé à Gmail. Décision par cas (voir aussi le commentaire de
  // MAX_MESSAGES_PAR_SYNC) :
  //   - run complet (pagination épuisée, !plafondAtteint) : rien n'a été
  //     sauté, on avance jusqu'au début de cette exécution (debutSync).
  //   - run plafonné ET premier sync (depuis venait du repli 30 jours) :
  //     cette borne `depuis` a été recalculée à partir de "maintenant" à
  //     CHAQUE run tant qu'elle reste null en base — sur un compte dont
  //     le rattrapage prend plusieurs runs plafonnés successifs, elle
  //     dériverait donc vers l'avant d'environ une heure par run et
  //     pourrait exclure un message proche du bord avant que la
  //     pagination ne l'atteigne. On la fige donc dès ce premier run en
  //     l'écrivant telle quelle dans dernier_sync_le — elle ne couvre que
  //     ce qui a déjà été utilisé pour la requête de CE run, donc ce n'est
  //     jamais un saut en avant, juste une valeur explicite au lieu
  //     d'implicite.
  //   - run plafonné ET sync déjà amorcé (depuis était déjà un vrai
  //     timestamp, éventuellement déjà figé par un run précédent) :
  //     dernier_sync_le reste inchangé (champ omis de l'update). Le
  //     prochain run repart de la même borne (doublons 23505 ré-examinés
  //     sans coût) — voir la limite connue documentée près de
  //     MAX_MESSAGES_PAR_SYNC : sans curseur de pagination persisté, ce
  //     mécanisme seul ne garantit PAS de progresser vers les plus
  //     anciens si le flux de nouveaux messages ne le fait pas ; il
  //     garantit seulement de ne jamais rien exclure silencieusement.
  const donneesMiseAJour: Record<string, string> = { statut: "connecte" };
  if (!plafondAtteint) {
    donneesMiseAJour.dernier_sync_le = debutSync.toISOString();
  } else if (premierSync) {
    donneesMiseAJour.dernier_sync_le = depuis.toISOString();
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
