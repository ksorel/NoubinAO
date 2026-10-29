"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  modifierPvOuverture,
  ajouterConcurrentPvOuverture,
  modifierConcurrentPvOuverture,
  supprimerConcurrentPvOuverture,
} from "@/lib/appels-offres/actions";
import { calculerEcartPrixAttributaire } from "@/lib/appels-offres/post-mortem";
import { calculerPositionFourchette } from "@/lib/appels-offres/indicateurs-chiffrage";
import { formaterMontant } from "@/lib/appels-offres/bpu";
import type { PvOuverture, PvOuvertureConcurrent, StatutPipelineAo } from "@/lib/appels-offres/types";
import type { DecisionGoNoGo } from "@/lib/appels-offres/go-no-go";

// PV d'ouverture (Étape 9 "Après dépôt", parcours expert v2, voir
// CLAUDE.md) : visible dès le dépôt (soumis/en_attente), le bloc
// post-mortem (écart de prix, position dans la fourchette, comparaison
// avec le score Go/No-Go prévu) ne s'affiche qu'une fois le résultat connu
// (gagné/perdu) ET le prix de l'attributaire renseigné - avant ça, la
// comparaison n'a simplement pas de sens.
export function PvOuvertureCard({
  appelOffresId,
  pvOuverture,
  concurrentsInitiaux,
  statutPipeline,
  notrePrixTotal,
  fourchettePrixBasse,
  fourchettePrixHaute,
  montantEstimatif,
  decisionPrevue,
  noteTotalePrevue,
}: {
  appelOffresId: string;
  pvOuverture: PvOuverture;
  concurrentsInitiaux: PvOuvertureConcurrent[];
  statutPipeline: StatutPipelineAo;
  notrePrixTotal: number;
  fourchettePrixBasse: number | null;
  fourchettePrixHaute: number | null;
  montantEstimatif: number | null;
  decisionPrevue: DecisionGoNoGo;
  noteTotalePrevue: number;
}) {
  const t = useTranslations("AppelsOffres.detail.pvOuverture");
  const tBadge = useTranslations("Pipeline.badge");
  const [attributaireNom, setAttributaireNom] = useState(pvOuverture.attributaire_nom ?? "");
  const [attributairePrix, setAttributairePrix] = useState(
    pvOuverture.attributaire_prix === null ? "" : String(pvOuverture.attributaire_prix),
  );
  const [notreRang, setNotreRang] = useState(
    pvOuverture.notre_rang === null ? "" : String(pvOuverture.notre_rang),
  );
  const [motifRejet, setMotifRejet] = useState(pvOuverture.motif_rejet ?? "");
  const [attributairePrixEnregistre, setAttributairePrixEnregistre] = useState(pvOuverture.attributaire_prix);
  const [concurrents, setConcurrents] = useState(concurrentsInitiaux);
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouveauPrix, setNouveauPrix] = useState("");
  const [nouveauRang, setNouveauRang] = useState("");
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  async function enregistrer() {
    const resultat = await modifierPvOuverture(appelOffresId, {
      attributaireNom: attributaireNom.trim().length > 0 ? attributaireNom : null,
      attributairePrix: attributairePrix.trim().length > 0 ? attributairePrix : null,
      notreRang: notreRang.trim().length > 0 ? notreRang : null,
      motifRejet: motifRejet.trim().length > 0 ? motifRejet : null,
    });
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setAttributairePrixEnregistre(
      attributairePrix.trim().length > 0 ? Number(attributairePrix) : null,
    );
  }

  async function ajouterConcurrent() {
    if (nouveauNom.trim().length === 0) {
      toast.error(t("champNom"));
      return;
    }
    setAjoutEnCours(true);
    const resultat = await ajouterConcurrentPvOuverture(appelOffresId, pvOuverture.id, {
      nom: nouveauNom,
      prix: nouveauPrix.trim().length > 0 ? nouveauPrix : null,
      rang: nouveauRang.trim().length > 0 ? nouveauRang : null,
    });
    setAjoutEnCours(false);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setConcurrents((liste) => [...liste, resultat.concurrent]);
    setNouveauNom("");
    setNouveauPrix("");
    setNouveauRang("");
  }

  async function modifierConcurrent(id: string, nom: string, prix: string, rang: string) {
    const resultat = await modifierConcurrentPvOuverture(appelOffresId, id, {
      nom,
      prix: prix.trim().length > 0 ? prix : null,
      rang: rang.trim().length > 0 ? rang : null,
    });
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
    }
  }

  async function supprimerConcurrent(id: string) {
    const resultat = await supprimerConcurrentPvOuverture(appelOffresId, id);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setConcurrents((liste) => liste.filter((c) => c.id !== id));
  }

  const resultatConnu = statutPipeline === "gagne" || statutPipeline === "perdu";
  const ecart =
    resultatConnu && attributairePrixEnregistre !== null
      ? calculerEcartPrixAttributaire(notrePrixTotal, attributairePrixEnregistre)
      : null;
  const position =
    resultatConnu && attributairePrixEnregistre !== null
      ? calculerPositionFourchette(
          attributairePrixEnregistre,
          fourchettePrixBasse,
          fourchettePrixHaute,
          montantEstimatif,
        )
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titre")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">{t("champAttributaireNom")}</Label>
            <Input
              value={attributaireNom}
              onChange={(e) => setAttributaireNom(e.target.value)}
              onBlur={enregistrer}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">{t("champAttributairePrix")}</Label>
            <Input
              type="number"
              value={attributairePrix}
              onChange={(e) => setAttributairePrix(e.target.value)}
              onBlur={enregistrer}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">{t("champNotreRang")}</Label>
            <Input type="number" value={notreRang} onChange={(e) => setNotreRang(e.target.value)} onBlur={enregistrer} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("champMotifRejet")}</Label>
          <Textarea value={motifRejet} onChange={(e) => setMotifRejet(e.target.value)} onBlur={enregistrer} rows={2} />
        </div>

        <div className="flex flex-col gap-2 border-t pt-3">
          <h3 className="text-sm font-medium">{t("titreConcurrents")}</h3>
          {concurrents.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("aucunConcurrent")}</p>
          )}
          {concurrents.map((concurrent) => (
            <ConcurrentRow
              key={concurrent.id}
              concurrent={concurrent}
              onModifier={(nom, prix, rang) => modifierConcurrent(concurrent.id, nom, prix, rang)}
              onSupprimer={() => supprimerConcurrent(concurrent.id)}
            />
          ))}
          <div className="flex flex-wrap items-end gap-2">
            <Input
              value={nouveauNom}
              onChange={(e) => setNouveauNom(e.target.value)}
              placeholder={t("champNom")}
              className="w-48"
            />
            <Input
              type="number"
              value={nouveauPrix}
              onChange={(e) => setNouveauPrix(e.target.value)}
              placeholder={t("champPrix")}
              className="w-36"
            />
            <Input
              type="number"
              value={nouveauRang}
              onChange={(e) => setNouveauRang(e.target.value)}
              placeholder={t("champRang")}
              className="w-24"
            />
            <Button type="button" variant="outline" size="sm" onClick={ajouterConcurrent} disabled={ajoutEnCours}>
              {ajoutEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("boutonAjouter")}
            </Button>
          </div>
        </div>

        {resultatConnu && attributairePrixEnregistre !== null && (
          <div className="flex flex-col gap-1 border-t pt-3">
            <h3 className="text-sm font-medium">{t("titrePostMortem")}</h3>
            {ecart && (
              <p className="text-sm text-muted-foreground">
                {t("ecartPrix", {
                  montant: formaterMontant(Math.abs(ecart.ecartAbsolu)),
                  sens: ecart.ecartAbsolu >= 0 ? t("plusCher") : t("moinsCher"),
                  pourcentage: Math.abs(ecart.ecartPourcentage).toFixed(1),
                })}
              </p>
            )}
            {position && (
              <p className="text-sm text-muted-foreground">
                {t("positionFourchette", {
                  pourcentage: position.pourcentageDuMontantEstimatif.toFixed(0),
                  statut: t(`statutFourchette.${position.statut}`),
                })}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {t("comparaisonGoNoGo", {
                decision: t(`decision.${decisionPrevue}`),
                note: noteTotalePrevue,
                resultat: tBadge(statutPipeline),
              })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConcurrentRow({
  concurrent,
  onModifier,
  onSupprimer,
}: {
  concurrent: PvOuvertureConcurrent;
  onModifier: (nom: string, prix: string, rang: string) => void;
  onSupprimer: () => void;
}) {
  const t = useTranslations("AppelsOffres.detail.pvOuverture");
  const [nom, setNom] = useState(concurrent.nom);
  const [prix, setPrix] = useState(concurrent.prix === null ? "" : String(concurrent.prix));
  const [rang, setRang] = useState(concurrent.rang === null ? "" : String(concurrent.rang));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        onBlur={() => onModifier(nom, prix, rang)}
        className="w-48"
      />
      <Input
        type="number"
        value={prix}
        onChange={(e) => setPrix(e.target.value)}
        onBlur={() => onModifier(nom, prix, rang)}
        className="w-36"
      />
      <Input
        type="number"
        value={rang}
        onChange={(e) => setRang(e.target.value)}
        onBlur={() => onModifier(nom, prix, rang)}
        className="w-24"
      />
      <Button type="button" variant="ghost" size="sm" onClick={onSupprimer}>
        {t("boutonSupprimer")}
      </Button>
    </div>
  );
}
