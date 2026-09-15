"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { basculerChecklistManuelle } from "@/lib/appels-offres/actions";
import { CLES_CHECKLIST_MANUELLE, type CleChecklistManuelle } from "@/lib/appels-offres/types";
import type { ItemChecklistAutomatique } from "@/lib/appels-offres/checklist";

const CLES_AUTO_VERS_TRADUCTION: Record<ItemChecklistAutomatique["cle"], string> = {
  pieces_manquantes: "piecesManquantes",
  sections_en_brouillon: "sectionsEnBrouillon",
  documents_expires: "documentsExpires",
};

const CLES_MANUEL_VERS_TRADUCTION: Record<CleChecklistManuelle, string> = {
  pieces_signees: "piecesSignees",
  prix_verifie: "prixVerifie",
  depose_sigmap: "deposeSigmap",
};

export function ChecklistSoumission({
  appelOffresId,
  dossierReponseId,
  checklistAutomatique,
  checklistManuelle: checklistManuelleInitiale,
}: {
  appelOffresId: string;
  dossierReponseId: string;
  checklistAutomatique: ItemChecklistAutomatique[];
  checklistManuelle: CleChecklistManuelle[];
}) {
  const t = useTranslations("AppelsOffres.detail.checklist");
  const [checklistManuelle, setChecklistManuelle] = useState(checklistManuelleInitiale);
  const [isPending, startTransition] = useTransition();

  function basculer(cleItem: CleChecklistManuelle, coche: boolean) {
    setChecklistManuelle((liste) =>
      coche ? [...liste, cleItem] : liste.filter((c) => c !== cleItem),
    );

    startTransition(async () => {
      const resultat = await basculerChecklistManuelle(appelOffresId, dossierReponseId, cleItem);
      if ("erreur" in resultat) {
        toast.error(t("erreurBascule"));
        // Revert = opération inverse appliquée à l'état courant (pas un
        // instantané figé) : si une autre bascule a réussi entre-temps sur
        // un autre item, elle n'est pas écrasée par ce revert.
        setChecklistManuelle((liste) =>
          coche ? liste.filter((c) => c !== cleItem) : [...liste, cleItem],
        );
      }
    });
  }

  const nombreProblemesAuto = checklistAutomatique.filter((item) => !item.ok).length;
  const nombreItemsManuelsRestants = CLES_CHECKLIST_MANUELLE.length - checklistManuelle.length;
  const nombreTotal = nombreProblemesAuto + nombreItemsManuelsRestants;

  // Contrairement aux sections voisines (FilSuivi, DocumentsExigence,
  // SectionRedaction), ce composant possède son propre titre plutôt que
  // de laisser le parent le rendre : le badge récapitulatif doit être
  // aligné sur la même ligne que le titre, et ce badge dépend de l'état
  // client (checklistManuelle) — le faire remonter au parent serait plus
  // coûteux que la petite incohérence structurelle que ça introduit.
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("titre")}</h2>
        <span className="text-sm text-muted-foreground">
          {nombreTotal === 0
            ? t("pretPourSoumission")
            : t("pointsAVerifier", { count: nombreTotal })}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-medium uppercase text-muted-foreground">{t("titreAuto")}</h3>
        <ul className="flex flex-col gap-1 text-sm">
          {checklistAutomatique.map((item) => (
            <li key={item.cle} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={
                  item.ok
                    ? "text-[hsl(var(--checklist-ok))]"
                    : "text-[hsl(var(--checklist-attention))]"
                }
              >
                {item.ok ? "✓" : "⚠"}
              </span>
              <span>{t(`auto.${CLES_AUTO_VERS_TRADUCTION[item.cle]}`, { count: item.nombre })}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium uppercase text-muted-foreground">{t("titreManuel")}</h3>
        <ul className="flex flex-col gap-2 text-sm">
          {CLES_CHECKLIST_MANUELLE.map((cle) => {
            const coche = checklistManuelle.includes(cle);
            return (
              <li key={cle} className="flex items-center gap-2">
                <Checkbox
                  id={`checklist-${cle}`}
                  checked={coche}
                  aria-busy={isPending}
                  onCheckedChange={(valeur) => basculer(cle, valeur === true)}
                />
                <Label htmlFor={`checklist-${cle}`}>
                  {t(`manuel.${CLES_MANUEL_VERS_TRADUCTION[cle]}`)}
                </Label>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
