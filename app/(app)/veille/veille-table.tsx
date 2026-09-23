"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
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
import { PaginationControls } from "@/components/ao/pagination-controls";
import type { AvisAoNational, TypeAvisAoNational } from "@/lib/veille/types";

const TAILLE_PAGE = 20;

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
  const [page, setPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [peutScrollerGauche, setPeutScrollerGauche] = useState(false);
  const [peutScrollerDroite, setPeutScrollerDroite] = useState(false);

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

  // Changer de filtre change la liste filtrée : revenir à la page 1 plutôt
  // que de rester sur une page qui peut ne plus exister pour ce filtre.
  useEffect(() => {
    setPage(1);
  }, [secteur, type, recherche]);

  const totalPages = Math.max(1, Math.ceil(avisFiltres.length / TAILLE_PAGE));

  const avisPage = useMemo(
    () => avisFiltres.slice((page - 1) * TAILLE_PAGE, page * TAILLE_PAGE),
    [avisFiltres, page],
  );

  function verifierScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setPeutScrollerGauche(el.scrollLeft > 4);
    setPeutScrollerDroite(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
  }

  // Le tableau a 10 colonnes : le scroll horizontal n'est pas visible au
  // premier coup d'œil, donc on vérifie dès que la page affichée change
  // (pas seulement au montage) pour recalculer si le contenu déborde.
  useEffect(() => {
    verifierScroll();
  }, [avisPage]);

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
        <div className="flex flex-col gap-1.5">
          {/* Affordance de scroll horizontal : 10 colonnes ne tiennent pas
              à l'écran, donc sans ce signal l'utilisateur ne devine pas
              qu'il faut scroller. Deux couches : un dégradé sur le bord
              qui reste scrollable (disparaît une fois qu'on ne peut plus
              aller plus loin dans ce sens) + un texte d'aide visible tant
              que le contenu déborde. Conteneur de scroll géré ici plutôt
              que par le composant Table partagé, qui n'expose pas de ref
              sur son div de défilement. */}
          <div className="relative">
            <div
              ref={scrollRef}
              onScroll={verifierScroll}
              className="w-full overflow-x-auto"
            >
              <table className="w-full caption-bottom text-sm">
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
            {avisPage.map((a) => (
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
              </table>
            </div>
            {peutScrollerGauche && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent"
              />
            )}
            {peutScrollerDroite && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent"
              />
            )}
          </div>
          {(peutScrollerGauche || peutScrollerDroite) && (
            <p className="text-xs text-muted-foreground">{t("table.aideDeroulement")}</p>
          )}
          <PaginationControls
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            labelPrecedent={t("table.pagePrecedent")}
            labelSuivant={t("table.pageSuivant")}
            labelIndicateur={t("table.pageIndicateur", {
              page,
              totalPages,
              total: avisFiltres.length,
            })}
          />
        </div>
      )}
    </div>
  );
}
