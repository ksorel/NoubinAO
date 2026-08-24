"use server";

import { cookies } from "next/headers";

const COOKIE_NAME = "NEXT_LOCALE";
const DEFAULT_LOCALE: Locale = "fr";

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export async function getUserLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const valeur = cookieStore.get(COOKIE_NAME)?.value;
  return valeur === "en" ? "en" : DEFAULT_LOCALE;
}

export async function setUserLocale(locale: Locale): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, locale);
}
