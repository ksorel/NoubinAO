"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { modifierStatutPipeline } from "@/lib/appels-offres/actions";
import { obtenirCouleurStatutPipeline } from "@/lib/appels-offres/statut-pipeline";
import { STATUTS_PIPELINE_AO, type StatutPipelineAo } from "@/lib/appels-offres/types";
import { ResultatDialogue } from "@/components/ao/resultat-dialogue";

const STYLES = {
  identifie: "bg-[hsl(var(--status-identifie))] text-slate-900",
  preparation: "bg-[hsl(var(--status-preparation))] text-white",
  soumis: "bg-[hsl(var(--status-soumis))] text-slate-900",
  gagne: "bg-[hsl(var(--status-gagne))] text-slate-900",
  perdu: "bg-[hsl(var(--status-perdu))] text-white",
} as const;

const CLES_LIBELLE: Record<StatutPipelineAo, string> = {
  identifie: "badge.identifie",
  en_preparation: "badge.enPreparation",
  soumis: "badge.soumis",
  en_attente: "badge.enAttente",
  gagne: "badge.gagne",
  perdu: "badge.perdu",
  sans_suite: "badge.sansSuite",
};

export function StatutPipelineSelect({
  appelOffresId,
  statutInitial,
}: {
  appelOffresId: string;
  statutInitial: StatutPipelineAo;
}) {
  const t = useTranslations("Pipeline");
  const [statut, setStatut] = useState(statutInitial);
  const [isPending, startTransition] = useTransition();
  const [statutEnAttenteDialogue, setStatutEnAttenteDialogue] = useState<
    "gagne" | "perdu" | null
  >(null);

  function onValueChange(valeur: string) {
    const nouveauStatut = valeur as StatutPipelineAo;

    if (nouveauStatut === "gagne" || nouveauStatut === "perdu") {
      setStatutEnAttenteDialogue(nouveauStatut);
      return;
    }

    const precedent = statut;
    setStatut(nouveauStatut);

    startTransition(async () => {
      const resultat = await modifierStatutPipeline(appelOffresId, nouveauStatut);
      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
        setStatut(precedent);
      } else {
        toast.success(t("table.toastStatutModifie"));
      }
    });
  }

  // Appelée depuis la boîte de dialogue (Passer ou Enregistrer) — gère son
  // propre état d'attente (resultat-dialogue.tsx) plutôt que isPending/
  // startTransition du Select, utilisés uniquement par le chemin direct
  // ci-dessus (changement vers un statut autre que gagné/perdu).
  //
  // `resultat` absent (bouton "Passer") appelle modifierStatutPipeline
  // avec SEULEMENT 2 arguments, pour que raisonResultat/noteResultat
  // restent `undefined` et soient omis de la requête UPDATE (voir Task 3)
  // — ne jamais passer `null, null` explicitement ici, ça écraserait une
  // raison déjà enregistrée lors d'un changement de statut antérieur.
  async function appliquerChangementStatut(
    nouveauStatut: "gagne" | "perdu",
    resultat?: { raison: string | null; note: string | null },
  ) {
    const precedent = statut;
    setStatut(nouveauStatut);
    try {
      const reponse = resultat
        ? await modifierStatutPipeline(
            appelOffresId,
            nouveauStatut,
            resultat.raison,
            resultat.note,
          )
        : await modifierStatutPipeline(appelOffresId, nouveauStatut);
      if ("erreur" in reponse) {
        toast.error(reponse.erreur);
        setStatut(precedent);
      } else {
        toast.success(t("table.toastStatutModifie"));
        setStatutEnAttenteDialogue(null);
      }
    } catch {
      toast.error("Échec de la mise à jour du statut. Réessayez.");
      setStatut(precedent);
    }
  }

  const couleur = obtenirCouleurStatutPipeline(statut);

  return (
    <>
      <Select value={statut} onValueChange={onValueChange} disabled={isPending}>
        <SelectTrigger className={`w-40 border-transparent ${STYLES[couleur]}`}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUTS_PIPELINE_AO.map((valeur) => (
            <SelectItem key={valeur} value={valeur}>
              {t(CLES_LIBELLE[valeur])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {statutEnAttenteDialogue && (
        <ResultatDialogue
          ouvert={statutEnAttenteDialogue !== null}
          onOuvertChange={(ouvert) => {
            if (!ouvert) setStatutEnAttenteDialogue(null);
          }}
          statutPipeline={statutEnAttenteDialogue}
          raisonInitiale={null}
          noteInitiale={null}
          onPasser={() => appliquerChangementStatut(statutEnAttenteDialogue)}
          onEnregistrer={(raison, note) =>
            appliquerChangementStatut(statutEnAttenteDialogue, { raison, note })
          }
        />
      )}
    </>
  );
}
