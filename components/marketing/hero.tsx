import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export async function Hero() {
  const t = await getTranslations("Marketing.hero");

  return (
    <section className="flex flex-col items-center gap-6 text-center py-16 px-4">
      <h1 className="text-3xl sm:text-4xl font-bold max-w-2xl">
        {t("titre")}
      </h1>
      <p className="text-muted-foreground max-w-xl text-base sm:text-lg">
        {t("description")}
      </p>
      <div className="flex flex-col items-center gap-2">
        <Button asChild size="lg">
          <Link href="/auth/sign-up">{t("boutonEssai")}</Link>
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("sansCarte")}
        </span>
      </div>
    </section>
  );
}
