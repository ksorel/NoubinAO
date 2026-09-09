"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { deconnecterCompteEmail } from "@/lib/email/actions";
import type { StatutCompteEmail } from "@/lib/email/types";

export function CompteEmailCard({
  compte,
}: {
  compte: { adresseEmail: string; statut: StatutCompteEmail } | null;
}) {
  const t = useTranslations("Parametres.gmail");
  const [confirmationOuverte, setConfirmationOuverte] = useState(false);
  const [isPending, startTransition] = useTransition();

  function confirmerDeconnexion() {
    startTransition(async () => {
      const resultat = await deconnecterCompteEmail();
      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
      } else {
        toast.success(t("toastDeconnecte"));
      }
      setConfirmationOuverte(false);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titre")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {compte ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{compte.adresseEmail}</p>
            {compte.statut === "erreur" && (
              <p className="text-sm text-destructive">{t("statutErreur")}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("nonConnecte")}</p>
        )}
      </CardContent>
      <CardFooter>
        {compte ? (
          <Button variant="outline" onClick={() => setConfirmationOuverte(true)}>
            {t("boutonDeconnecter")}
          </Button>
        ) : (
          // <a> volontaire plutôt que <Link> : cette route redirige
          // toujours vers une origine externe (Google), la navigation
          // client de Link n'apporte rien ici.
          <Button asChild>
            <a href="/api/email/gmail/connecter">{t("boutonConnecter")}</a>
          </Button>
        )}
      </CardFooter>

      <AlertDialog open={confirmationOuverte} onOpenChange={setConfirmationOuverte}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmerDeconnexionTitre")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmerDeconnexionDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("annuler")}</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={confirmerDeconnexion}>
              {t("boutonDeconnecter")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
