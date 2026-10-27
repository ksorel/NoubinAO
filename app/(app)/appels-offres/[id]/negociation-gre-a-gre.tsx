"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ajouterTourNegociation,
  supprimerTourNegociation,
  genererDocumentNegociation,
} from "@/lib/appels-offres/actions";
import { formaterMontant } from "@/lib/appels-offres/bpu";
import type { TourNegociationGreAGre } from "@/lib/appels-offres/types";

export function NegociationGreAGre({
  appelOffresId,
  toursInitiaux,
}: {
  appelOffresId: string;
  toursInitiaux: TourNegociationGreAGre[];
}) {
  const t = useTranslations("AppelsOffres.detail.negociationGreAGre");
  const [tours, setTours] = useState(toursInitiaux);
  const [nouveauMontant, setNouveauMontant] = useState("");
  const [nouvelleDate, setNouvelleDate] = useState(new Date().toISOString().slice(0, 10));
  const [nouveauCommentaire, setNouveauCommentaire] = useState("");
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  // Chemin "<tourId>-<type>" du document en cours de génération — sert à
  // n'afficher le spinner que sur le bon bouton (un tour a deux documents
  // possibles, proforma et lettre révisée).
  const [generationEnCours, setGenerationEnCours] = useState<string | null>(null);

  async function ajouter() {
    if (nouveauMontant.trim().length === 0 || nouvelleDate.length === 0) return;

    setAjoutEnCours(true);
    const resultat = await ajouterTourNegociation(appelOffresId, {
      montantPropose: nouveauMontant,
      dateTour: nouvelleDate,
      commentaire: nouveauCommentaire.trim().length > 0 ? nouveauCommentaire : null,
    });
    setAjoutEnCours(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setTours((liste) => [...liste, resultat.tour]);
    setNouveauMontant("");
    setNouveauCommentaire("");
    toast.success(t("toastAjoute"));
  }

  async function supprimer(tourId: string) {
    const resultat = await supprimerTourNegociation(appelOffresId, tourId);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setTours((liste) => liste.filter((tr) => tr.id !== tourId));
  }

  async function generer(tourId: string, type: "proforma" | "lettre-proposition-revisee") {
    setGenerationEnCours(`${tourId}-${type}`);
    const resultat = await genererDocumentNegociation(appelOffresId, tourId, type);
    setGenerationEnCours(null);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <h2 className="text-lg font-semibold">{t("titre")}</h2>
      <p className="text-sm text-muted-foreground">{t("explication")}</p>

      {tours.length === 0 && <p className="text-sm text-muted-foreground">{t("aucunTour")}</p>}

      {tours.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {tours.map((tour) => (
            <li key={tour.id} className="flex flex-wrap items-center gap-2 border-b pb-2">
              <span className="font-medium">{t("tourNumero", { numero: tour.numero })}</span>
              <span>{formaterMontant(tour.montant_propose)} FCFA</span>
              <span className="text-xs text-muted-foreground">
                {new Date(tour.date_tour).toLocaleDateString("fr-FR")}
              </span>
              {tour.commentaire && (
                <span className="text-xs text-muted-foreground">{tour.commentaire}</span>
              )}
              <div className="ml-auto flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={generationEnCours === `${tour.id}-proforma`}
                  onClick={() => generer(tour.id, "proforma")}
                >
                  {generationEnCours === `${tour.id}-proforma` && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {t("boutonProforma")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={generationEnCours === `${tour.id}-lettre-proposition-revisee`}
                  onClick={() => generer(tour.id, "lettre-proposition-revisee")}
                >
                  {generationEnCours === `${tour.id}-lettre-proposition-revisee` && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {t("boutonLettreRevisee")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => supprimer(tour.id)}>
                  {t("supprimer")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouveau-tour-montant" className="text-xs text-muted-foreground">
            {t("champMontant")}
          </Label>
          <Input
            id="nouveau-tour-montant"
            type="number"
            value={nouveauMontant}
            onChange={(e) => setNouveauMontant(e.target.value)}
            className="w-36"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouveau-tour-date" className="text-xs text-muted-foreground">
            {t("champDate")}
          </Label>
          <Input
            id="nouveau-tour-date"
            type="date"
            value={nouvelleDate}
            onChange={(e) => setNouvelleDate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouveau-tour-commentaire" className="text-xs text-muted-foreground">
            {t("champCommentaire")}
          </Label>
          <Input
            id="nouveau-tour-commentaire"
            value={nouveauCommentaire}
            onChange={(e) => setNouveauCommentaire(e.target.value)}
            className="w-48"
          />
        </div>
        <Button type="button" variant="outline" onClick={ajouter} disabled={ajoutEnCours}>
          {ajoutEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
          {ajoutEnCours ? t("ajoutEnCours") : t("boutonAjouter")}
        </Button>
      </div>
    </div>
  );
}
