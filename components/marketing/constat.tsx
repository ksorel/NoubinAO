import { getTranslations } from "next-intl/server";

export async function Constat() {
  const t = await getTranslations("Marketing.constat");
  const points = t.raw("points") as string[];

  return (
    <section className="py-12 px-4">
      <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-6">
        {t("titre")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-3 max-w-4xl mx-auto">
        {points.map((point) => (
          <div
            key={point}
            className="rounded-lg border bg-card p-4 text-sm text-card-foreground text-center"
          >
            {point}
          </div>
        ))}
      </div>
    </section>
  );
}
