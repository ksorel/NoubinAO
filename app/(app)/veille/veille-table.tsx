"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { importerAvis } from "@/lib/veille/actions";
import type { AvisAoNational, TypeAvisAoNational } from "@/lib/veille/types";

export function VeilleTable({
  avis,
  avisImportesIds,
}: {
  avis: AvisAoNational[];
  avisImportesIds: string[];
}) {
  const t = useTranslations("Veille");
  const [secteur, setSecteur] = useState<string>("tous");
  const [type, setType] = useState<TypeAvisAoNational | "tous">("tous");
  const [recherche, setRecherche] = useState("");
  const [importes, setImportes] = useState(new Set(avisImportesIds));
  const [isPending, startTransition] = useTransition();
  const [avisEnCours, setAvisEnCours] = useState<string | null>(null);

  const secteurs = useMemo(
    () => [...new Set(avis.map((a) => a.secteur).filter((s): s is string => !!s))],
    [avis],
  );

  const avisFiltres = useMemo(() => {
    return avis.filter((a) => {
      const correspondSecteur = secteur === "tous" || a.secteur === secteur;
      const correspondType = type === "tous" || a.type === type;
      const correspondRecherche = (a.objet ?? "")
        .toLowerCase()
        .includes(recherche.toLowerCase());
      return correspondSecteur && correspondType && correspondRecherche;
    });
  }, [avis, secteur, type, recherche]);

  function importer(avisId: string) {
    setAvisEnCours(avisId);
    startTransition(async () => {
      const resultat = await importerAvis(avisId);
      setAvisEnCours(null);
      if ("erreur" in resultat) {
        toast.error(t("table.erreurImport"));
      } else {
        setImportes((prev) => new Set(prev).add(avisId));
        toast.success(t("table.toastImporte"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <select
          aria-label={t("filtres.tousSecteurs")}
          value={secteur}
          onChange={(e) => setSecteur(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="tous">{t("filtres.tousSecteurs")}</option>
          {secteurs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label={t("filtres.tousTypes")}
          value={type}
          onChange={(e) => setType(e.target.value as TypeAvisAoNational | "tous")}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="tous">{t("filtres.tousTypes")}</option>
          <option value="travaux">{t("filtres.type.travaux")}</option>
          <option value="fournitures">{t("filtres.type.fournitures")}</option>
          <option value="prestations">{t("filtres.type.prestations")}</option>
          <option value="manifestation_interet">
            {t("filtres.type.manifestation_interet")}
          </option>
        </select>
        <Input
          placeholder={t("filtres.rechercherPlaceholder")}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="w-full sm:w-64"
        />
      </div>

      {avis.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{t("table.aucunAvis")}</p>
      ) : avisFiltres.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{t("table.aucunResultat")}</p>
      ) : (
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>{t("table.colonneReference")}</TableHead>
              <TableHead>{t("table.colonneType")}</TableHead>
              <TableHead>{t("table.colonneObjet")}</TableHead>
              <TableHead>{t("table.colonneAcheteur")}</TableHead>
              <TableHead>{t("table.colonneSecteur")}</TableHead>
              <TableHead>{t("table.colonneMontantCaution")}</TableHead>
              <TableHead>{t("table.colonneLots")}</TableHead>
              <TableHead>{t("table.colonneDateLimite")}</TableHead>
              <TableHead>{t("table.colonneContactRetrait")}</TableHead>
              <TableHead className="text-right">{t("table.colonneActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {avisFiltres.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{a.reference}</TableCell>
                <TableCell>
                  {a.type ? t(`filtres.type.${a.type}`) : "—"}
                </TableCell>
                {/* whitespace-normal : le composant Table de base force
                    whitespace-nowrap sur chaque cellule (voir
                    components/ui/table.tsx), ce qui étirait la ligne
                    entière à la largeur du texte le plus long au lieu de
                    le faire revenir à la ligne — override localisé aux
                    seules colonnes à texte long, pas au composant partagé
                    (les autres tableaux du projet gardent leur
                    comportement actuel). */}
                <TableCell className="whitespace-normal max-w-xs">{a.objet}</TableCell>
                <TableCell className="whitespace-normal max-w-[12rem]">
                  {a.autorite_contractante}
                </TableCell>
                <TableCell>{a.secteur}</TableCell>
                <TableCell>
                  {a.montant_caution ? `${a.montant_caution.toLocaleString("fr-FR")} FCFA` : "—"}
                </TableCell>
                <TableCell>{a.nombre_lots ?? "—"}</TableCell>
                <TableCell>
                  {/* date_limite_remise_offres est une date seule
                      (YYYY-MM-DD) : sans timeZone UTC, Date la parse à
                      minuit UTC puis l'affiche en heure locale, soit un
                      jour trop tôt sur tout décalage négatif. Même
                      correctif que retroplanning.tsx. */}
                  {a.date_limite_remise_offres
                    ? new Date(a.date_limite_remise_offres).toLocaleDateString("fr-FR", {
                        timeZone: "UTC",
                      })
                    : "—"}
                </TableCell>
                {/* Seule information actionnable de l'avis : le BOMP ne
                    contient pas le dossier complet, le client doit aller le
                    retirer auprès de ce contact (voir spec). Affichée dès
                    la liste pour qu'il puisse en juger AVANT d'importer. */}
                <TableCell className="whitespace-normal max-w-[14rem]">
                  {a.contact_retrait ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={importes.has(a.id) || (isPending && avisEnCours === a.id)}
                    onClick={() => importer(a.id)}
                  >
                    {importes.has(a.id) ? t("table.dejaImporte") : t("table.boutonImporter")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
