"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { televerserModeleCv, retirerModeleCv } from "@/lib/appels-offres/actions";

export function ModeleCv({
  appelOffresId,
  modeleCvPath,
  modeleCvNomOriginal,
}: {
  appelOffresId: string;
  modeleCvPath: string | null;
  modeleCvNomOriginal: string | null;
}) {
  const t = useTranslations("AppelsOffres.detail.modeleCv");
  const [envoi, setEnvoi] = useState(false);

  async function onSubmit(formData: FormData) {
    setEnvoi(true);
    const resultat = await televerserModeleCv(appelOffresId, formData);
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(t("toastEnvoye"));
  }

  async function retirer() {
    if (!modeleCvPath) return;
    const resultat = await retirerModeleCv(appelOffresId, modeleCvPath);
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

      {modeleCvPath ? (
        <div className="flex items-center gap-2">
          <span className="text-sm">{modeleCvNomOriginal}</span>
          <Button type="button" variant="ghost" size="sm" onClick={retirer}>
            {t("boutonRetirer")}
          </Button>
        </div>
      ) : (
        <form action={onSubmit} className="flex items-center gap-2">
          <input type="file" name="fichier" accept=".pdf,.docx" required />
          <Button type="submit" disabled={envoi}>
            {envoi ? t("envoiEnCours") : t("boutonTeleverser")}
          </Button>
        </form>
      )}
    </div>
  );
}
