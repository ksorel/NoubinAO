"use server";

import { cookies } from "next/headers";
import { COOKIE_NAME, type Locale } from "./locale";

const UN_AN_EN_SECONDES = 60 * 60 * 24 * 365;

export async function setUserLocale(locale: Locale): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, locale, {
    maxAge: UN_AN_EN_SECONDES,
    sameSite: "lax",
    path: "/",
  });
}
