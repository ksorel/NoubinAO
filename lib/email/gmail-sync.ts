import "server-only";
import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { creerClientOAuth } from "./gmail-oauth";
import { dechiffrer } from "./chiffrement";
import { extraireCorpsTexte, type PartieMessage } from "./extraction-message";

const TRENTE_JOURS_MS = 30 * 24 * 60 * 60 * 1000;

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

  const client = creerClientOAuth();
  client.setCredentials({ refresh_token: dechiffrer(compte.refresh_token_chiffre) });
  const gmail = google.gmail({ version: "v1", auth: client });

  let messagesSynchronises = 0;

  try {
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

        const piecesJointes = collecterPiecesJointes(message.payload as PartieMessageAvecPiecesJointes);

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

        if (!erreurInsertion) messagesSynchronises++;
      }

      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (erreur) {
    console.error(
      `Échec de la synchronisation du compte email ${compte.id} :`,
      erreur,
    );
    return { erreur: "Échec de la synchronisation." };
  }

  await supabase
    .from("compte_email_connecte")
    .update({ dernier_sync_le: debutSync.toISOString() })
    .eq("id", compte.id);

  return { messagesSynchronises };
}

interface PartieMessageAvecPiecesJointes {
  filename?: string | null;
  mimeType?: string | null;
  body?: { size?: number | null } | null;
  parts?: PartieMessageAvecPiecesJointes[];
}

function collecterPiecesJointes(
  payload: PartieMessageAvecPiecesJointes | undefined,
): { nom: string; tailleOctets: number; typeMime: string }[] {
  const resultat: { nom: string; tailleOctets: number; typeMime: string }[] = [];

  function parcourir(partie: PartieMessageAvecPiecesJointes) {
    if (partie.filename) {
      resultat.push({
        nom: partie.filename,
        tailleOctets: partie.body?.size ?? 0,
        typeMime: partie.mimeType ?? "application/octet-stream",
      });
    }
    for (const sousPartie of partie.parts ?? []) {
      parcourir(sousPartie);
    }
  }

  if (payload) parcourir(payload);
  return resultat;
}
