"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { StatutTraitementBadge } from "./statut-traitement-badge";
import { TeleverserDaoDialog } from "./televerser-dao-dialog";
import {
  supprimerAppelOffres,
  obtenirAppelsOffresActualises,
} from "@/lib/appels-offres/actions";
import { tousLesAoStabilises } from "@/lib/appels-offres/polling";
import type { AppelOffres } from "@/lib/appels-offres/types";

const INTERVALLE_POLLING_MS = 4000;

export function AppelOffresTable({
  appelsOffres: appelsOffresInitial,
}: {
  appelsOffres: AppelOffres[];
}) {
  const t = useTranslations("AppelsOffres");
  const [appelsOffres, setAppelsOffres] = useState(appelsOffresInitial);
  const [aSupprimer, setASupprimer] = useState<AppelOffres | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setAppelsOffres(appelsOffresInitial);
  }, [appelsOffresInitial]);

  useEffect(() => {
    if (tousLesAoStabilises(appelsOffresInitial)) return;

    const intervalId = setInterval(async () => {
      const actualises = await obtenirAppelsOffresActualises();
      setAppelsOffres(actualises);
      if (tousLesAoStabilises(actualises)) {
        clearInterval(intervalId);
      }
    }, INTERVALLE_POLLING_MS);

    return () => clearInterval(intervalId);
  }, [appelsOffresInitial]);

  function confirmerSuppression() {
    if (!aSupprimer) return;
    const cible = aSupprimer;
    startTransition(async () => {
      const resultat = await supprimerAppelOffres(cible.id, cible.fichier_dao_path);
      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
      } else {
        toast.success(t("table.toastSupprime"));
        setAppelsOffres((liste) => liste.filter((ao) => ao.id !== cible.id));
      }
      setASupprimer(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <TeleverserDaoDialog libelle={t("dialog.titreBouton")} />
      </div>

      {appelsOffres.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          <p>{t("table.aucunAppelOffres")}</p>
          <TeleverserDaoDialog libelle={t("table.ajouterPremier")} />
        </div>
      ) : (
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>{t("table.colonneTitre")}</TableHead>
              <TableHead>{t("table.colonneAcheteur")}</TableHead>
              <TableHead>{t("table.colonneStatut")}</TableHead>
              <TableHead>{t("table.colonneAjouteLe")}</TableHead>
              <TableHead className="text-right">{t("table.colonneActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appelsOffres.map((ao) => (
              <TableRow key={ao.id}>
                <TableCell>{ao.titre ?? ao.fichier_dao_nom_original}</TableCell>
                <TableCell>{ao.acheteur ?? "—"}</TableCell>
                <TableCell>
                  <StatutTraitementBadge
                    statut={ao.statut_traitement}
                    erreurTraitement={ao.erreur_traitement}
                  />
                </TableCell>
                <TableCell>
                  {new Date(ao.created_at).toLocaleDateString("fr-FR")}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setASupprimer(ao)}
                  >
                    {t("table.supprimer")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AlertDialog
        open={!!aSupprimer}
        onOpenChange={(open) => !open && setASupprimer(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("table.confirmerSuppressionTitre")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("table.confirmerSuppressionDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("table.annuler")}</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={confirmerSuppression}>
              {t("table.supprimer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
