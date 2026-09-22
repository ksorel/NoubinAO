import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("Marketing.footer");

  return (
    <footer className="flex items-center justify-center gap-8 border-t py-8 px-4 text-center text-xs text-muted-foreground">
      <p>{t("signature")}</p>
      <Link href="/confidentialite" className="underline">
        {t("confidentialite")}
      </Link>
    </footer>
  );
}
