"use client";

import { useState, useTransition } from "react";
import { useTranslations, useFormatter } from "next-intl";
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
import { deconnecterCompteEmail, synchroniserMaintenant } from "@/lib/email/actions";
import type { StatutCompteEmail } from "@/lib/email/types";

export function CompteEmailCard({
  compte,
}: {
  compte: {
    adresseEmail: string;
    statut: StatutCompteEmail;
    dernierSyncLe: string | null;
  } | null;
}) {
  const t = useTranslations("Parametres.gmail");
  const formatter = useFormatter();
  const [confirmationOuverte, setConfirmationOuverte] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSyncPending, startSyncTransition] = useTransition();

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

  function synchroniser() {
    startSyncTransition(async () => {
      const resultat = await synchroniserMaintenant();
      if ("erreur" in resultat) {
        toast.error(t("toastSyncErreur"));
      } else {
        toast.success(t("toastSyncSucces", { count: resultat.messagesSynchronises }));
      }
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
            <p className="text-sm text-muted-foreground">
              {compte.dernierSyncLe
                ? t("dernierSync", {
                    date: formatter.dateTime(new Date(compte.dernierSyncLe), {
                      dateStyle: "short",
                      timeStyle: "short",
                    }),
                  })
                : t("jamaisSynchronise")}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("nonConnecte")}</p>
        )}
      </CardContent>
      <CardFooter className="flex gap-2">
        {compte ? (
          <>
            <Button
              variant="outline"
              onClick={synchroniser}
              disabled={isSyncPending}
            >
              {isSyncPending ? t("synchronisationEnCours") : t("boutonSynchroniser")}
            </Button>
            <Button variant="outline" onClick={() => setConfirmationOuverte(true)}>
              {t("boutonDeconnecter")}
            </Button>
          </>
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
