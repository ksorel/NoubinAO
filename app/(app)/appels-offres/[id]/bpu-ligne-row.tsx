"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import {
  modifierLigneBpu,
  deplacerLigneBpu,
  supprimerLigneBpu,
  obtenirSuggestionPrixBpu,
} from "@/lib/appels-offres/actions";
import { calculerMontantLigne, calculerPyramideCout } from "@/lib/appels-offres/bpu";
import { calculerChiffrage } from "@/lib/appels-offres/chiffrage";
import type { LigneBpu } from "@/lib/appels-offres/types";
import type { SuggestionPrixBpu } from "@/lib/appels-offres/suggestion-prix-bpu";

export function BpuLigneRow({
  appelOffresId,
  sectionId,
  ligne,
  estPremiere,
  estDerniere,
  tauxFraisStructureDefaut,
  onLignesModifiees,
}: {
  appelOffresId: string;
  sectionId: string;
  ligne: LigneBpu;
  estPremiere: boolean;
  estDerniere: boolean;
  tauxFraisStructureDefaut: number | null;
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
  const [deplie, setDeplie] = useState(false);
  const [suggestion, setSuggestion] = useState<SuggestionPrixBpu | null>(null);
  const [debourseSec, setDebourseSec] = useState(
    ligne.debourse_sec === null ? "" : String(ligne.debourse_sec),
  );
  const [tauxFraisStructure, setTauxFraisStructure] = useState(() => {
    if (ligne.taux_frais_structure !== null) return String(ligne.taux_frais_structure);
    if (tauxFraisStructureDefaut !== null) return String(tauxFraisStructureDefaut);
    return "";
  });

  const [prixAchat, setPrixAchat] = useState("");
  const [tauxChange, setTauxChange] = useState("1");
  const [coefficientApproche, setCoefficientApproche] = useState("1");
  const [margeChiffragePct, setMargeChiffragePct] = useState("");
  const [fraisFixesChiffragePct, setFraisFixesChiffragePct] = useState("");

  const montant = calculerMontantLigne(ligne);
  const pyramide = calculerPyramideCout(ligne);

  const parametresChiffrageValides =
    prixAchat.trim().length > 0 &&
    tauxChange.trim().length > 0 &&
    coefficientApproche.trim().length > 0 &&
    margeChiffragePct.trim().length > 0 &&
    fraisFixesChiffragePct.trim().length > 0;

  const apercuChiffrage = parametresChiffrageValides
    ? calculerChiffrage({
        prixAchat: Number(prixAchat),
        tauxChange: Number(tauxChange),
        coefficientApproche: Number(coefficientApproche),
        margePct: Number(margeChiffragePct),
        fraisFixesPct: Number(fraisFixesChiffragePct),
      })
    : null;

  async function appliquerChiffrage() {
    if (apercuChiffrage === null) return;
    setDebourseSec(String(apercuChiffrage.debourseSec));
    setPrixUnitaire(String(apercuChiffrage.prixUnitaire));
    setSuggestion(null);
    const input = {
      codeArticle: codeArticle.trim().length > 0 ? codeArticle : null,
      designation,
      unite,
      quantite,
      prixUnitaire: String(apercuChiffrage.prixUnitaire),
      debourseSec: String(apercuChiffrage.debourseSec),
      tauxFraisStructure: fraisFixesChiffragePct,
    };
    setTauxFraisStructure(fraisFixesChiffragePct);
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
              prix_unitaire: apercuChiffrage.prixUnitaire,
              debourse_sec: apercuChiffrage.debourseSec,
              taux_frais_structure: Number(fraisFixesChiffragePct),
            }
          : l,
      ),
    );
  }

  function reinitialiser() {
    setCodeArticle(ligne.code_article ?? "");
    setDesignation(ligne.designation);
    setUnite(ligne.unite);
    setQuantite(String(ligne.quantite));
    setPrixUnitaire(ligne.prix_unitaire === null ? "" : String(ligne.prix_unitaire));
    setDebourseSec(ligne.debourse_sec === null ? "" : String(ligne.debourse_sec));
    setTauxFraisStructure(
      ligne.taux_frais_structure === null ? "" : String(ligne.taux_frais_structure),
    );
  }

  async function enregistrer(prixOverride?: string) {
    const prixEffectif = prixOverride ?? prixUnitaire;
    const input = {
      codeArticle: codeArticle.trim().length > 0 ? codeArticle : null,
      designation,
      unite,
      quantite,
      prixUnitaire: prixEffectif.trim().length > 0 ? prixEffectif : null,
      debourseSec: debourseSec.trim().length > 0 ? debourseSec : null,
      tauxFraisStructure: tauxFraisStructure.trim().length > 0 ? tauxFraisStructure : null,
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
              debourse_sec: input.debourseSec === null ? null : Number(input.debourseSec),
              taux_frais_structure:
                input.tauxFraisStructure === null ? null : Number(input.tauxFraisStructure),
            }
          : l,
      ),
    );
  }

  async function surBlurDesignation() {
    await enregistrer();
    if (prixUnitaire.trim().length > 0) {
      setSuggestion(null);
      return;
    }
    const resultat = await obtenirSuggestionPrixBpu(appelOffresId, designation, unite);
    setSuggestion(resultat);
  }

  async function deplacer(sens: "haut" | "bas") {
    const resultat = await deplacerLigneBpu(appelOffresId, sectionId, ligne.id, sens);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    const lignesRetournees = resultat.lignes;
    onLignesModifiees(sectionId, () => lignesRetournees);
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
    <>
      <TableRow>
        <TableCell>
          <Input
            value={codeArticle}
            onChange={(e) => setCodeArticle(e.target.value)}
            onBlur={() => enregistrer()}
            aria-label={t("colonneCode")}
            className="w-20"
          />
        </TableCell>
        <TableCell>
          <Input
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            onBlur={surBlurDesignation}
            aria-label={t("colonneDesignation")}
          />
        </TableCell>
        <TableCell>
          <Input
            value={unite}
            onChange={(e) => setUnite(e.target.value)}
            onBlur={() => enregistrer()}
            aria-label={t("colonneUnite")}
            className="w-20"
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            onBlur={() => enregistrer()}
            aria-label={t("colonneQuantite")}
            className="w-24"
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            value={prixUnitaire}
            onChange={(e) => {
              setPrixUnitaire(e.target.value);
              setSuggestion(null);
            }}
            onBlur={() => enregistrer()}
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
              onClick={() => setDeplie((v) => !v)}
              aria-expanded={deplie}
              aria-label={t("pyramideCout")}
            >
              {deplie ? <ChevronDown /> : <ChevronRight />}
            </Button>
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
      {deplie && (
        <TableRow>
          <TableCell colSpan={7}>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {t("colonneDebourseSec")}
                </label>
                <Input
                  type="number"
                  value={debourseSec}
                  onChange={(e) => setDebourseSec(e.target.value)}
                  onBlur={() => enregistrer()}
                  aria-label={t("colonneDebourseSec")}
                  className="w-32"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {t("colonneTauxFraisStructure")}
                </label>
                <Input
                  type="number"
                  value={tauxFraisStructure}
                  onChange={(e) => setTauxFraisStructure(e.target.value)}
                  onBlur={() => enregistrer()}
                  aria-label={t("colonneTauxFraisStructure")}
                  className="w-24"
                />
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted-foreground">{t("fraisDeStructure")}</span>
                <span>
                  {pyramide === null
                    ? t("nonChiffree")
                    : `${pyramide.fraisDeStructure.toLocaleString("fr-FR")} FCFA`}
                </span>
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted-foreground">{t("marge")}</span>
                <span className={pyramide !== null && pyramide.marge < 0 ? "text-red-600" : ""}>
                  {pyramide === null
                    ? t("nonChiffree")
                    : `${pyramide.marge.toLocaleString("fr-FR")} FCFA (${pyramide.margePourcentage.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%)`}
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3">
              <span className="w-full text-xs font-medium text-muted-foreground">
                {t("chiffrageTitre")}
              </span>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {t("chiffragePrixAchat")}
                </label>
                <Input
                  type="number"
                  value={prixAchat}
                  onChange={(e) => setPrixAchat(e.target.value)}
                  aria-label={t("chiffragePrixAchat")}
                  className="w-28"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {t("chiffrageTauxChange")}
                </label>
                <Input
                  type="number"
                  value={tauxChange}
                  onChange={(e) => setTauxChange(e.target.value)}
                  aria-label={t("chiffrageTauxChange")}
                  className="w-24"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {t("chiffrageCoefficientApproche")}
                </label>
                <Input
                  type="number"
                  value={coefficientApproche}
                  onChange={(e) => setCoefficientApproche(e.target.value)}
                  aria-label={t("chiffrageCoefficientApproche")}
                  className="w-24"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {t("chiffrageMargePct")}
                </label>
                <Input
                  type="number"
                  value={margeChiffragePct}
                  onChange={(e) => setMargeChiffragePct(e.target.value)}
                  aria-label={t("chiffrageMargePct")}
                  className="w-20"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {t("chiffrageFraisFixesPct")}
                </label>
                <Input
                  type="number"
                  value={fraisFixesChiffragePct}
                  onChange={(e) => setFraisFixesChiffragePct(e.target.value)}
                  aria-label={t("chiffrageFraisFixesPct")}
                  className="w-20"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={apercuChiffrage === null}
                onClick={appliquerChiffrage}
              >
                {t("chiffrageAppliquer")}
              </Button>
              {apercuChiffrage !== null && (
                <span className="text-xs text-muted-foreground">
                  {t("chiffrageApercu", {
                    debourse: apercuChiffrage.debourseSec.toLocaleString("fr-FR"),
                    prixUnitaire: apercuChiffrage.prixUnitaire.toLocaleString("fr-FR"),
                  })}
                </span>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
      {suggestion && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/50 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>
                {t("suggestionPrix", {
                  prix: suggestion.prixUnitaire.toLocaleString("fr-FR"),
                  designationOrigine: suggestion.designationOrigine,
                  aoTitre: suggestion.appelOffresTitre ?? t("suggestionPrixAoSansTitre"),
                  date: new Date(suggestion.appelOffresCreatedAt).toLocaleDateString("fr-FR"),
                })}
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const prix = String(suggestion.prixUnitaire);
                    setPrixUnitaire(prix);
                    await enregistrer(prix);
                    setSuggestion(null);
                  }}
                >
                  {t("suggestionPrixUtiliser")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSuggestion(null)}
                >
                  {t("suggestionPrixIgnorer")}
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
