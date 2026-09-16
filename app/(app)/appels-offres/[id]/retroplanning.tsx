"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  genererJalonsRetroplanning,
  creerJalon,
  basculerJalonCoche,
  supprimerJalon,
} from "@/lib/appels-offres/actions";
import type { JalonRetroplanning } from "@/lib/appels-offres/types";

function trierJalons(jalons: JalonRetroplanning[]): JalonRetroplanning[] {
  return [...jalons].sort((a, b) => {
    if (a.date_cible !== b.date_cible) return a.date_cible < b.date_cible ? -1 : 1;
    return a.ordre - b.ordre;
  });
}

export function Retroplanning({
  appelOffresId,
  dateLimiteConnue,
  jalonsInitiaux,
}: {
  appelOffresId: string;
  dateLimiteConnue: boolean;
  jalonsInitiaux: JalonRetroplanning[];
}) {
  const t = useTranslations("AppelsOffres.detail.retroplanning");
  const [jalons, setJalons] = useState(jalonsInitiaux);
  const [nouveauLibelle, setNouveauLibelle] = useState("");
  const [nouvelleDate, setNouvelleDate] = useState("");
  const [genereEnCours, setGenereEnCours] = useState(false);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [, startTransition] = useTransition();
  const aujourdHui = new Date().toISOString().slice(0, 10);

  async function generer() {
    setGenereEnCours(true);
    const resultat = await genererJalonsRetroplanning(appelOffresId);
    setGenereEnCours(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setJalons(trierJalons(resultat.jalons));
    toast.success(t("toastGenere"));
  }

  async function ajouter() {
    if (nouveauLibelle.trim().length === 0 || nouvelleDate.length === 0) return;

    setAjoutEnCours(true);
    const resultat = await creerJalon(appelOffresId, {
      libelle: nouveauLibelle,
      dateCible: nouvelleDate,
    });
    setAjoutEnCours(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setJalons((liste) => trierJalons([...liste, resultat.jalon]));
    setNouveauLibelle("");
    setNouvelleDate("");
    toast.success(t("toastAjoute"));
  }

  function basculer(jalonId: string, coche: boolean) {
    setJalons((liste) => liste.map((j) => (j.id === jalonId ? { ...j, coche } : j)));

    startTransition(async () => {
      const resultat = await basculerJalonCoche(appelOffresId, jalonId, coche);
      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
        setJalons((liste) =>
          liste.map((j) => (j.id === jalonId ? { ...j, coche: !coche } : j)),
        );
      }
    });
  }

  function supprimer(jalonId: string) {
    const jalonSupprime = jalons.find((j) => j.id === jalonId);
    if (!jalonSupprime) return;

    setJalons((liste) => liste.filter((j) => j.id !== jalonId));

    startTransition(async () => {
      const resultat = await supprimerJalon(appelOffresId, jalonId);
      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
        setJalons((liste) => trierJalons([...liste, jalonSupprime]));
      }
    });
  }

  const enRetard = (jalon: JalonRetroplanning) => !jalon.coche && jalon.date_cible < aujourdHui;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("titre")}</h2>

      {jalons.length === 0 &&
        (dateLimiteConnue ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t("aucunJalon")}</p>
            <Button
              type="button"
              variant="outline"
              onClick={generer}
              disabled={genereEnCours}
              className="self-start"
            >
              {genereEnCours ? t("generationEnCours") : t("boutonGenerer")}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("dateLimiteInconnue")}</p>
        ))}

      {jalons.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {jalons.map((jalon) => (
            <li key={jalon.id} className="flex items-center gap-2">
              <Checkbox
                id={`jalon-${jalon.id}`}
                checked={jalon.coche}
                onCheckedChange={(valeur) => basculer(jalon.id, valeur === true)}
              />
              <Label htmlFor={`jalon-${jalon.id}`} className="flex-1 font-normal">
                <span className={enRetard(jalon) ? "font-medium text-destructive" : undefined}>
                  {jalon.date_cible}
                </span>
                {" — "}
                {jalon.libelle}
                {enRetard(jalon) && (
                  <span className="ml-2 text-xs text-destructive">{t("enRetard")}</span>
                )}
              </Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => supprimer(jalon.id)}>
                {t("supprimer")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouveau-jalon-libelle" className="text-xs text-muted-foreground">
            {t("champLibelle")}
          </Label>
          <Input
            id="nouveau-jalon-libelle"
            value={nouveauLibelle}
            onChange={(e) => setNouveauLibelle(e.target.value)}
            placeholder={t("libellePlaceholder")}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouveau-jalon-date" className="text-xs text-muted-foreground">
            {t("champDate")}
          </Label>
          <Input
            id="nouveau-jalon-date"
            type="date"
            value={nouvelleDate}
            onChange={(e) => setNouvelleDate(e.target.value)}
          />
        </div>
        <Button type="button" variant="outline" onClick={ajouter} disabled={ajoutEnCours}>
          {ajoutEnCours ? t("ajoutEnCours") : t("boutonAjouter")}
        </Button>
      </div>
    </div>
  );
}
