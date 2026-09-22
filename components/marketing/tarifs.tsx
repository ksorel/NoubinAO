import { getTranslations } from "next-intl/server";

export async function Tarifs() {
  const t = await getTranslations("Marketing.tarifs");

  return (
    <section className="py-12 px-4 bg-muted/40 text-center">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
        {t("titre")}
      </h2>
      <p className="max-w-md mx-auto text-sm text-muted-foreground">
        {t("description")}
      </p>
    </section>
  );
}
