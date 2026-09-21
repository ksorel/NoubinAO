"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  genererContenuFormulaireStandard,
  modifierContenuSection,
  validerSection,
  devaliderSection,
} from "@/lib/appels-offres/actions";
import type { SectionDossier, StatutSectionDossier } from "@/lib/appels-offres/types";

export function FormulaireStandard({
  appelOffresId,
  exigenceId,
  section,
}: {
  appelOffresId: string;
  exigenceId: string;
  section: SectionDossier | undefined;
}) {
  const t = useTranslations("AppelsOffres.detail.exigences.formulaireStandard");
  const [sectionId, setSectionId] = useState(section?.id);
  const [contenu, setContenu] = useState(section?.contenu ?? "");
  const [statut, setStatut] = useState<StatutSectionDossier>(section?.statut ?? "brouillon");
  const [generation, setGeneration] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function generer() {
    setGeneration(true);
    const resultat = await genererContenuFormulaireStandard(appelOffresId, exigenceId);
    setGeneration(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setSectionId(resultat.sectionId);
    setContenu(resultat.contenu);
    setStatut(resultat.statut);
  }

  async function sauvegarderContenu() {
    if (!sectionId) return;
    setEnregistrement(true);
    const resultat = await modifierContenuSection(appelOffresId, sectionId, contenu);
    setEnregistrement(false);
    if ("erreur" in resultat) toast.error(t("erreurEnregistrement"));
  }

  function basculerStatut() {
    if (!sectionId) return;
    const precedent = statut;
    const nouveauStatut: StatutSectionDossier = statut === "brouillon" ? "validee" : "brouillon";
    setStatut(nouveauStatut);

    startTransition(async () => {
      const resultat =
        nouveauStatut === "validee"
          ? await validerSection(appelOffresId, sectionId)
          : await devaliderSection(appelOffresId, sectionId);
      if ("erreur" in resultat) {
        toast.error(t("erreurValidation"));
        setStatut(precedent);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 pl-4 border-l-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase text-muted-foreground">{t("titre")}</span>
        {sectionId && (
          <Badge variant={statut === "validee" ? "default" : "outline"}>
            {statut === "validee" ? t("statutValidee") : t("statutBrouillon")}
          </Badge>
        )}
      </div>

      {sectionId && (
        <Textarea value={contenu} onChange={(e) => setContenu(e.target.value)} rows={10} />
      )}

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={generer} disabled={generation}>
          {generation ? t("generationEnCours") : sectionId ? t("boutonRegenerer") : t("boutonGenerer")}
        </Button>
        {sectionId && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={sauvegarderContenu} disabled={enregistrement}>
              {t("boutonEnregistrerTexte")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={basculerStatut} disabled={isPending}>
              {statut === "brouillon" ? t("boutonValider") : t("boutonDevalider")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
