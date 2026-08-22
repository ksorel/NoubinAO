"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { creerEntreprise } from "@/lib/entreprise/actions";

export function OnboardingForm() {
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function onSubmit(formData: FormData) {
    setEnvoi(true);
    setErreur(null);
    const resultat = await creerEntreprise(formData);
    setEnvoi(false);
    if (resultat?.erreur) {
      setErreur(resultat.erreur);
    }
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4 max-w-md">
      <div className="flex flex-col gap-2">
        <Label htmlFor="nom">Nom de l&apos;entreprise</Label>
        <Input id="nom" name="nom" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rccm">RCCM (optionnel)</Label>
        <Input id="rccm" name="rccm" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="nomUtilisateur">Votre nom</Label>
        <Input id="nomUtilisateur" name="nomUtilisateur" required />
      </div>
      {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      <Button type="submit" disabled={envoi}>
        {envoi ? "Création..." : "Créer mon entreprise"}
      </Button>
    </form>
  );
}
