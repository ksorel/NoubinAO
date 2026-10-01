"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { demarrerTeleversementDao, finaliserTeleversementDao } from "@/lib/appels-offres/actions";
import { createClient } from "@/lib/supabase/client";

// Dupliqués depuis lib/appels-offres/schema.ts (TAILLE_MAX_OCTETS) et
// lib/appels-offres/normalisation/normaliser.ts (MIME_TYPES_DAO_SUPPORTES)
// plutôt qu'importés : ces modules serveur chargent pdfjs-dist/mammoth, trop
// lourds (et incompatibles navigateur) pour un composant client. Garder ces
// deux constantes synchronisées avec schema.ts en cas de changement.
const TAILLE_MAX_OCTETS = 20 * 1024 * 1024; // 20 Mo
const MIME_TYPES_DAO_SUPPORTES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

// Les Server Actions de Next.js n'exposent pas la progression réelle de
// l'envoi (contrairement à XMLHttpRequest). Cette barre progresse par
// paliers décroissants vers un plafond de 90% tant que l'envoi dure,
// puis saute à 100% dès que le résultat arrive — un signal honnête
// ("toujours en cours") sans jamais prétendre à tort que c'est terminé.
const PLAFOND_PROGRESSION = 90;
const INTERVALLE_PROGRESSION_MS = 300;
// Durée minimale pendant laquelle l'indicateur "en cours" reste affiché,
// même si le serveur répond plus vite — voir le commentaire dans onSubmit.
const DUREE_MINIMALE_AFFICHAGE_MS = 800;

export function TeleverserDaoDialog({ libelle }: { libelle: string }) {
  const t = useTranslations("AppelsOffres.dialog");
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [progression, setProgression] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!envoi) {
      setProgression(0);
      return;
    }

    const intervalId = setInterval(() => {
      setProgression((valeur) => valeur + (PLAFOND_PROGRESSION - valeur) * 0.1);
    }, INTERVALLE_PROGRESSION_MS);

    return () => clearInterval(intervalId);
  }, [envoi]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const fichiers = formData.getAll("fichier").filter((f): f is File => f instanceof File);

    // <form action={fn}> traite fn comme une React "Action" et regroupe
    // ses mises à jour d'état avec le résultat de la Server Action
    // appelée à l'intérieur — l'état "en cours" ne se peignait jamais
    // avant la fin de l'appel, même sur un envoi de plusieurs secondes
    // (constaté en local : 4 à 13s sans aucun rendu intermédiaire).
    // Revenir à un gestionnaire onSubmit classique + flushSync force
    // React à peindre cet état immédiatement, avant de lancer l'appel
    // réseau.
    flushSync(() => {
      setEnvoi(true);
    });

    const debut = Date.now();

    // Le corps d'une Server Action est plafonné par Vercel à ~4,5 Mo — un
    // DAO réel le dépasse souvent (voir le commentaire dans
    // lib/appels-offres/schema.ts). Chaque fichier est donc envoyé
    // directement au stockage via une URL signée ; seuls les noms
    // transitent par les Server Actions ci-dessous. try/catch englobe tout
    // le flux pour ne jamais laisser l'indicateur "en cours" bloqué sur un
    // rejet imprévu (promesse non gérée côté client).
    let resultat: { erreur: string } | { succes: true };

    const fichierInvalide = fichiers.find(
      (fichier) =>
        fichier.size > TAILLE_MAX_OCTETS ||
        !(MIME_TYPES_DAO_SUPPORTES as readonly string[]).includes(fichier.type),
    );

    if (fichierInvalide) {
      resultat = {
        erreur:
          fichierInvalide.size > TAILLE_MAX_OCTETS
            ? "Chaque fichier doit faire moins de 20 Mo"
            : "Type de fichier non accepté (PDF ou DOCX uniquement)",
      };
    } else {
      try {
        const demarrage = await demarrerTeleversementDao(
          fichiers.map((fichier) => ({ nomOriginal: fichier.name, mimeType: fichier.type })),
        );

        if ("erreur" in demarrage) {
          resultat = demarrage;
        } else {
          const supabase = createClient();
          let echecUpload: string | null = null;

          for (let i = 0; i < demarrage.uploads.length; i++) {
            const { error } = await supabase.storage
              .from("documents")
              .uploadToSignedUrl(
                demarrage.uploads[i].cheminStockage,
                demarrage.uploads[i].token,
                fichiers[i],
                { contentType: fichiers[i].type },
              );
            if (error) {
              echecUpload = "Échec de l'envoi du fichier. Réessayez.";
              break;
            }
          }

          resultat = echecUpload
            ? { erreur: echecUpload }
            : await finaliserTeleversementDao(
                demarrage.appelOffresId,
                fichiers.map((fichier) => ({ nomOriginal: fichier.name, mimeType: fichier.type })),
              );
        }
      } catch {
        resultat = { erreur: "Échec de l'envoi du fichier. Réessayez." };
      }
    }

    // Sur un fichier léger et une connexion rapide, l'aller-retour peut se
    // terminer en quelques dizaines de millisecondes — trop court pour
    // qu'un navigateur peigne l'état "en cours" avant de le remplacer par
    // le suivant. On garantit un minimum d'affichage pour que l'indicateur
    // soit toujours visible, quelle que soit la vitesse réelle de
    // l'opération.
    const ecoule = Date.now() - debut;
    if (ecoule < DUREE_MINIMALE_AFFICHAGE_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, DUREE_MINIMALE_AFFICHAGE_MS - ecoule),
      );
    }

    if ("erreur" in resultat) {
      setEnvoi(false);
      toast.error(resultat.erreur);
      return;
    }

    setEnvoi(false);
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
        <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fichier">{t("champFichier")}</Label>
            <Input
              id="fichier"
              name="fichier"
              type="file"
              accept=".pdf,.docx"
              multiple
              required
              disabled={envoi}
            />
          </div>

          {envoi && <Progress value={progression} />}

          <DialogFooter>
            <Button type="submit" disabled={envoi}>
              {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
              {envoi ? t("envoiEnCours") : t("boutonTeleverser")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
