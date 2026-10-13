"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { genererQuestionnaireGoNoGo } from "@/lib/appels-offres/actions";
import { CLES_QUESTION_GO_NO_GO, type SyntheseGoNoGo } from "@/lib/appels-offres/types";

export function QuestionnaireGoNoGo({
  appelOffresId,
  syntheseInitiale,
}: {
  appelOffresId: string;
  syntheseInitiale: SyntheseGoNoGo | null;
}) {
  const t = useTranslations("AppelsOffres.detail.questionnaireGoNoGo");
  const [synthese, setSynthese] = useState(syntheseInitiale);
  const [generation, setGeneration] = useState(false);

  async function generer() {
    setGeneration(true);
    const resultat = await genererQuestionnaireGoNoGo(appelOffresId);
    setGeneration(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setSynthese(resultat.synthese);
    toast.success(t("toastGenere"));
  }

  const reponseParCle = new Map((synthese?.reponses ?? []).map((r) => [r.cle, r]));

  return (
    // Même pattern que GoNoGo : titre et action propres au composant,
    // affichés côte à côte sur la même ligne.
    <div className="flex flex-col gap-3 border rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("titre")}</h2>
        <Button
          onClick={generer}
          disabled={generation}
          variant={synthese ? "outline" : "default"}
          size="sm"
        >
          {generation && <Loader2 className="h-4 w-4 animate-spin" />}
          {generation
            ? t("generationEnCours")
            : synthese
              ? t("boutonRegenerer")
              : t("boutonGenerer")}
        </Button>
      </div>

      {!synthese ? (
        <p className="text-sm text-muted-foreground">{t("vide")}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {t("genereLe", { date: new Date(synthese.genere_le).toLocaleDateString("fr-FR") })}
          </p>
          <ul className="flex flex-col gap-3">
            {CLES_QUESTION_GO_NO_GO.map((cle) => {
              const reponse = reponseParCle.get(cle);
              if (!reponse) return null;
              return (
                <li key={cle} className="border-b pb-2">
                  <p className="font-medium">{t(`questions.${cle}`)}</p>
                  <p className="text-sm">{reponse.reponse}</p>
                  {reponse.source_section && (
                    <p className="text-xs text-muted-foreground">
                      {t("source")} : {reponse.source_section}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
