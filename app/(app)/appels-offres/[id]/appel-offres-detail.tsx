"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { StatutTraitementBadge } from "../statut-traitement-badge";
import {
  modifierAppelOffres,
  genererUrlTelechargementDao,
} from "@/lib/appels-offres/actions";
import { versValeurDatetimeLocal } from "@/lib/appels-offres/datetime-local";
import type { AppelOffres, ExigenceAo } from "@/lib/appels-offres/types";
import { DocumentsExigence } from "./documents-exigence";
import type { Document } from "@/lib/documents/types";

export function AppelOffresDetail({
  appelOffres,
  exigences,
  documentsParExigence,
  bibliotheque,
}: {
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  documentsParExigence: Record<string, Document[]>;
  bibliotheque: Document[];
}) {
  const t = useTranslations("AppelsOffres.detail");
  const [envoi, setEnvoi] = useState(false);
  const [telechargement, setTelechargement] = useState(false);

  const pret = appelOffres.statut_traitement === "termine";

  async function onSubmit(formData: FormData) {
    setEnvoi(true);
    const resultat = await modifierAppelOffres(appelOffres.id, formData);
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }

    toast.success(t("form.toastEnregistre"));
  }

  async function telecharger() {
    setTelechargement(true);
    const resultat = await genererUrlTelechargementDao(appelOffres.fichier_dao_path);
    setTelechargement(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }

  const piecesRequises = exigences.filter((e) => e.type_exigence === "piece_requise");
  const criteresEvaluation = exigences.filter((e) => e.type_exigence === "critere_evaluation");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <StatutTraitementBadge
          statut={appelOffres.statut_traitement}
          erreurTraitement={appelOffres.erreur_traitement}
          dateCreation={appelOffres.created_at}
        />
        <Button variant="outline" onClick={telecharger} disabled={telechargement}>
          {t("boutonTelecharger")}
        </Button>
      </div>

      {!pret && (
        <p className="text-muted-foreground">
          {appelOffres.statut_traitement === "erreur"
            ? appelOffres.erreur_traitement
            : t("messageTraitementEnCours")}
        </p>
      )}

      <form action={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="titre">{t("form.champTitre")}</Label>
          <Input
            id="titre"
            name="titre"
            defaultValue={appelOffres.titre ?? ""}
            disabled={!pret}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="acheteur">{t("form.champAcheteur")}</Label>
          <Input
            id="acheteur"
            name="acheteur"
            defaultValue={appelOffres.acheteur ?? ""}
            disabled={!pret}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="secteur">{t("form.champSecteur")}</Label>
          <Input
            id="secteur"
            name="secteur"
            defaultValue={appelOffres.secteur ?? ""}
            disabled={!pret}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="dateLimite">{t("form.champDateLimite")}</Label>
          <Input
            id="dateLimite"
            name="dateLimite"
            type="datetime-local"
            defaultValue={versValeurDatetimeLocal(appelOffres.date_limite)}
            disabled={!pret}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="montantCaution">{t("form.champMontantCaution")}</Label>
          <Input
            id="montantCaution"
            name="montantCaution"
            type="number"
            defaultValue={appelOffres.montant_caution ?? ""}
            disabled={!pret}
          />
        </div>

        <Button type="submit" disabled={!pret || envoi}>
          {envoi ? t("form.envoiEnCours") : t("form.boutonEnregistrer")}
        </Button>
      </form>

      {pret && (
        <>
          {appelOffres.sommaire_attendu && appelOffres.sommaire_attendu.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold">{t("exigences.titreSommaire")}</h2>
              <ul className="list-disc pl-5 text-sm">
                {appelOffres.sommaire_attendu.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t("exigences.titrePiecesRequises")}</h2>
            {piecesRequises.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("exigences.aucunePiece")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {piecesRequises.map((exigence) => (
                  <li key={exigence.id} className="border-b pb-2">
                    <p className="font-medium">{exigence.libelle}</p>
                    {exigence.description && (
                      <p className="text-sm text-muted-foreground">{exigence.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t("exigences.source")} : {exigence.source_section}
                    </p>
                    <div className="mt-2">
                      <DocumentsExigence
                        appelOffresId={appelOffres.id}
                        exigenceId={exigence.id}
                        libelleExigence={exigence.libelle}
                        documentsAssocies={documentsParExigence[exigence.id] ?? []}
                        bibliotheque={bibliotheque}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t("exigences.titreCriteres")}</h2>
            {criteresEvaluation.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("exigences.aucunCritere")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {criteresEvaluation.map((exigence) => (
                  <li
                    key={exigence.id}
                    className="flex items-center justify-between border-b pb-2"
                  >
                    <div>
                      <p className="font-medium">{exigence.libelle}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("exigences.source")} : {exigence.source_section}
                      </p>
                    </div>
                    {exigence.ponderation !== null && (
                      <Badge variant="outline">{exigence.ponderation}%</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
