"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ExpirationBadge } from "@/app/(app)/bibliotheque/expiration-badge";
import {
  associerDocumentAExigence,
  dissocierDocumentAExigence,
  genererCvTransforme,
  genererUrlTelechargementCvTransforme,
} from "@/lib/appels-offres/actions";
import { deviserTypeDocumentPrefere, classerCvParPertinence } from "@/lib/appels-offres/suggestion-document";
import type { Document } from "@/lib/documents/types";
import type { CvTransforme, SectionDossier } from "@/lib/appels-offres/types";
import type { TypeFormulaireStandard } from "@/lib/appels-offres/formulaires-standards";
import { FormulaireStandard } from "./formulaire-standard";

export function DocumentsExigence({
  appelOffresId,
  exigenceId,
  libelleExigence,
  documentsAssocies: documentsAssociesInitial,
  bibliotheque,
  modeleCvDisponible,
  cvTransformeParDocument,
  onCvTransforme,
  documentIdEnCours,
  onDocumentIdEnCoursChange,
  typeFormulaireStandard,
  sectionFormulaire,
  criteresQualification,
}: {
  appelOffresId: string;
  exigenceId: string;
  libelleExigence: string;
  documentsAssocies: Document[];
  bibliotheque: Document[];
  modeleCvDisponible: boolean;
  cvTransformeParDocument: Record<string, CvTransforme>;
  onCvTransforme: (documentId: string, cv: CvTransforme) => void;
  // Levé au parent (et non local à cette instance) : un même CV peut être
  // associé à plusieurs exigences, donc plusieurs instances de
  // DocumentsExigence peuvent rendre le même document. Sans cet état
  // partagé, une instance ne sait pas qu'une autre a déjà déclenché une
  // génération pour ce document, et peut redéclencher un second appel
  // Claude payant pour la même transformation pendant que le premier est
  // encore en cours.
  documentIdEnCours: string | null;
  onDocumentIdEnCoursChange: (documentId: string | null) => void;
  // Calculé par le parent (identifierFormulaireStandard(exigence.libelle))
  // pour éviter de dupliquer l'import de détection dans ce composant.
  typeFormulaireStandard: TypeFormulaireStandard | null;
  sectionFormulaire: SectionDossier | undefined;
  // Utilisé uniquement quand cette pièce est de type CV, pour classer
  // les suggestions par pertinence — voir classerCvParPertinence.
  criteresQualification: { libelle: string; description: string | null }[];
}) {
  const t = useTranslations("AppelsOffres.detail.exigences.documents");
  const [documentsAssocies, setDocumentsAssocies] = useState(documentsAssociesInitial);
  const [selectValue, setSelectValue] = useState("");
  const [isPending, startTransition] = useTransition();

  async function transformer(documentId: string) {
    onDocumentIdEnCoursChange(documentId);
    try {
      const resultat = await genererCvTransforme(appelOffresId, documentId);

      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
        return;
      }
      onCvTransforme(documentId, resultat.cvTransforme);
    } finally {
      onDocumentIdEnCoursChange(null);
    }
  }

  async function telechargerTransforme(exportPath: string) {
    const resultat = await genererUrlTelechargementCvTransforme(exportPath);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }

  const idsAssocies = new Set(documentsAssocies.map((d) => d.id));
  const disponibles = bibliotheque.filter((d) => !idsAssocies.has(d.id));
  const typePrefere = deviserTypeDocumentPrefere(libelleExigence);
  const suggeresBrut = disponibles.filter((d) => d.type === typePrefere);
  const suggeres =
    typePrefere === "cv"
      ? classerCvParPertinence(libelleExigence, criteresQualification, suggeresBrut)
      : suggeresBrut;
  const autres = disponibles.filter((d) => d.type !== typePrefere);

  function onSelectionner(documentId: string) {
    const document = bibliotheque.find((d) => d.id === documentId);
    if (!document) return;

    startTransition(async () => {
      const resultat = await associerDocumentAExigence(appelOffresId, exigenceId, documentId);
      if ("erreur" in resultat) {
        toast.error(t("erreurAssociation"));
        return;
      }
      setDocumentsAssocies((liste) => [...liste, document]);
      setSelectValue("");
    });
  }

  function onDissocier(documentId: string) {
    const precedent = documentsAssocies;
    setDocumentsAssocies((liste) => liste.filter((d) => d.id !== documentId));

    startTransition(async () => {
      const resultat = await dissocierDocumentAExigence(appelOffresId, exigenceId, documentId);
      if ("erreur" in resultat) {
        toast.error(t("erreurDissociation"));
        setDocumentsAssocies(precedent);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {typeFormulaireStandard && (
        <FormulaireStandard
          appelOffresId={appelOffresId}
          exigenceId={exigenceId}
          section={sectionFormulaire}
        />
      )}

      {documentsAssocies.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("aucunDocumentAssocie")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {documentsAssocies.map((document) => {
            const cvTransforme = cvTransformeParDocument[document.id];
            const enCours = documentIdEnCours === document.id;
            return (
              <li key={document.id} className="flex flex-col gap-1 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    {document.nom}
                    <ExpirationBadge dateExpiration={document.date_expiration} />
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => onDissocier(document.id)}
                  >
                    {t("dissocier")}
                  </Button>
                </div>

                {modeleCvDisponible && document.type === "cv" && (
                  <div className="flex items-center gap-2 pl-4">
                    {cvTransforme ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => telechargerTransforme(cvTransforme.export_path)}
                        >
                          {t("boutonTelechargerTransforme")}
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {t("genereLe", { date: new Date(cvTransforme.genere_le).toLocaleDateString("fr-FR") })}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={enCours}
                          onClick={() => transformer(document.id)}
                        >
                          {enCours ? t("transformationEnCours") : t("boutonRegenerer")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={enCours}
                        onClick={() => transformer(document.id)}
                      >
                        {enCours ? t("transformationEnCours") : t("boutonTransformer")}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {bibliotheque.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("bibliothequeVide")}</p>
      ) : disponibles.length > 0 ? (
        // Select contrôlé (value + reset explicite dans onSelectionner) plutôt
        // que remonté via une key changeante : un remount détruit le noeud DOM
        // du SelectTrigger juste après que Radix y a restauré le focus suite à
        // la sélection, ce qui renvoie un utilisateur au clavier sur <body>.
        <Select value={selectValue} onValueChange={onSelectionner} disabled={isPending}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("placeholderSelect")} />
          </SelectTrigger>
          <SelectContent>
            {suggeres.length > 0 && (
              <SelectGroup>
                <SelectLabel>{t("groupeSuggestions")}</SelectLabel>
                {suggeres.map((document) => (
                  <SelectItem key={document.id} value={document.id}>
                    {document.nom}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {autres.length > 0 && (
              <SelectGroup>
                <SelectLabel>{t("groupeAutres")}</SelectLabel>
                {autres.map((document) => (
                  <SelectItem key={document.id} value={document.id}>
                    {document.nom}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
