"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { mettreAJourEvaluationGoNoGo } from "@/lib/appels-offres/actions";
import { calculerVerdictGoNoGo } from "@/lib/appels-offres/go-no-go";
import { CRITERES_GO_NO_GO, type CritereGoNoGo, type EvaluationGoNoGo } from "@/lib/appels-offres/types";

const CLES_CRITERE = ["juridique", "faisabilite", "rentabilite"] as const;
type CleCritere = (typeof CLES_CRITERE)[number];

const VARIANT_BADGE = {
  go: "default",
  no_go: "destructive",
  en_attente: "outline",
} as const;

export function GoNoGo({
  appelOffresId,
  evaluation,
}: {
  appelOffresId: string;
  evaluation: EvaluationGoNoGo;
}) {
  const t = useTranslations("AppelsOffres.detail.goNoGo");
  const [criteres, setCriteres] = useState<Record<CleCritere, CritereGoNoGo>>({
    juridique: evaluation.critere_juridique,
    faisabilite: evaluation.critere_faisabilite,
    rentabilite: evaluation.critere_rentabilite,
  });
  const [notes, setNotes] = useState<Record<CleCritere, string>>({
    juridique: evaluation.note_juridique ?? "",
    faisabilite: evaluation.note_faisabilite ?? "",
    rentabilite: evaluation.note_rentabilite ?? "",
  });
  const [envoi, setEnvoi] = useState(false);

  const verdict = calculerVerdictGoNoGo(
    criteres.juridique,
    criteres.faisabilite,
    criteres.rentabilite,
  );

  async function enregistrer() {
    setEnvoi(true);
    const resultat = await mettreAJourEvaluationGoNoGo(appelOffresId, {
      critereJuridique: criteres.juridique,
      noteJuridique: notes.juridique.trim() || null,
      critereFaisabilite: criteres.faisabilite,
      noteFaisabilite: notes.faisabilite.trim() || null,
      critereRentabilite: criteres.rentabilite,
      noteRentabilite: notes.rentabilite.trim() || null,
    });
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(t("toastEnregistre"));
  }

  return (
    // Comme ChecklistSoumission (Module 7, sous-projet 1), ce composant
    // possède son propre titre plutôt que de laisser le parent le rendre :
    // le badge de verdict doit être aligné sur la même ligne que le titre
    // et dépend de l'état client (criteres), recalculé à chaque
    // changement.
    <div className="flex flex-col gap-3 border rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("titre")}</h2>
        <Badge variant={VARIANT_BADGE[verdict]}>{t(`verdict.${verdict}`)}</Badge>
      </div>

      {CLES_CRITERE.map((cle) => (
        <div key={cle} className="flex flex-col gap-2">
          <Label htmlFor={`go-no-go-${cle}`}>{t(`criteres.${cle}`)}</Label>
          <Select
            value={criteres[cle]}
            onValueChange={(valeur) =>
              setCriteres((c) => ({ ...c, [cle]: valeur as CritereGoNoGo }))
            }
          >
            <SelectTrigger id={`go-no-go-${cle}`} className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRITERES_GO_NO_GO.map((valeur) => (
                <SelectItem key={valeur} value={valeur}>
                  {t(`critereValeur.${valeur}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={notes[cle]}
            onChange={(e) => setNotes((n) => ({ ...n, [cle]: e.target.value }))}
            placeholder={t("notePlaceholder")}
            aria-label={`${t(`criteres.${cle}`)} — ${t("notePlaceholder")}`}
            rows={2}
          />
        </div>
      ))}

      <Button onClick={enregistrer} disabled={envoi} className="self-start">
        {envoi ? t("envoiEnCours") : t("boutonEnregistrer")}
      </Button>
    </div>
  );
}
