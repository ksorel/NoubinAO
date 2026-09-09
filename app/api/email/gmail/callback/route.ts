import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { type NextRequest } from "next/server";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { STATE_COOKIE, creerClientOAuth } from "@/lib/email/gmail-oauth";
import { chiffrer } from "@/lib/email/chiffrement";

export async function GET(request: NextRequest) {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const erreurConsentement = searchParams.get("error");

  const cookieStore = await cookies();
  const stateAttendu = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  // Toutes les branches d'erreur ci-dessous alimentent `codeErreur` plutôt
  // que d'appeler redirect() directement à l'intérieur du bloc try/catch —
  // redirect() interrompt le rendu en levant une exception spéciale
  // (NEXT_REDIRECT) que le catch générique ci-dessous intercepterait sinon
  // par erreur, transformant une redirection réussie en redirection
  // d'échec. Un seul appel à redirect(), à la toute fin, hors de tout
  // try/catch.
  let codeErreur: string | null = null;

  if (erreurConsentement) {
    codeErreur = "consentement_refuse";
  } else if (!state || !stateAttendu || state !== stateAttendu) {
    codeErreur = "state_invalide";
  } else if (!code) {
    codeErreur = "echange_echoue";
  }

  if (!codeErreur) {
    try {
      const client = creerClientOAuth();
      const { tokens } = await client.getToken(code!);

      if (!tokens.refresh_token || !tokens.access_token) {
        codeErreur = "echange_echoue";
      } else {
        client.setCredentials(tokens);
        const gmail = google.gmail({ version: "v1", auth: client });
        const profil = await gmail.users.getProfile({ userId: "me" });
        const adresseEmail = profil.data.emailAddress;

        if (!adresseEmail) {
          codeErreur = "echange_echoue";
        } else {
          const supabase = await createClient();
          const { error } = await supabase.from("compte_email_connecte").upsert(
            {
              utilisateur_id: utilisateur.id,
              entreprise_id: utilisateur.entreprise_id,
              fournisseur: "gmail",
              adresse_email: adresseEmail,
              refresh_token_chiffre: chiffrer(tokens.refresh_token),
              access_token_chiffre: chiffrer(tokens.access_token),
              expire_le: tokens.expiry_date
                ? new Date(tokens.expiry_date).toISOString()
                : null,
              statut: "connecte",
            },
            { onConflict: "utilisateur_id,fournisseur" },
          );

          if (error) codeErreur = "enregistrement_echoue";
        }
      }
    } catch {
      codeErreur = "echange_echoue";
    }
  }

  redirect(codeErreur ? `/parametres?erreur=${codeErreur}` : "/parametres?succes=1");
}
