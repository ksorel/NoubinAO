"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useTranslations } from "next-intl";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { StatutPipelineAo } from "@/lib/appels-offres/types";
import type { RepartitionStatut } from "@/lib/accueil/kpi";

const CLES_BADGE: Record<StatutPipelineAo, string> = {
  identifie: "badge.identifie",
  en_preparation: "badge.enPreparation",
  soumis: "badge.soumis",
  en_attente: "badge.enAttente",
  gagne: "badge.gagne",
  perdu: "badge.perdu",
  sans_suite: "badge.sansSuite",
};

// Même mapping couleur que obtenirCouleurStatutPipeline
// (lib/appels-offres/statut-pipeline.ts) : en_attente et sans_suite
// partagent la couleur "identifie", aucune variable --status-* dédiée
// n'existe pour ces deux statuts.
const COULEURS_STATUT: Record<StatutPipelineAo, string> = {
  identifie: "hsl(var(--status-identifie))",
  en_preparation: "hsl(var(--status-preparation))",
  soumis: "hsl(var(--status-soumis))",
  en_attente: "hsl(var(--status-identifie))",
  gagne: "hsl(var(--status-gagne))",
  perdu: "hsl(var(--status-perdu))",
  sans_suite: "hsl(var(--status-identifie))",
};

export function RepartitionPipelineChart({
  repartition,
}: {
  repartition: RepartitionStatut[];
}) {
  const t = useTranslations("Pipeline");
  const tAccueil = useTranslations("Accueil");

  const donnees = repartition.map((entree) => ({
    statut: entree.statut,
    libelle: t(CLES_BADGE[entree.statut]),
    nombre: entree.nombre,
    fill: COULEURS_STATUT[entree.statut],
  }));

  const config: ChartConfig = Object.fromEntries(
    repartition.map((entree) => [
      entree.statut,
      { label: t(CLES_BADGE[entree.statut]), color: COULEURS_STATUT[entree.statut] },
    ]),
  );

  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={donnees} layout="vertical" margin={{ left: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="libelle"
          tickLine={false}
          axisLine={false}
          width={110}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="nombre" radius={4} name={tAccueil("graphiqueSerieNom")} />
      </BarChart>
    </ChartContainer>
  );
}
