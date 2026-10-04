"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
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
import { TAILLE_MAX_OCTETS } from "@/lib/documents/schema";
import {
  TYPES_DOCUMENT,
  TYPES_AVEC_EXPIRATION,
  type TypeDocument,
} from "@/lib/documents/types";

const TAILLE_MAX_MO = Math.round(TAILLE_MAX_OCTETS / (1024 * 1024));

export function AjouterDocumentDialog({
  libelle,
}: {
  libelle: string;
}) {
  const t = useTranslations("Bibliotheque.dialog");
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<TypeDocument>("piece_administrative");
  const formRef = useRef<HTMLFormElement>(null);

  const afficherExpiration = TYPES_AVEC_EXPIRATION.includes(type);

  const libellesType: Record<TypeDocument, string> = {
    piece_administrative: t("typePieceAdministrative"),
    reference_projet: t("typeReferenceProjet"),
    cv: t("typeCv"),
    agrement: t("typeAgrement"),
    abe: t("typeAbe"),
    organigramme: t("typeOrganigramme"),
    materiel: t("typeMateriel"),
  };

  // useActionState (plutôt qu'un booléen local mis à jour avant l'await) :
  // dans cette version de Next.js, un état posé à la main avant l'await
  // d'une fonction passée à `action` ne se rend pas de façon fiable pendant
  // l'attente — `pending` ici est le mécanisme documenté pour ça.
  const [resultat, envoyer, envoi] = useActionState(
    async (_etatPrecedent: { erreur: string } | { succes: true } | null, formData: FormData) =>
      ajouterDocument(formData),
    null,
  );

  useEffect(() => {
    if (!resultat) return;

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }

    toast.success(t("toastAjoute"));
    setOuvert(false);
    formRef.current?.reset();
  }, [resultat, t]);

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
        <form ref={formRef} action={envoyer} className="flex flex-col gap-4">
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
            <p className="text-sm text-muted-foreground">
              {t("champFichierAide", { taille: TAILLE_MAX_MO })}
            </p>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={envoi}>
              {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
              {envoi ? t("envoiEnCours") : t("boutonAjouter")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
