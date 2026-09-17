"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
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
import {
  renommerSectionBpu,
  deplacerSectionBpu,
  supprimerSectionBpu,
  creerLigneBpu,
} from "@/lib/appels-offres/actions";
import { sommerMontants } from "@/lib/appels-offres/bpu";
import type { SectionBpu, LigneBpu } from "@/lib/appels-offres/types";
import { BpuLigneRow } from "./bpu-ligne-row";

export function BpuSection({
  appelOffresId,
  section,
  lignes,
  estPremiere,
  estDerniere,
  tauxFraisStructureDefaut,
  onSectionModifiee,
  onSectionSupprimee,
  onSectionsReordonnees,
  onLignesModifiees,
}: {
  appelOffresId: string;
  section: SectionBpu;
  lignes: LigneBpu[];
  estPremiere: boolean;
  estDerniere: boolean;
  tauxFraisStructureDefaut: number | null;
  onSectionModifiee: (section: SectionBpu) => void;
  onSectionSupprimee: (sectionId: string) => void;
  onSectionsReordonnees: (sections: SectionBpu[]) => void;
  onLignesModifiees: (
    sectionId: string,
    updater: (lignesCourantes: LigneBpu[]) => LigneBpu[],
  ) => void;
}) {
  const t = useTranslations("AppelsOffres.detail.bpu");
  const [titre, setTitre] = useState(section.titre);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [confirmationOuverte, setConfirmationOuverte] = useState(false);
  const [nouvelleLigne, setNouvelleLigne] = useState({
    codeArticle: "",
    designation: "",
    unite: "",
    quantite: "",
    prixUnitaire: "",
  });

  const totalSection = sommerMontants(lignes);

  async function renommer() {
    const titreTaille = titre.trim();
    if (titreTaille.length === 0 || titreTaille === section.titre) {
      setTitre(section.titre);
      return;
    }

    const resultat = await renommerSectionBpu(appelOffresId, section.id, titre);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      setTitre(section.titre);
      return;
    }
    onSectionModifiee({ ...section, titre: titreTaille });
  }

  async function deplacer(sens: "haut" | "bas") {
    const resultat = await deplacerSectionBpu(appelOffresId, section.id, sens);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onSectionsReordonnees(resultat.sections);
  }

  async function supprimer() {
    const resultat = await supprimerSectionBpu(appelOffresId, section.id);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setConfirmationOuverte(false);
    onSectionSupprimee(section.id);
    toast.success(t("toastSectionSupprimee"));
  }

  async function ajouterLigne() {
    if (
      nouvelleLigne.designation.trim().length === 0 ||
      nouvelleLigne.unite.trim().length === 0 ||
      nouvelleLigne.quantite.trim().length === 0
    ) {
      toast.error(t("champsRequis"));
      return;
    }

    setAjoutEnCours(true);
    const resultat = await creerLigneBpu(appelOffresId, section.id, {
      codeArticle: nouvelleLigne.codeArticle.trim().length > 0 ? nouvelleLigne.codeArticle : null,
      designation: nouvelleLigne.designation,
      unite: nouvelleLigne.unite,
      quantite: nouvelleLigne.quantite,
      prixUnitaire:
        nouvelleLigne.prixUnitaire.trim().length > 0 ? nouvelleLigne.prixUnitaire : null,
      debourseSec: null,
      tauxFraisStructure: null,
    });
    setAjoutEnCours(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onLignesModifiees(section.id, (lignesCourantes) => [...lignesCourantes, resultat.ligne]);
    setNouvelleLigne({ codeArticle: "", designation: "", unite: "", quantite: "", prixUnitaire: "" });
    toast.success(t("toastLigneAjoutee"));
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Input
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          onBlur={renommer}
          className="font-medium"
          aria-label={t("champTitreSection")}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => deplacer("haut")}
          disabled={estPremiere}
          aria-label={t("deplacerHaut")}
        >
          {t("fleche.haut")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => deplacer("bas")}
          disabled={estDerniere}
          aria-label={t("deplacerBas")}
        >
          {t("fleche.bas")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirmationOuverte(true)}
        >
          {t("supprimerSection")}
        </Button>
      </div>

      {lignes.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colonneCode")}</TableHead>
              <TableHead>{t("colonneDesignation")}</TableHead>
              <TableHead>{t("colonneUnite")}</TableHead>
              <TableHead>{t("colonneQuantite")}</TableHead>
              <TableHead>{t("colonnePrixUnitaire")}</TableHead>
              <TableHead>{t("colonneMontant")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lignes.map((ligne, index) => (
              <BpuLigneRow
                key={ligne.id}
                appelOffresId={appelOffresId}
                sectionId={section.id}
                ligne={ligne}
                estPremiere={index === 0}
                estDerniere={index === lignes.length - 1}
                tauxFraisStructureDefaut={tauxFraisStructureDefaut}
                onLignesModifiees={onLignesModifiees}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <p className="text-right text-sm font-medium">
        {t("totalSection")} : {totalSection.toLocaleString("fr-FR")} FCFA
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <Input
          placeholder={t("colonneCode")}
          value={nouvelleLigne.codeArticle}
          onChange={(e) => setNouvelleLigne((v) => ({ ...v, codeArticle: e.target.value }))}
          aria-label={t("colonneCode")}
          className="w-20"
        />
        <Input
          placeholder={t("colonneDesignation")}
          value={nouvelleLigne.designation}
          onChange={(e) => setNouvelleLigne((v) => ({ ...v, designation: e.target.value }))}
          aria-label={t("colonneDesignation")}
        />
        <Input
          placeholder={t("colonneUnite")}
          value={nouvelleLigne.unite}
          onChange={(e) => setNouvelleLigne((v) => ({ ...v, unite: e.target.value }))}
          aria-label={t("colonneUnite")}
          className="w-20"
        />
        <Input
          type="number"
          placeholder={t("colonneQuantite")}
          value={nouvelleLigne.quantite}
          onChange={(e) => setNouvelleLigne((v) => ({ ...v, quantite: e.target.value }))}
          aria-label={t("colonneQuantite")}
          className="w-24"
        />
        <Input
          type="number"
          placeholder={t("colonnePrixUnitaire")}
          value={nouvelleLigne.prixUnitaire}
          onChange={(e) => setNouvelleLigne((v) => ({ ...v, prixUnitaire: e.target.value }))}
          aria-label={t("colonnePrixUnitaire")}
          className="w-28"
        />
        <Button type="button" variant="outline" onClick={ajouterLigne} disabled={ajoutEnCours}>
          {ajoutEnCours ? t("ajoutEnCours") : t("boutonAjouterLigne")}
        </Button>
      </div>

      <AlertDialog open={confirmationOuverte} onOpenChange={setConfirmationOuverte}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmerSuppressionSectionTitre")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmerSuppressionSectionDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("annuler")}</AlertDialogCancel>
            <AlertDialogAction onClick={supprimer}>{t("supprimerSection")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
