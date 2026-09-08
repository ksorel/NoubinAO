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
import { assignerResponsable } from "@/lib/appels-offres/actions";

const VALEUR_NON_ASSIGNE = "__non_assigne__";

export function ResponsableSelect({
  appelOffresId,
  assigneAInitial,
  equipe,
}: {
  appelOffresId: string;
  assigneAInitial: string | null;
  equipe: { id: string; nom: string }[];
}) {
  const t = useTranslations("Pipeline.responsable");
  const [assigneA, setAssigneA] = useState(assigneAInitial ?? VALEUR_NON_ASSIGNE);
  const [isPending, startTransition] = useTransition();

  function onValueChange(valeur: string) {
    const precedent = assigneA;
    setAssigneA(valeur);

    startTransition(async () => {
      const utilisateurId = valeur === VALEUR_NON_ASSIGNE ? null : valeur;
      const resultat = await assignerResponsable(appelOffresId, utilisateurId);
      if ("erreur" in resultat) {
        toast.error(t("erreur"));
        setAssigneA(precedent);
      } else {
        toast.success(t("toastModifie"));
      }
    });
  }

  return (
    <Select value={assigneA} onValueChange={onValueChange} disabled={isPending}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={VALEUR_NON_ASSIGNE}>{t("nonAssigne")}</SelectItem>
        {equipe.map((membre) => (
          <SelectItem key={membre.id} value={membre.id}>
            {membre.nom}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
