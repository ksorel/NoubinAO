const POINTS = [
  "Vos pièces à jour sont dispersées entre dossier papier et boîte mail",
  "Le sommaire imposé se refait à chaque appel d'offres",
  "Faute de temps, certains AO sont ratés ou bâclés",
];

export function Constat() {
  return (
    <section className="py-12 px-4">
      <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-6">
        Le constat
      </h2>
      <div className="grid gap-4 sm:grid-cols-3 max-w-4xl mx-auto">
        {POINTS.map((point) => (
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
