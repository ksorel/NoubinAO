"use client";

import { useRef, useState } from "react";
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

const LIBELLES_TYPE: Record<TypeDocument, string> = {
  piece_administrative: "Pièce administrative",
  reference_projet: "Référence projet",
  cv: "CV",
  agrement: "Agrément",
};

export function AjouterDocumentDialog({
  libelle = "Ajouter un document",
}: {
  libelle?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<TypeDocument>("piece_administrative");
  const [envoi, setEnvoi] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const afficherExpiration = TYPES_AVEC_EXPIRATION.includes(type);

  async function onSubmit(formData: FormData) {
    setEnvoi(true);
    const resultat = await ajouterDocument(formData);
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }

    toast.success("Document ajouté");
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
          <DialogTitle>Ajouter un document</DialogTitle>
          <DialogDescription>
            Le fichier est stocké de façon privée, accessible uniquement à
            votre entreprise.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="type">Type</Label>
            <Select
              name="type"
              value={type}
              onValueChange={(v) => setType(v as TypeDocument)}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES_DOCUMENT.map((t) => (
                  <SelectItem key={t} value={t}>
                    {LIBELLES_TYPE[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="nom">Nom</Label>
            <Input
              id="nom"
              name="nom"
              placeholder="Ex. RCCM, CV Jean Kouassi"
              required
            />
          </div>

          {afficherExpiration && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="dateExpiration">Date d&apos;expiration</Label>
              <Input id="dateExpiration" name="dateExpiration" type="date" />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="fichier">Fichier</Label>
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
              {envoi ? "Envoi..." : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
