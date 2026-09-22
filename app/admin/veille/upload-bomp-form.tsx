"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { uploaderBomp } from "@/lib/veille/actions";

export function UploadBompForm() {
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function onSubmit(formData: FormData) {
    setEnvoi(true);
    setErreur(null);
    const resultat = await uploaderBomp(formData);
    setEnvoi(false);
    if ("erreur" in resultat) {
      setErreur(resultat.erreur);
    }
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4 border rounded-lg p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="numero">Numéro du BOMP</Label>
        <Input id="numero" name="numero" placeholder="Ex. 1896" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="datePublication">Date de publication</Label>
        <Input id="datePublication" name="datePublication" type="date" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="fichier">Fichier PDF</Label>
        <Input id="fichier" name="fichier" type="file" accept="application/pdf" required />
      </div>
      {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      <Button type="submit" disabled={envoi}>
        {envoi ? "Envoi..." : "Téléverser le BOMP"}
      </Button>
    </form>
  );
}
