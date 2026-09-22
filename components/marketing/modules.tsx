import { getTranslations } from "next-intl/server";

type EtatModule = "disponible" | "bientot";
type ModuleItem = { nom: string; etat: EtatModule };

const BADGE_STYLES: Record<EtatModule, string> = {
  disponible: "bg-[hsl(var(--status-gagne))] text-slate-900",
  bientot: "bg-[hsl(var(--status-identifie))] text-slate-900",
};

export async function Modules() {
  const t = await getTranslations("Marketing.modules");
  const items = t.raw("items") as ModuleItem[];
  const badgeLabels: Record<EtatModule, string> = {
    disponible: t("badgeDisponible"),
    bientot: t("badgeBientot"),
  };

  return (
    <section className="py-12 px-4 bg-muted/40">
      <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-6">
        {t("titre")}
      </h2>
      <div className="flex flex-col gap-3 max-w-md mx-auto">
        {items.map((module) => (
          <div
            key={module.nom}
            className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground"
          >
            <span>{module.nom}</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_STYLES[module.etat]}`}
            >
              {badgeLabels[module.etat]}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
