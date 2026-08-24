"use server";

import { cookies } from "next/headers";
import type { Locale } from "./locale";

const COOKIE_NAME = "NEXT_LOCALE";

export async function setUserLocale(locale: Locale): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, locale);
}
