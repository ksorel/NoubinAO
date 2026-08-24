type EtatModule = "disponible" | "bientot";

const MODULES: { nom: string; etat: EtatModule }[] = [
  { nom: "Bibliothèque documentaire", etat: "disponible" },
  { nom: "Extraction de DAO", etat: "bientot" },
  { nom: "Suivi par AO (emails, pipeline)", etat: "bientot" },
];

const BADGE_STYLES: Record<EtatModule, string> = {
  disponible: "bg-[hsl(var(--status-gagne))] text-slate-900",
  bientot: "bg-[hsl(var(--status-identifie))] text-slate-900",
};

const BADGE_LABELS: Record<EtatModule, string> = {
  disponible: "Disponible",
  bientot: "Bientôt",
};

export function Modules() {
  return (
    <section className="py-12 px-4 bg-muted/40">
      <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-6">
        Modules
      </h2>
      <div className="flex flex-col gap-3 max-w-md mx-auto">
        {MODULES.map((module) => (
          <div
            key={module.nom}
            className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground"
          >
            <span>{module.nom}</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_STYLES[module.etat]}`}
            >
              {BADGE_LABELS[module.etat]}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
