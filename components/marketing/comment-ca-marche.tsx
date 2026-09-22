import { getTranslations } from "next-intl/server";

type Etape = { titre: string; description: string };

export async function CommentCaMarche() {
  const t = await getTranslations("Marketing.commentCaMarche");
  const etapes = t.raw("etapes") as Etape[];

  return (
    <section className="py-12 px-4">
      <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-6">
        {t("titre")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-3 max-w-4xl mx-auto">
        {etapes.map((etape, index) => (
          <div
            key={etape.titre}
            className="rounded-lg border bg-card p-4 text-card-foreground"
          >
            <div className="text-2xl font-bold text-primary mb-2">
              {index + 1}
            </div>
            <h3 className="font-semibold mb-1">{etape.titre}</h3>
            <p className="text-sm text-muted-foreground">
              {etape.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
