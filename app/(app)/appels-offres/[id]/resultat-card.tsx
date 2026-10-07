"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { modifierResultatAo } from "@/lib/appels-offres/actions";
import { ResultatDialogue } from "@/components/ao/resultat-dialogue";
import type { RaisonResultatAo } from "@/lib/appels-offres/types";

export function ResultatCard({
  appelOffresId,
  statutPipeline,
  raisonInitiale,
  noteInitiale,
}: {
  appelOffresId: string;
  statutPipeline: "gagne" | "perdu";
  raisonInitiale: RaisonResultatAo | null;
  noteInitiale: string | null;
}) {
  const t = useTranslations("AppelsOffres.detail.resultat");
  const tRaisons = useTranslations("Pipeline.postMortem.raisons");
  const [raison, setRaison] = useState<RaisonResultatAo | null>(raisonInitiale);
  const [note, setNote] = useState(noteInitiale);
  const [dialogueOuvert, setDialogueOuvert] = useState(false);

  async function enregistrer(nouvelleRaison: string | null, nouvelleNote: string | null) {
    const resultat = await modifierResultatAo(appelOffresId, nouvelleRaison, nouvelleNote);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    // `nouvelleRaison` ne provient que du Select de ResultatDialogue, qui
    // n'offre jamais que des valeurs de RAISONS_RESULTAT_PERDU/GAGNE (sous-
    // ensembles de RaisonResultatAo) — narrowing sûr, pas une assertion
    // aveugle.
    setRaison(nouvelleRaison as RaisonResultatAo | null);
    setNote(nouvelleNote);
    setDialogueOuvert(false);
    toast.success(t("toastEnregistre"));
  }

  const aUneRaisonOuNote = raison !== null || note !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titre")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {aUneRaisonOuNote ? (
          <>
            {raison && <p className="text-sm">{tRaisons(raison)}</p>}
            {note && <p className="text-sm text-muted-foreground">{note}</p>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("aucuneRaison")}</p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDialogueOuvert(true)}
          className="self-start"
        >
          {aUneRaisonOuNote ? t("boutonModifier") : t("boutonAjouter")}
        </Button>
      </CardContent>

      {dialogueOuvert && (
        <ResultatDialogue
          ouvert={dialogueOuvert}
          onOuvertChange={setDialogueOuvert}
          statutPipeline={statutPipeline}
          raisonInitiale={raison}
          noteInitiale={note}
          onEnregistrer={enregistrer}
        />
      )}
    </Card>
  );
}
