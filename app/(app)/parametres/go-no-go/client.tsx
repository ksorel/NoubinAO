"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TypesMarcheTable } from "./types-marche-table";
import { QuestionsTable } from "./questions-table";
import type { TypeMarcheGoNoGo, QuestionGoNoGo } from "@/lib/appels-offres/types";

// Page client : la sélection du type de marché affiché pilote l'affichage
// des questions savoir-faire associées sans aller-retour serveur, cohérent
// avec un écran de paramétrage à faible fréquence de rechargement complet.
export function ParametresGoNoGoClient({
  typesInitiaux,
  questionsInitiales,
}: {
  typesInitiaux: TypeMarcheGoNoGo[];
  questionsInitiales: QuestionGoNoGo[];
}) {
  const t = useTranslations("Parametres.goNoGoTypesMarche");
  const [typeSelectionneId, setTypeSelectionneId] = useState<string | null>(
    typesInitiaux[0]?.id ?? null,
  );

  const typeSelectionne = typesInitiaux.find((type) => type.id === typeSelectionneId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <TypesMarcheTable
        typesInitiaux={typesInitiaux}
        typeSelectionneId={typeSelectionneId}
        onSelectionChange={setTypeSelectionneId}
      />

      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">{t("questionsGenerales")}</h2>
        <QuestionsTable questionsInitiales={questionsInitiales} categorie="administratif" typeMarcheId={null} />
        <QuestionsTable questionsInitiales={questionsInitiales} categorie="ouverture_marche" typeMarcheId={null} />
      </div>

      {typeSelectionne && (
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold">{t("questionsSavoirFaire", { typeMarche: typeSelectionne.nom })}</h2>
          <QuestionsTable
            questionsInitiales={questionsInitiales}
            categorie="savoir_faire"
            typeMarcheId={typeSelectionne.id}
          />
        </div>
      )}
    </div>
  );
}
