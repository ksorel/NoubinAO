import Link from "next/link";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AuthButton } from "@/components/auth-button";
import { Logo } from "@/components/logo";
import { ThemeLangueSwitcher } from "@/components/theme-langue-switcher";
import { getUserLocale } from "@/i18n/locale";
import { Hero } from "@/components/marketing/hero";
import { Constat } from "@/components/marketing/constat";
import { CommentCaMarche } from "@/components/marketing/comment-ca-marche";
import { Modules } from "@/components/marketing/modules";
import { Tarifs } from "@/components/marketing/tarifs";
import { CtaFinal } from "@/components/marketing/cta-final";
import { SiteFooter } from "@/components/marketing/site-footer";

export const instant = false;

export default async function Home() {
  const locale = await getUserLocale();
  const t = await getTranslations("ThemeLangue");

  return (
    <main className="min-h-screen flex flex-col">
      <nav className="w-full flex justify-center border-b h-16">
        <div className="w-full max-w-5xl flex justify-between items-center px-5">
          <Link href="/">
            <Logo className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Suspense>
              <AuthButton />
            </Suspense>
            <ThemeLangueSwitcher
              locale={locale}
              labels={{
                theme: t("theme"),
                light: t("light"),
                dark: t("dark"),
                system: t("system"),
                language: t("language"),
                french: t("french"),
                english: t("english"),
              }}
            />
          </div>
        </div>
      </nav>

      <Hero />
      <Constat />
      <CommentCaMarche />
      <Modules />
      <Tarifs />
      <CtaFinal />
      <SiteFooter />
    </main>
  );
}
