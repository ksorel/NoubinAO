"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { toast } from "sonner";
import {
  genererContenuSection,
  modifierContenuSection,
  validerSection,
  devaliderSection,
} from "@/lib/appels-offres/actions";
import type { SectionDossier, StatutSectionDossier } from "@/lib/appels-offres/types";
import type { Document } from "@/lib/documents/types";

export function SectionRedaction({
  appelOffresId,
  titreSection,
  section,
  documentsSource,
  bibliotheque,
}: {
  appelOffresId: string;
  titreSection: string;
  section: SectionDossier | undefined;
  documentsSource: Document[];
  bibliotheque: Document[];
}) {
  const t = useTranslations("AppelsOffres.detail.redaction");
  const [sectionId, setSectionId] = useState(section?.id);
  const [contenu, setContenu] = useState(section?.contenu ?? "");
  const [statut, setStatut] = useState<StatutSectionDossier>(section?.statut ?? "brouillon");
  const [documentsChoisis, setDocumentsChoisis] = useState(documentsSource);
  const [generation, setGeneration] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [isPending, startTransition] = useTransition();

  const idsChoisis = new Set(documentsChoisis.map((d) => d.id));
  const disponibles = bibliotheque.filter((d) => !idsChoisis.has(d.id));

  function ajouterDocument(documentId: string) {
    const document = bibliotheque.find((d) => d.id === documentId);
    if (!document) return;
    setDocumentsChoisis((liste) => [...liste, document]);
  }

  function retirerDocument(documentId: string) {
    setDocumentsChoisis((liste) => liste.filter((d) => d.id !== documentId));
  }

  async function generer() {
    setGeneration(true);
    const resultat = await genererContenuSection(
      appelOffresId,
      titreSection,
      documentsChoisis.map((d) => d.id),
    );
    setGeneration(false);

    if ("erreur" in resultat) {
      toast.error(t("erreurGeneration"));
      return;
    }

    setSectionId(resultat.sectionId);
    setContenu(resultat.contenu);
    setStatut(resultat.statut);
  }

  async function sauvegarderContenu() {
    if (!sectionId) return;
    setEnregistrement(true);
    const resultat = await modifierContenuSection(appelOffresId, sectionId, contenu);
    setEnregistrement(false);

    if ("erreur" in resultat) {
      toast.error(t("erreurEnregistrement"));
    }
  }

  function basculerStatut() {
    if (!sectionId) return;
    const precedent = statut;
    const nouveauStatut: StatutSectionDossier = statut === "brouillon" ? "validee" : "brouillon";
    setStatut(nouveauStatut);

    startTransition(async () => {
      const resultat =
        nouveauStatut === "validee"
          ? await validerSection(appelOffresId, sectionId)
          : await devaliderSection(appelOffresId, sectionId);

      if ("erreur" in resultat) {
        toast.error(t("erreurValidation"));
        setStatut(precedent);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{titreSection}</span>
          <Badge variant={statut === "validee" ? "default" : "outline"}>
            {statut === "validee" ? t("statutValidee") : t("statutBrouillon")}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {documentsChoisis.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("aucuneSource")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {documentsChoisis.map((document) => (
              <li key={document.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{document.nom}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => retirerDocument(document.id)}
                >
                  {t("retirerSource")}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {bibliotheque.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("bibliothequeVide")}</p>
        ) : disponibles.length > 0 ? (
          <Select key={documentsChoisis.length} onValueChange={ajouterDocument}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("placeholderSelect")} />
            </SelectTrigger>
            <SelectContent>
              {disponibles.map((document) => (
                <SelectItem key={document.id} value={document.id}>
                  {document.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {sectionId && (
          <div className="flex flex-col gap-2">
            <Textarea
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              rows={8}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={sauvegarderContenu}
              disabled={enregistrement}
            >
              {t("boutonEnregistrerTexte")}
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-2">
        <Button type="button" onClick={generer} disabled={generation}>
          {generation
            ? t("generationEnCours")
            : sectionId
              ? t("boutonRegenerer")
              : t("boutonGenerer")}
        </Button>
        {sectionId && (
          <Button type="button" variant="outline" onClick={basculerStatut} disabled={isPending}>
            {statut === "brouillon" ? t("boutonValider") : t("boutonDevalider")}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
