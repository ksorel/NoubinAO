"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  modifierEnTetePiedPage,
  televerserLogoEntreprise,
  retirerLogoEntreprise,
} from "@/lib/utilisateur/actions";
import { genererUrlTelechargement } from "@/lib/documents/actions";
import type { Entreprise } from "@/lib/utilisateur/types";

const ZONES = ["gauche", "centre", "droite"] as const;
type Zone = (typeof ZONES)[number];
const BANDES = ["entete", "pied"] as const;
type Bande = (typeof BANDES)[number];
type CleChamp = `${Bande}${Capitalize<Zone>}`;

function cleChamp(bande: Bande, zone: Zone): CleChamp {
  return `${bande}${zone.charAt(0).toUpperCase()}${zone.slice(1)}` as CleChamp;
}

const JETONS = [
  { jeton: "{{logo}}", libelleCle: "jetonLogo" as const },
  { jeton: "{{entreprise}}", libelleCle: "jetonEntreprise" as const },
  { jeton: "{{date}}", libelleCle: "jetonDate" as const },
  { jeton: "{{page}}", libelleCle: "jetonPage" as const },
  { jeton: "{{pages}}", libelleCle: "jetonPages" as const },
];

export function EnTetePiedPageCard({ entreprise }: { entreprise: Entreprise | null }) {
  const t = useTranslations("Parametres.entetePiedPage");
  const [valeurs, setValeurs] = useState<Record<CleChamp, string>>({
    enteteGauche: entreprise?.entete_gauche ?? "",
    enteteCentre: entreprise?.entete_centre ?? "",
    enteteDroite: entreprise?.entete_droite ?? "",
    piedGauche: entreprise?.pied_gauche ?? "",
    piedCentre: entreprise?.pied_centre ?? "",
    piedDroite: entreprise?.pied_droite ?? "",
  });
  // Dernier champ texte où l'utilisateur a cliqué/tapé — c'est là qu'un
  // jeton cliqué dans la barre d'outils s'insère, comme le bouton "Image"
  // d'Excel l'insère dans la case gauche/centre/droite active.
  const [zoneActive, setZoneActive] = useState<CleChamp>("enteteGauche");
  const refs = useRef<Partial<Record<CleChamp, HTMLInputElement | null>>>({});
  const [envoi, setEnvoi] = useState(false);

  // Pas de useState pour logo_path/logo_nom_original : ils viennent
  // directement de `entreprise`, qui se rafraîchit automatiquement après
  // le Server Action (revalidatePath) — dupliquer en state local créerait
  // un état obsolète à chaque refresh (voir même convention dans
  // modele-cv.tsx).
  const logoPath = entreprise?.logo_path ?? null;
  const logoNomOriginal = entreprise?.logo_nom_original ?? null;
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoEnvoi, setLogoEnvoi] = useState(false);
  const [logoRetrait, setLogoRetrait] = useState(false);

  useEffect(() => {
    if (!logoPath) {
      setLogoUrl(null);
      return;
    }
    genererUrlTelechargement(logoPath).then((resultat) => {
      if ("url" in resultat) setLogoUrl(resultat.url);
    });
  }, [logoPath]);

  function inserer(jeton: string) {
    const input = refs.current[zoneActive];
    const valeurActuelle = valeurs[zoneActive];
    const debut = input?.selectionStart ?? valeurActuelle.length;
    const fin = input?.selectionEnd ?? debut;
    const nouvelleValeur = valeurActuelle.slice(0, debut) + jeton + valeurActuelle.slice(fin);

    setValeurs((v) => ({ ...v, [zoneActive]: nouvelleValeur }));

    requestAnimationFrame(() => {
      const positionCurseur = debut + jeton.length;
      input?.focus();
      input?.setSelectionRange(positionCurseur, positionCurseur);
    });
  }

  async function enregistrer() {
    setEnvoi(true);
    const resultat = await modifierEnTetePiedPage({
      enteteGauche: valeurs.enteteGauche,
      enteteCentre: valeurs.enteteCentre,
      enteteDroite: valeurs.enteteDroite,
      piedGauche: valeurs.piedGauche,
      piedCentre: valeurs.piedCentre,
      piedDroite: valeurs.piedDroite,
    });
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(t("toastEnregistre"));
  }

  async function televerserLogo(formData: FormData) {
    setLogoEnvoi(true);
    const resultat = await televerserLogoEntreprise(formData);
    setLogoEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(t("toastLogoEnvoye"));
  }

  async function retirerLogo() {
    if (!logoPath) return;
    setLogoRetrait(true);
    const resultat = await retirerLogoEntreprise(logoPath);
    setLogoRetrait(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(t("toastLogoRetire"));
  }

  function rendreBande(bande: Bande) {
    return (
      <div key={bande} className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t(bande === "entete" ? "sectionEntete" : "sectionPied")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {ZONES.map((zone) => {
            const cle = cleChamp(bande, zone);
            return (
              <div key={cle} className="flex flex-col gap-1">
                <Label htmlFor={`entete-pied-${cle}`} className="text-xs text-muted-foreground">
                  {t(`zone${zone.charAt(0).toUpperCase()}${zone.slice(1)}`)}
                </Label>
                <Input
                  id={`entete-pied-${cle}`}
                  ref={(el) => {
                    refs.current[cle] = el;
                  }}
                  value={valeurs[cle]}
                  onFocus={() => setZoneActive(cle)}
                  onChange={(e) => setValeurs((v) => ({ ...v, [cle]: e.target.value }))}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titre")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label>{t("champLogo")}</Label>
          {logoPath ? (
            <div className="flex items-center gap-3">
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- aperçu d'un logo privé (URL signée temporaire), pas une image optimisable par next/image
                <img src={logoUrl} alt={logoNomOriginal ?? ""} className="h-10 w-auto rounded border" />
              )}
              <span className="text-sm">{logoNomOriginal}</span>
              <Button type="button" variant="ghost" size="sm" onClick={retirerLogo} disabled={logoRetrait}>
                {logoRetrait && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("boutonRetirerLogo")}
              </Button>
            </div>
          ) : (
            <form action={televerserLogo} className="flex items-center gap-2">
              <Input type="file" name="fichier" accept="image/png,image/jpeg" required className="max-w-xs" />
              <Button type="submit" disabled={logoEnvoi}>
                {logoEnvoi && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("boutonTeleverserLogo")}
              </Button>
            </form>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("insererTitre")}</span>
          {JETONS.map(({ jeton, libelleCle }) => (
            <Button key={jeton} type="button" variant="outline" size="sm" onClick={() => inserer(jeton)}>
              {t(libelleCle)}
            </Button>
          ))}
        </div>

        {BANDES.map((bande) => rendreBande(bande))}

        <Button onClick={enregistrer} disabled={envoi} className="self-start">
          {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("boutonEnregistrer")}
        </Button>
      </CardContent>
    </Card>
  );
}
