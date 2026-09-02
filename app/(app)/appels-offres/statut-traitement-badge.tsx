"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { obtenirConfigStatutTraitement } from "@/lib/appels-offres/statut-traitement";
import type { StatutTraitementAo } from "@/lib/appels-offres/types";

// Aucune progression réelle n'est mesurable côté serveur (normalisation +
// OCR + extraction par IA n'exposent pas d'étapes granulaires) — cette
// courbe grimpe vite au début puis ralentit, plafonnée avant 100%, pour
// donner un signal honnête ("ça avance") sans jamais prétendre que c'est
// terminé avant que le statut ne passe réellement à "termine".
function estimerProgression(secondesEcoulees: number): number {
  return Math.min(92, secondesEcoulees * 4);
}

function calculerSecondesEcoulees(depuis: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(depuis).getTime()) / 1000));
}

// Compteur client indépendant du polling de la liste (toutes les 4s) —
// il tourne chaque seconde pour que l'utilisateur voie que le traitement
// avance réellement, plutôt qu'un badge statique qui ne change pas
// pendant plusieurs dizaines de secondes.
function useSecondesEcoulees(depuis: string, actif: boolean): number {
  const [secondes, setSecondes] = useState(() => calculerSecondesEcoulees(depuis));

  useEffect(() => {
    if (!actif) return;

    setSecondes(calculerSecondesEcoulees(depuis));
    const intervalId = setInterval(() => {
      setSecondes(calculerSecondesEcoulees(depuis));
    }, 1000);

    return () => clearInterval(intervalId);
  }, [depuis, actif]);

  return secondes;
}

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
  dateCreation,
}: {
  statut: StatutTraitementAo;
  erreurTraitement: string | null;
  dateCreation: string;
}) {
  const t = useTranslations("AppelsOffres");
  const config = obtenirConfigStatutTraitement(statut);
  const Icone = ICONES[config.icone];
  const enCours = config.icone === "chargement";
  const secondesEcoulees = useSecondesEcoulees(dateCreation, enCours);

  const badge = (
    <Badge variant="outline" className={`gap-1 ${STYLES[config.couleur]}`}>
      <Icone className={enCours ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
      {t(config.cleLibelle)}
      {enCours && (
        <span className="tabular-nums">
          {t("badge.depuisSecondes", { secondes: secondesEcoulees })}
        </span>
      )}
    </Badge>
  );

  const contenu =
    statut === "erreur" && erreurTraitement ? (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>{erreurTraitement}</TooltipContent>
      </Tooltip>
    ) : (
      badge
    );

  if (!enCours) {
    return contenu;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {contenu}
      <Progress value={estimerProgression(secondesEcoulees)} className="h-1.5 w-32" />
    </div>
  );
}
