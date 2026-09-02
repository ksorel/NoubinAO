"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { modifierStatutPipeline } from "@/lib/appels-offres/actions";
import { obtenirCouleurStatutPipeline } from "@/lib/appels-offres/statut-pipeline";
import { STATUTS_PIPELINE_AO, type StatutPipelineAo } from "@/lib/appels-offres/types";

const STYLES = {
  identifie: "bg-[hsl(var(--status-identifie))] text-slate-900",
  preparation: "bg-[hsl(var(--status-preparation))] text-white",
  soumis: "bg-[hsl(var(--status-soumis))] text-slate-900",
  gagne: "bg-[hsl(var(--status-gagne))] text-slate-900",
  perdu: "bg-[hsl(var(--status-perdu))] text-white",
} as const;

const CLES_LIBELLE: Record<StatutPipelineAo, string> = {
  identifie: "badge.identifie",
  en_preparation: "badge.enPreparation",
  soumis: "badge.soumis",
  en_attente: "badge.enAttente",
  gagne: "badge.gagne",
  perdu: "badge.perdu",
};

export function StatutPipelineSelect({
  appelOffresId,
  statutInitial,
}: {
  appelOffresId: string;
  statutInitial: StatutPipelineAo;
}) {
  const t = useTranslations("Pipeline");
  const [statut, setStatut] = useState(statutInitial);
  const [isPending, startTransition] = useTransition();

  function onValueChange(valeur: string) {
    const nouveauStatut = valeur as StatutPipelineAo;
    const precedent = statut;
    setStatut(nouveauStatut);

    startTransition(async () => {
      const resultat = await modifierStatutPipeline(appelOffresId, nouveauStatut);
      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
        setStatut(precedent);
      } else {
        toast.success(t("table.toastStatutModifie"));
      }
    });
  }

  const couleur = obtenirCouleurStatutPipeline(statut);

  return (
    <Select value={statut} onValueChange={onValueChange} disabled={isPending}>
      <SelectTrigger className={`w-40 border-transparent ${STYLES[couleur]}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUTS_PIPELINE_AO.map((valeur) => (
          <SelectItem key={valeur} value={valeur}>
            {t(CLES_LIBELLE[valeur])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
