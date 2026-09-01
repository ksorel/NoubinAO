"use client";

import { useTranslations } from "next-intl";
import { Clock, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { obtenirConfigStatutTraitement } from "@/lib/appels-offres/statut-traitement";
import type { StatutTraitementAo } from "@/lib/appels-offres/types";

const STYLES = {
  identifie: "bg-[hsl(var(--status-identifie))] text-slate-900 border-transparent",
  preparation: "bg-[hsl(var(--status-preparation))] text-white border-transparent",
  gagne: "bg-[hsl(var(--status-gagne))] text-slate-900 border-transparent",
  perdu: "bg-[hsl(var(--status-perdu))] text-white border-transparent",
} as const;

const ICONES = {
  horloge: Clock,
  chargement: Loader2,
  coche: CheckCircle2,
  alerte: AlertCircle,
} as const;

export function StatutTraitementBadge({
  statut,
  erreurTraitement,
}: {
  statut: StatutTraitementAo;
  erreurTraitement: string | null;
}) {
  const t = useTranslations("AppelsOffres");
  const config = obtenirConfigStatutTraitement(statut);
  const Icone = ICONES[config.icone];

  const badge = (
    <Badge variant="outline" className={`gap-1 ${STYLES[config.couleur]}`}>
      <Icone className={config.icone === "chargement" ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
      {t(config.cleLibelle)}
    </Badge>
  );

  if (statut === "erreur" && erreurTraitement) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>{erreurTraitement}</TooltipContent>
      </Tooltip>
    );
  }

  return badge;
}
