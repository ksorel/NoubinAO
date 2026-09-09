import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { STATE_COOKIE, genererUrlConsentement } from "@/lib/email/gmail-oauth";

export async function GET() {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  redirect(genererUrlConsentement(state));
}
