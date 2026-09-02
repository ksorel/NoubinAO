"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatutPipelineSelect } from "./statut-pipeline-select";
import { EcheanceBadge } from "./echeance-badge";
import { STATUTS_PIPELINE_AO } from "@/lib/appels-offres/types";
import type { AppelOffres, StatutPipelineAo } from "@/lib/appels-offres/types";

const CLES_ONGLET: Record<StatutPipelineAo, string> = {
  identifie: "badge.identifie",
  en_preparation: "badge.enPreparation",
  soumis: "badge.soumis",
  en_attente: "badge.enAttente",
  gagne: "badge.gagne",
  perdu: "badge.perdu",
};

export function PipelineTable({ appelsOffres }: { appelsOffres: AppelOffres[] }) {
  const t = useTranslations("Pipeline");
  const [onglet, setOnglet] = useState<StatutPipelineAo | "tous">("tous");

  const onglets: { valeur: StatutPipelineAo | "tous"; libelle: string }[] = [
    { valeur: "tous", libelle: t("table.tabTous") },
    ...STATUTS_PIPELINE_AO.map((statut) => ({
      valeur: statut,
      libelle: t(CLES_ONGLET[statut]),
    })),
  ];

  const appelsOffresFiltres = useMemo(() => {
    if (onglet === "tous") return appelsOffres;
    return appelsOffres.filter((ao) => ao.statut_pipeline === onglet);
  }, [appelsOffres, onglet]);

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={onglet} onValueChange={(v) => setOnglet(v as StatutPipelineAo | "tous")}>
        <TabsList>
          {onglets.map((o) => (
            <TabsTrigger key={o.valeur} value={o.valeur}>
              {o.libelle}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {appelsOffres.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          <p>{t("table.aucunAppelOffres")}</p>
        </div>
      ) : appelsOffresFiltres.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{t("table.aucunResultat")}</p>
      ) : (
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>{t("table.colonneTitre")}</TableHead>
              <TableHead>{t("table.colonneAcheteur")}</TableHead>
              <TableHead>{t("table.colonneStatut")}</TableHead>
              <TableHead>{t("table.colonneEcheance")}</TableHead>
              <TableHead>{t("table.colonneMontantCaution")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appelsOffresFiltres.map((ao) => (
              <TableRow key={ao.id}>
                <TableCell>
                  <Link
                    href={`/appels-offres/${ao.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {ao.titre ?? ao.fichier_dao_nom_original}
                  </Link>
                </TableCell>
                <TableCell>{ao.acheteur ?? "—"}</TableCell>
                <TableCell>
                  <StatutPipelineSelect appelOffresId={ao.id} statutInitial={ao.statut_pipeline} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>
                      {ao.date_limite
                        ? new Date(ao.date_limite).toLocaleDateString("fr-FR")
                        : "—"}
                    </span>
                    <EcheanceBadge dateLimite={ao.date_limite} />
                  </div>
                </TableCell>
                <TableCell>
                  {ao.montant_caution !== null
                    ? `${ao.montant_caution.toLocaleString("fr-FR")} FCFA`
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
