import { cookies } from "next/headers";

// Centralise le nom et les options du cookie d'entreprise active, dupliqués
// jusqu'ici dans 3 call sites d'écriture (lib/entreprise/actions.ts,
// lib/utilisateur/actions.ts x2) et 1 de lecture (lib/utilisateur/queries.ts).
// maxAge manquant à l'origine : sans lui le cookie est de session (perdu à
// la fermeture du navigateur), ce qui contredit le critère d'acceptation de
// la spec (persistance du choix d'entreprise entre déconnexion/reconnexion,
// voir docs/superpowers/specs/2026-10-13-multi-entreprise-par-utilisateur-design.md).
// Même patron que i18n/locale.ts (COOKIE_NAME + maxAge ~1 an) pour le cookie
// de langue, déjà persistant.

export const COOKIE_ENTREPRISE_ACTIVE = "entreprise_active_id";

const UN_AN_EN_SECONDES = 60 * 60 * 24 * 365;

export async function poserCookieEntrepriseActive(entrepriseId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_ENTREPRISE_ACTIVE, entrepriseId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: UN_AN_EN_SECONDES,
    secure: true,
  });
}

export async function lireCookieEntrepriseActive(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_ENTREPRISE_ACTIVE)?.value;
}
