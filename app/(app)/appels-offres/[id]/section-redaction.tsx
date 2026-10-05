"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
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
import { TYPES_DOCUMENT, type Document, type TypeDocument } from "@/lib/documents/types";

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
  const tType = useTranslations("Bibliotheque.dialog");
  const [sectionId, setSectionId] = useState(section?.id);
  const [contenu, setContenu] = useState(section?.contenu ?? "");
  const [statut, setStatut] = useState<StatutSectionDossier>(section?.statut ?? "brouillon");
  const [documentsChoisis, setDocumentsChoisis] = useState(documentsSource);
  const [selectValue, setSelectValue] = useState("");
  const [generation, setGeneration] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [isPending, startTransition] = useTransition();

  const libellesType: Record<TypeDocument, string> = {
    piece_administrative: tType("typePieceAdministrative"),
    reference_projet: tType("typeReferenceProjet"),
    cv: tType("typeCv"),
    agrement: tType("typeAgrement"),
    abe: tType("typeAbe"),
    organigramme: tType("typeOrganigramme"),
    materiel: tType("typeMateriel"),
  };

  const idsChoisis = new Set(documentsChoisis.map((d) => d.id));
  const disponibles = bibliotheque.filter((d) => !idsChoisis.has(d.id));
  // Une source de section rédigée peut légitimement être n'importe quel
  // type de document (CV pour une bio d'équipe, référence projet,
  // agrément...) — contrairement au sélecteur de pièce requise, filtrer
  // à un seul type serait faux ici. On groupe plutôt par type (retour
  // client 2026-10-04 : éviter la liste à plat non filtrée) sans rien
  // exclure.
  const disponiblesParType = TYPES_DOCUMENT.map((type) => ({
    type,
    documents: disponibles.filter((d) => d.type === type),
  })).filter((groupe) => groupe.documents.length > 0);

  function ajouterDocument(documentId: string) {
    const document = bibliotheque.find((d) => d.id === documentId);
    if (!document) return;
    setDocumentsChoisis((liste) => [...liste, document]);
    setSelectValue("");
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
          // Select contrôlé (value + reset explicite dans ajouterDocument) plutôt
          // que remonté via une key changeante : un remount détruit le noeud DOM
          // du SelectTrigger juste après que Radix y a restauré le focus suite à
          // la sélection, ce qui renvoie un utilisateur au clavier sur <body>.
          <Select value={selectValue} onValueChange={ajouterDocument}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("placeholderSelect")} />
            </SelectTrigger>
            <SelectContent>
              {disponiblesParType.map((groupe) => (
                <SelectGroup key={groupe.type}>
                  <SelectLabel>{libellesType[groupe.type]}</SelectLabel>
                  {groupe.documents.map((document) => (
                    <SelectItem key={document.id} value={document.id}>
                      {document.nom}
                    </SelectItem>
                  ))}
                </SelectGroup>
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
              {enregistrement && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("boutonEnregistrerTexte")}
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-2">
        <Button type="button" onClick={generer} disabled={generation}>
          {generation && <Loader2 className="h-4 w-4 animate-spin" />}
          {generation
            ? t("generationEnCours")
            : sectionId
              ? t("boutonRegenerer")
              : t("boutonGenerer")}
        </Button>
        {sectionId && (
          <Button type="button" variant="outline" onClick={basculerStatut} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {statut === "brouillon" ? t("boutonValider") : t("boutonDevalider")}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
