"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { televerserDao } from "@/lib/appels-offres/actions";

// Les Server Actions de Next.js n'exposent pas la progression réelle de
// l'envoi (contrairement à XMLHttpRequest). Cette barre progresse par
// paliers décroissants vers un plafond de 90% tant que l'envoi dure,
// puis saute à 100% dès que le résultat arrive — un signal honnête
// ("toujours en cours") sans jamais prétendre à tort que c'est terminé.
const PLAFOND_PROGRESSION = 90;
const INTERVALLE_PROGRESSION_MS = 300;
// Durée minimale pendant laquelle l'indicateur "en cours" reste affiché,
// même si le serveur répond plus vite — voir le commentaire dans onSubmit.
const DUREE_MINIMALE_AFFICHAGE_MS = 800;

export function TeleverserDaoDialog({ libelle }: { libelle: string }) {
  const t = useTranslations("AppelsOffres.dialog");
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [progression, setProgression] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!envoi) {
      setProgression(0);
      return;
    }

    const intervalId = setInterval(() => {
      setProgression((valeur) => valeur + (PLAFOND_PROGRESSION - valeur) * 0.1);
    }, INTERVALLE_PROGRESSION_MS);

    return () => clearInterval(intervalId);
  }, [envoi]);

  async function onSubmit(formData: FormData) {
    setEnvoi(true);
    const debut = Date.now();
    const resultat = await televerserDao(formData);

    // Sur un fichier léger et une connexion rapide, l'aller-retour peut
    // se terminer en quelques dizaines de millisecondes — trop court
    // pour qu'un navigateur peigne l'état "en cours" avant de le
    // remplacer par le suivant. On garantit un minimum d'affichage pour
    // que l'indicateur soit toujours visible, quelle que soit la vitesse
    // réelle de l'opération.
    const ecoule = Date.now() - debut;
    if (ecoule < DUREE_MINIMALE_AFFICHAGE_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, DUREE_MINIMALE_AFFICHAGE_MS - ecoule),
      );
    }

    if ("erreur" in resultat) {
      setEnvoi(false);
      toast.error(resultat.erreur);
      return;
    }

    setEnvoi(false);
    toast.success(t("toastAjoute"));
    setOuvert(false);
    formRef.current?.reset();
  }

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>
        <Button>{libelle}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("titre")}</DialogTitle>
          <DialogDescription>{t("confidentialite")}</DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fichier">{t("champFichier")}</Label>
            <Input
              id="fichier"
              name="fichier"
              type="file"
              accept=".pdf,.docx"
              required
              disabled={envoi}
            />
          </div>

          {envoi && <Progress value={progression} />}

          <DialogFooter>
            <Button type="submit" disabled={envoi}>
              {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
              {envoi ? t("envoiEnCours") : t("boutonTeleverser")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
