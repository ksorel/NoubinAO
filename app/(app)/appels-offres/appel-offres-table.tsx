"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { PaginationControls } from "@/components/ao/pagination-controls";
import {
  supprimerAppelOffres,
  obtenirAppelsOffresActualises,
} from "@/lib/appels-offres/actions";
import { tousLesAoStabilises } from "@/lib/appels-offres/polling";
import type { AppelOffres } from "@/lib/appels-offres/types";

const INTERVALLE_POLLING_MS = 4000;
const TAILLE_PAGE = 20;

export function AppelOffresTable({
  appelsOffres: appelsOffresInitial,
}: {
  appelsOffres: AppelOffres[];
}) {
  const t = useTranslations("AppelsOffres");
  const locale = useLocale();
  const [appelsOffres, setAppelsOffres] = useState(appelsOffresInitial);
  const [aSupprimer, setASupprimer] = useState<AppelOffres | null>(null);
  const [isPending, startTransition] = useTransition();
  const [page, setPage] = useState(1);

  useEffect(() => {
    setAppelsOffres(appelsOffresInitial);
  }, [appelsOffresInitial]);

  const totalPages = Math.max(1, Math.ceil(appelsOffres.length / TAILLE_PAGE));

  // Si l'actualisation par polling fait varier le nombre d'AO (suppression,
  // nouvel import), la page courante peut dépasser le nouveau total — on la
  // ramène à la dernière page valide plutôt que d'afficher une page vide.
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const appelsOffresPage = useMemo(
    () => appelsOffres.slice((page - 1) * TAILLE_PAGE, page * TAILLE_PAGE),
    [appelsOffres, page],
  );

  useEffect(() => {
    if (tousLesAoStabilises(appelsOffresInitial)) return;

    const intervalId = setInterval(async () => {
      try {
        const actualises = await obtenirAppelsOffresActualises();
        setAppelsOffres(actualises);
        if (tousLesAoStabilises(actualises)) {
          clearInterval(intervalId);
        }
      } catch {
        // Erreur réseau ponctuelle : on retente au prochain intervalle
        // plutôt que de propager un rejet non intercepté depuis
        // setInterval, qui n'aurait aucun effet visible pour
        // l'utilisateur autre qu'un avertissement dans la console.
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
        <div className="flex flex-col gap-3">
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
            {appelsOffresPage.map((ao) => (
              <TableRow key={ao.id}>
                {/* whitespace-normal : le composant Table de base force
                    whitespace-nowrap sur chaque cellule, ce qui étirait la
                    ligne à la largeur du titre le plus long au lieu de le
                    faire revenir à la ligne (même correctif que
                    veille-table.tsx). */}
                <TableCell className="whitespace-normal max-w-xs">
                  {/* Soulignement pointillé en permanence (pas seulement
                      hover:underline, invisible sur mobile sans survol
                      tactile) + bulle d'aide au survol/focus expliquant
                      l'action — signal visuel + explicite pour un
                      nouvel utilisateur. */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={`/appels-offres/${ao.id}`}
                        className="text-primary underline decoration-dotted underline-offset-4"
                      >
                        {ao.titre ?? ao.fichier_dao_nom_original}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent>{t("table.aideClicTitre")}</TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="whitespace-normal max-w-[12rem]">
                  {ao.acheteur ?? "—"}
                </TableCell>
                <TableCell>
                  <StatutTraitementBadge
                    statut={ao.statut_traitement}
                    erreurTraitement={ao.erreur_traitement}
                    dateCreation={ao.created_at}
                  />
                </TableCell>
                <TableCell>
                  {new Date(ao.created_at).toLocaleDateString(locale)}
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
        <PaginationControls
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          labelPrecedent={t("table.pagePrecedent")}
          labelSuivant={t("table.pageSuivant")}
          labelIndicateur={t("table.pageIndicateur", {
            page,
            totalPages,
            total: appelsOffres.length,
          })}
        />
        </div>
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
