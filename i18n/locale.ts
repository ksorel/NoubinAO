import { cookies } from "next/headers";

export const COOKIE_NAME = "NEXT_LOCALE";
const DEFAULT_LOCALE: Locale = "fr";

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export async function getUserLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const valeur = cookieStore.get(COOKIE_NAME)?.value;
  return (LOCALES as readonly string[]).includes(valeur ?? "")
    ? (valeur as Locale)
    : DEFAULT_LOCALE;
}
