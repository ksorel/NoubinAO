import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export async function CtaFinal() {
  const t = await getTranslations("Marketing.ctaFinal");

  return (
    <section className="py-16 px-4 bg-primary text-center">
      <h2 className="text-primary-foreground text-xl font-bold mb-6 max-w-md mx-auto">
        {t("titre")}
      </h2>
      <Button
        asChild
        size="lg"
        className="bg-accent text-accent-foreground hover:bg-accent/90"
      >
        <Link href="/auth/sign-up">{t("boutonEssai")}</Link>
      </Button>
    </section>
  );
}
