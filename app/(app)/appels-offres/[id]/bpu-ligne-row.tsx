"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import {
  modifierLigneBpu,
  deplacerLigneBpu,
  supprimerLigneBpu,
} from "@/lib/appels-offres/actions";
import { calculerMontantLigne } from "@/lib/appels-offres/bpu";
import type { LigneBpu } from "@/lib/appels-offres/types";

export function BpuLigneRow({
  appelOffresId,
  sectionId,
  ligne,
  estPremiere,
  estDerniere,
  onLignesModifiees,
}: {
  appelOffresId: string;
  sectionId: string;
  ligne: LigneBpu;
  estPremiere: boolean;
  estDerniere: boolean;
  onLignesModifiees: (
    sectionId: string,
    updater: (lignesCourantes: LigneBpu[]) => LigneBpu[],
  ) => void;
}) {
  const t = useTranslations("AppelsOffres.detail.bpu");
  const [codeArticle, setCodeArticle] = useState(ligne.code_article ?? "");
  const [designation, setDesignation] = useState(ligne.designation);
  const [unite, setUnite] = useState(ligne.unite);
  const [quantite, setQuantite] = useState(String(ligne.quantite));
  const [prixUnitaire, setPrixUnitaire] = useState(
    ligne.prix_unitaire === null ? "" : String(ligne.prix_unitaire),
  );

  const montant = calculerMontantLigne(ligne);

  function reinitialiser() {
    setCodeArticle(ligne.code_article ?? "");
    setDesignation(ligne.designation);
    setUnite(ligne.unite);
    setQuantite(String(ligne.quantite));
    setPrixUnitaire(ligne.prix_unitaire === null ? "" : String(ligne.prix_unitaire));
  }

  async function enregistrer() {
    const input = {
      codeArticle: codeArticle.trim().length > 0 ? codeArticle : null,
      designation,
      unite,
      quantite,
      prixUnitaire: prixUnitaire.trim().length > 0 ? prixUnitaire : null,
    };

    const resultat = await modifierLigneBpu(appelOffresId, ligne.id, input);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      reinitialiser();
      return;
    }

    onLignesModifiees(sectionId, (lignesCourantes) =>
      lignesCourantes.map((l) =>
        l.id === ligne.id
          ? {
              ...l,
              code_article: input.codeArticle,
              designation: input.designation,
              unite: input.unite,
              quantite: Number(input.quantite),
              prix_unitaire: input.prixUnitaire === null ? null : Number(input.prixUnitaire),
            }
          : l,
      ),
    );
  }

  async function deplacer(sens: "haut" | "bas") {
    const resultat = await deplacerLigneBpu(appelOffresId, sectionId, ligne.id, sens);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.location.reload();
  }

  async function supprimer() {
    const resultat = await supprimerLigneBpu(appelOffresId, ligne.id);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onLignesModifiees(sectionId, (lignesCourantes) =>
      lignesCourantes.filter((l) => l.id !== ligne.id),
    );
    toast.success(t("toastLigneSupprimee"));
  }

  return (
    <TableRow>
      <TableCell>
        <Input
          value={codeArticle}
          onChange={(e) => setCodeArticle(e.target.value)}
          onBlur={enregistrer}
          aria-label={t("colonneCode")}
          className="w-20"
        />
      </TableCell>
      <TableCell>
        <Input
          value={designation}
          onChange={(e) => setDesignation(e.target.value)}
          onBlur={enregistrer}
          aria-label={t("colonneDesignation")}
        />
      </TableCell>
      <TableCell>
        <Input
          value={unite}
          onChange={(e) => setUnite(e.target.value)}
          onBlur={enregistrer}
          aria-label={t("colonneUnite")}
          className="w-20"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={quantite}
          onChange={(e) => setQuantite(e.target.value)}
          onBlur={enregistrer}
          aria-label={t("colonneQuantite")}
          className="w-24"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={prixUnitaire}
          onChange={(e) => setPrixUnitaire(e.target.value)}
          onBlur={enregistrer}
          aria-label={t("colonnePrixUnitaire")}
          className="w-28"
        />
      </TableCell>
      <TableCell className="text-right">
        {montant === null ? t("nonChiffree") : `${montant.toLocaleString("fr-FR")} FCFA`}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
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
          <Button type="button" variant="ghost" size="sm" onClick={supprimer}>
            {t("supprimer")}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
