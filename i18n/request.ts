// Requis par next-intl/plugin (voir next.config.ts) pour que next-intl
// fonctionne, même si rien n'appelle plus getLocale()/getMessages() de
// next-intl/server ailleurs dans le code : app/(app)/layout.tsx lit la
// locale et les messages directement via i18n/locale.ts. Si tu corriges
// un bug de locale ici, vérifie aussi i18n/locale.ts — la logique n'est
// pas partagée entre les deux.
import { getRequestConfig } from "next-intl/server";
import { getUserLocale } from "./locale";

export default getRequestConfig(async () => {
  const locale = await getUserLocale();

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // Fixe le fuseau pour que useFormatter().dateTime() rende la même
    // heure côté serveur (UTC sur Vercel) et côté client après hydration.
    // La Côte d'Ivoire est en UTC+0, donc sans impact visible aujourd'hui,
    // mais évite un avertissement d'hydration pour tout viewer hors UTC.
    timeZone: "Africa/Abidjan",
  };
});
