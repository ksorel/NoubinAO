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
} from "@/lib/appels-offres/actions";
import { deviserTypeDocumentPrefere } from "@/lib/appels-offres/suggestion-document";
import type { Document } from "@/lib/documents/types";

export function DocumentsExigence({
  appelOffresId,
  exigenceId,
  libelleExigence,
  documentsAssocies: documentsAssociesInitial,
  bibliotheque,
}: {
  appelOffresId: string;
  exigenceId: string;
  libelleExigence: string;
  documentsAssocies: Document[];
  bibliotheque: Document[];
}) {
  const t = useTranslations("AppelsOffres.detail.exigences.documents");
  const [documentsAssocies, setDocumentsAssocies] = useState(documentsAssociesInitial);
  const [selectValue, setSelectValue] = useState("");
  const [isPending, startTransition] = useTransition();

  const idsAssocies = new Set(documentsAssocies.map((d) => d.id));
  const disponibles = bibliotheque.filter((d) => !idsAssocies.has(d.id));
  const typePrefere = deviserTypeDocumentPrefere(libelleExigence);
  const suggeres = disponibles.filter((d) => d.type === typePrefere);
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
      {documentsAssocies.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("aucunDocumentAssocie")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {documentsAssocies.map((document) => (
            <li key={document.id} className="flex items-center justify-between gap-2 text-sm">
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
            </li>
          ))}
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
