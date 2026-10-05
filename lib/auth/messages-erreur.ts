// Les formulaires d'auth (login/sign-up/mot de passe) affichaient
// error.message brut de Supabase Auth — en anglais, parfois cryptique
// ("Invalid login credentials", "User already registered"...). Supabase
// expose un code d'erreur stable (voir @supabase/auth-js/lib/error-codes)
// qu'on traduit ici plutôt que de montrer le texte brut à l'utilisateur.
const MESSAGES_PAR_CODE: Record<string, string> = {
  invalid_credentials: "Email ou mot de passe incorrect.",
  user_already_exists: "Un compte existe déjà avec cet email.",
  email_exists: "Un compte existe déjà avec cet email.",
  weak_password:
    "Mot de passe trop faible. Utilisez au moins 6 caractères.",
  same_password:
    "Le nouveau mot de passe doit être différent de l'ancien.",
  email_address_invalid: "Adresse email invalide.",
  email_not_confirmed:
    "Confirmez votre email avant de vous connecter (vérifiez votre boîte de réception).",
  over_email_send_rate_limit:
    "Trop de tentatives. Réessayez dans quelques minutes.",
  over_request_rate_limit:
    "Trop de tentatives. Réessayez dans quelques minutes.",
  user_not_found: "Aucun compte ne correspond à cet email.",
  signup_disabled: "Les inscriptions sont temporairement désactivées.",
  session_expired: "Votre session a expiré. Reconnectez-vous.",
  refresh_token_not_found: "Votre session a expiré. Reconnectez-vous.",
  otp_expired:
    "Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.",
  // Sentinel propre à cette app (app/auth/confirm/route.ts), pas un code
  // Supabase : lien de confirmation/réinitialisation ouvert sans ses
  // paramètres attendus (copié-collé incomplet, lien tronqué...).
  lien_invalide:
    "Ce lien de confirmation est invalide ou incomplet. Demandez-en un nouveau.",
};

const MESSAGE_PAR_DEFAUT = "Une erreur est survenue. Réessayez.";

export function messageErreurParCode(code: string | null | undefined): string {
  return (code && MESSAGES_PAR_CODE[code]) || MESSAGE_PAR_DEFAUT;
}

export function messageErreurAuth(erreur: unknown): string {
  if (
    typeof erreur === "object" &&
    erreur !== null &&
    "code" in erreur &&
    typeof (erreur as { code?: unknown }).code === "string"
  ) {
    return messageErreurParCode((erreur as { code: string }).code);
  }
  return MESSAGE_PAR_DEFAUT;
}
