"use client";

import { useTranslations } from "next-intl";
import { formaterMontant } from "@/lib/appels-offres/bpu";
import type { IndicateursChiffrage as IndicateursChiffrageValeurs } from "@/lib/appels-offres/indicateurs-chiffrage";

const COULEUR_STATUT: Record<string, string> = {
  basse: "text-amber-600 dark:text-amber-400",
  haute: "text-amber-600 dark:text-amber-400",
  normale: "text-emerald-600 dark:text-emerald-400",
};

export function IndicateursChiffrage({
  indicateurs,
}: {
  indicateurs: IndicateursChiffrageValeurs;
}) {
  const t = useTranslations("AppelsOffres.detail.bpu.indicateurs");

  return (
    <div className="grid gap-3 rounded-md border p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <p className="text-xs text-muted-foreground">{t("totalHt")}</p>
        <p className="font-medium">{formaterMontant(indicateurs.totalHt)} FCFA</p>
      </div>

      <div>
        <p className="text-xs text-muted-foreground">{t("totalTtc")}</p>
        <p className="font-medium">
          {indicateurs.tva === null
            ? t("regimeFiscalInconnu")
            : `${formaterMontant(indicateurs.tva.montantTtc)} FCFA`}
        </p>
      </div>

      <div>
        <p className="text-xs text-muted-foreground">{t("coutDeRevient")}</p>
        <p className="font-medium">{formaterMontant(indicateurs.coutDeRevient)} FCFA</p>
      </div>

      <div>
        <p className="text-xs text-muted-foreground">{t("margeBrute")}</p>
        <p className="font-medium">
          {formaterMontant(indicateurs.margeBrute)} FCFA (
          {indicateurs.margeBrutePourcentage.toLocaleString("fr-FR", {
            maximumFractionDigits: 1,
          })}
          %)
        </p>
      </div>

      <div className="sm:col-span-2 lg:col-span-4">
        <p className="text-xs text-muted-foreground">{t("positionFourchette")}</p>
        {indicateurs.positionFourchette === null ? (
          <p className="text-sm text-muted-foreground">{t("positionFourchetteInconnue")}</p>
        ) : (
          <p className={`font-medium ${COULEUR_STATUT[indicateurs.positionFourchette.statut]}`}>
            {indicateurs.positionFourchette.pourcentageDuMontantEstimatif.toLocaleString("fr-FR", {
              maximumFractionDigits: 1,
            })}
            % — {t(`statutFourchette.${indicateurs.positionFourchette.statut}`)}
          </p>
        )}
      </div>
    </div>
  );
}
