"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { rejoindreEntreprise } from "@/lib/utilisateur/actions";

export function InvitationForm({ token }: { token: string }) {
  const [resultat, envoyer, envoi] = useActionState(
    async (_etatPrecedent: { erreur: string } | undefined, formData: FormData) =>
      rejoindreEntreprise(formData),
    undefined,
  );

  return (
    <form action={envoyer} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="nom">Votre nom</Label>
        <Input id="nom" name="nom" required />
      </div>
      {resultat && "erreur" in resultat && (
        <p className="text-sm text-destructive">{resultat.erreur}</p>
      )}
      <Button type="submit" disabled={envoi}>
        {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
        {envoi ? "Jonction..." : "Rejoindre l'entreprise"}
      </Button>
    </form>
  );
}
