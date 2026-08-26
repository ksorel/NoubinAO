"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ajouterDocument } from "@/lib/documents/actions";
import {
  TYPES_DOCUMENT,
  TYPES_AVEC_EXPIRATION,
  type TypeDocument,
} from "@/lib/documents/types";

export function AjouterDocumentDialog({
  libelle,
}: {
  libelle: string;
}) {
  const t = useTranslations("Bibliotheque.dialog");
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<TypeDocument>("piece_administrative");
  const [envoi, setEnvoi] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const afficherExpiration = TYPES_AVEC_EXPIRATION.includes(type);

  const libellesType: Record<TypeDocument, string> = {
    piece_administrative: t("typePieceAdministrative"),
    reference_projet: t("typeReferenceProjet"),
    cv: t("typeCv"),
    agrement: t("typeAgrement"),
  };

  async function onSubmit(formData: FormData) {
    setEnvoi(true);
    const resultat = await ajouterDocument(formData);
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }

    toast.success(t("toastAjoute"));
    setOuvert(false);
    formRef.current?.reset();
  }

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>
        <Button>{libelle}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("titre")}</DialogTitle>
          <DialogDescription>{t("confidentialite")}</DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="type">{t("champType")}</Label>
            <Select
              name="type"
              value={type}
              onValueChange={(v) => setType(v as TypeDocument)}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES_DOCUMENT.map((tv) => (
                  <SelectItem key={tv} value={tv}>
                    {libellesType[tv]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="nom">{t("champNom")}</Label>
            <Input
              id="nom"
              name="nom"
              placeholder={t("nomPlaceholder")}
              required
            />
          </div>

          {afficherExpiration && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="dateExpiration">{t("champDateExpiration")}</Label>
              <Input id="dateExpiration" name="dateExpiration" type="date" />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="fichier">{t("champFichier")}</Label>
            <Input
              id="fichier"
              name="fichier"
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              required
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={envoi}>
              {envoi ? t("envoiEnCours") : t("boutonAjouter")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
