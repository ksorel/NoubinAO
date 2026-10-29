"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  televerserModeleCv,
  retirerModeleCv,
  choisirModeleCvDepuisDao,
} from "@/lib/appels-offres/actions";
import { listerCandidatsModeleCv } from "@/lib/appels-offres/modele-cv-candidats";

export function ModeleCv({
  appelOffresId,
  modeleCvPath,
  modeleCvNomOriginal,
  modeleCvMarkdown,
  daoMarkdown,
}: {
  appelOffresId: string;
  modeleCvPath: string | null;
  modeleCvNomOriginal: string | null;
  modeleCvMarkdown: string | null;
  daoMarkdown: string | null;
}) {
  const t = useTranslations("AppelsOffres.detail.modeleCv");
  const [envoi, setEnvoi] = useState(false);
  const [retraitEnCours, setRetraitEnCours] = useState(false);
  const [selectionEnCours, setSelectionEnCours] = useState<string | null>(null);
  // Un modèle peut venir d'un fichier téléversé (modeleCvPath non nul) ou
  // d'une section du DAO choisie ci-dessous (modeleCvPath reste null, seul
  // modeleCvMarkdown est posé) - c'est donc modeleCvMarkdown, pas
  // modeleCvPath, qui indique si un modèle est défini.
  const modeleDefini = modeleCvMarkdown !== null;
  const candidats = modeleDefini ? [] : listerCandidatsModeleCv(daoMarkdown);

  async function onSubmit(formData: FormData) {
    setEnvoi(true);
    try {
      const resultat = await televerserModeleCv(appelOffresId, formData);

      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
        return;
      }
      toast.success(t("toastEnvoye"));
    } finally {
      setEnvoi(false);
    }
  }

  async function choisirDepuisDao(titreSection: string) {
    setSelectionEnCours(titreSection);
    const resultat = await choisirModeleCvDepuisDao(appelOffresId, titreSection);
    setSelectionEnCours(null);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(t("toastEnvoye"));
  }

  async function retirer() {
    setRetraitEnCours(true);
    const resultat = await retirerModeleCv(appelOffresId, modeleCvPath);
    setRetraitEnCours(false);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(t("toastRetire"));
  }

  return (
    <div className="flex flex-col gap-2 border rounded-lg p-4">
      <h2 className="text-lg font-semibold">{t("titre")}</h2>
      <p className="text-sm text-muted-foreground">{t("description")}</p>

      {modeleDefini ? (
        <div className="flex items-center gap-2">
          <span className="text-sm">{modeleCvNomOriginal}</span>
          <Button type="button" variant="ghost" size="sm" onClick={retirer} disabled={retraitEnCours}>
            {retraitEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("boutonRetirer")}
          </Button>
        </div>
      ) : (
        <>
          {candidats.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{t("candidatsTitre")}</p>
              <ul className="flex flex-col gap-2">
                {candidats.map((candidat) => (
                  <li
                    key={candidat.titre}
                    className="flex flex-col gap-1 rounded-md border p-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{candidat.titre}</span>
                      <span className="text-xs text-muted-foreground">{candidat.apercu}</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="self-start sm:self-auto"
                      disabled={selectionEnCours !== null}
                      onClick={() => choisirDepuisDao(candidat.titre)}
                    >
                      {selectionEnCours === candidat.titre && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {t("boutonUtiliserSection")}
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{t("candidatsOuTeleverser")}</p>
            </div>
          )}

          <form action={onSubmit} className="flex items-center gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="modele-cv-fichier">{t("champFichier")}</Label>
              <Input id="modele-cv-fichier" type="file" name="fichier" accept=".pdf,.docx,.doc" required />
            </div>
            <Button type="submit" disabled={envoi}>
              {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
              {envoi ? t("envoiEnCours") : t("boutonTeleverser")}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
