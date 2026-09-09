import { google } from "googleapis";

export const STATE_COOKIE = "gmail_oauth_state";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

export function creerClientOAuth() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !APP_URL) {
    throw new Error(
      "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET et APP_URL sont requis pour la connexion Gmail",
    );
  }
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    `${APP_URL}/api/email/gmail/callback`,
  );
}

export function genererUrlConsentement(state: string): string {
  const client = creerClientOAuth();
  return client.generateAuthUrl({
    access_type: "offline", // nécessaire pour obtenir un refresh_token
    prompt: "consent", // force le renvoi du refresh_token même si déjà autorisé
    scope: SCOPES,
    state,
  });
}
