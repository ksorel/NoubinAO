"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="modele-cv-fichier">{t("champFichier")}</Label>
            <Input id="modele-cv-fichier" type="file" name="fichier" accept=".pdf,.docx,.doc" required />
          </div>
          <Button type="submit" disabled={envoi}>
            {envoi ? t("envoiEnCours") : t("boutonTeleverser")}
          </Button>
        </form>
      )}
    </div>
  );
}
