"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RAISONS_RESULTAT_PERDU, RAISONS_RESULTAT_GAGNE } from "@/lib/appels-offres/types";

const VALEUR_AUCUNE_RAISON = "__aucune__";

export function ResultatDialogue({
  ouvert,
  onOuvertChange,
  statutPipeline,
  raisonInitiale,
  noteInitiale,
  onPasser,
  onEnregistrer,
}: {
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
  statutPipeline: "gagne" | "perdu";
  raisonInitiale: string | null;
  noteInitiale: string | null;
  onPasser?: () => Promise<void>;
  onEnregistrer: (raison: string | null, note: string | null) => Promise<void>;
}) {
  const t = useTranslations("Pipeline.postMortem");
  const [raison, setRaison] = useState(raisonInitiale ?? VALEUR_AUCUNE_RAISON);
  const [note, setNote] = useState(noteInitiale ?? "");
  const [envoi, setEnvoi] = useState(false);

  const raisons = statutPipeline === "perdu" ? RAISONS_RESULTAT_PERDU : RAISONS_RESULTAT_GAGNE;

  async function passer() {
    if (!onPasser) return;
    setEnvoi(true);
    await onPasser();
    setEnvoi(false);
  }

  async function enregistrer() {
    setEnvoi(true);
    await onEnregistrer(
      raison === VALEUR_AUCUNE_RAISON ? null : raison,
      note.trim().length > 0 ? note.trim() : null,
    );
    setEnvoi(false);
  }

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`titre.${statutPipeline}`)}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="resultat-raison">{t("champRaison")}</Label>
            <Select value={raison} onValueChange={setRaison}>
              <SelectTrigger id="resultat-raison">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={VALEUR_AUCUNE_RAISON}>{t("aucuneRaison")}</SelectItem>
                {raisons.map((valeur) => (
                  <SelectItem key={valeur} value={valeur}>
                    {t(`raisons.${valeur}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="resultat-note">{t("champNote")}</Label>
            <Textarea
              id="resultat-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("notePlaceholder")}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          {onPasser && (
            <Button type="button" variant="outline" onClick={passer} disabled={envoi}>
              {t("boutonPasser")}
            </Button>
          )}
          <Button type="button" onClick={enregistrer} disabled={envoi}>
            {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("boutonEnregistrer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
