const ETAPES = [
  {
    titre: "Une bibliothèque toujours à jour",
    description:
      "Pièces administratives, références projets, CV — avec alertes d'expiration.",
  },
  {
    titre: "Un DAO analysé, un dossier pré-assemblé",
    description:
      "Lecture du DAO, extraction des exigences, mapping à la bibliothèque.",
  },
  {
    titre: "Tous vos AO suivis au même endroit",
    description: "Statut, échéances, échanges email centralisés.",
  },
];

export function CommentCaMarche() {
  return (
    <section className="py-12 px-4">
      <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-6">
        Comment ça marche
      </h2>
      <div className="grid gap-4 sm:grid-cols-3 max-w-4xl mx-auto">
        {ETAPES.map((etape, index) => (
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
