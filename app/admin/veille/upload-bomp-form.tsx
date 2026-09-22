"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { demarrerUploadBomp, confirmerUploadBomp } from "@/lib/veille/actions";
import { TAILLE_MAX_BOMP_OCTETS } from "@/lib/veille/schema";

export function UploadBompForm() {
  const [numero, setNumero] = useState("");
  const [datePublication, setDatePublication] = useState("");
  const fichierRef = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);

    const fichier = fichierRef.current?.files?.[0];
    if (!fichier) {
      setErreur("Le fichier est requis");
      return;
    }
    if (fichier.type !== "application/pdf") {
      setErreur("Le fichier doit être un PDF");
      return;
    }
    if (fichier.size > TAILLE_MAX_BOMP_OCTETS) {
      setErreur("Le fichier doit faire moins de 35 Mo");
      return;
    }

    setEnvoi(true);

    // Étape 1 : demande une URL signée (le fichier ne passe pas par cet
    // appel — une Server Action ne peut pas recevoir un fichier de cette
    // taille, voir le commentaire dans lib/veille/actions.ts).
    const prep = await demarrerUploadBomp(fichier.name);
    if ("erreur" in prep) {
      setEnvoi(false);
      setErreur(prep.erreur);
      return;
    }

    // Étape 2 : envoi direct du navigateur vers Supabase Storage.
    const supabase = createClient();
    const { error: erreurUpload } = await supabase.storage
      .from("bomp-national")
      .uploadToSignedUrl(prep.cheminStockage, prep.token, fichier, {
        contentType: "application/pdf",
      });

    if (erreurUpload) {
      setEnvoi(false);
      setErreur("Échec de l'envoi du fichier. Réessayez.");
      return;
    }

    // Étape 3 : le fichier est en place, enregistre le BOMP et lance le traitement.
    const resultat = await confirmerUploadBomp({
      numero,
      datePublication,
      cheminStockage: prep.cheminStockage,
    });
    setEnvoi(false);
    if ("erreur" in resultat) {
      setErreur(resultat.erreur);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 border rounded-lg p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="numero">Numéro du BOMP</Label>
        <Input
          id="numero"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="Ex. 1896"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="datePublication">Date de publication</Label>
        <Input
          id="datePublication"
          type="date"
          value={datePublication}
          onChange={(e) => setDatePublication(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="fichier">Fichier PDF</Label>
        <Input id="fichier" ref={fichierRef} type="file" accept="application/pdf" required />
      </div>
      {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      <Button type="submit" disabled={envoi}>
        {envoi ? "Envoi..." : "Téléverser le BOMP"}
      </Button>
    </form>
  );
}
