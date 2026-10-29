"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  modifierProfilEntreprise,
  televerserCachetEntreprise,
  retirerCachetEntreprise,
  televerserSignatureEntreprise,
  retirerSignatureEntreprise,
} from "@/lib/utilisateur/actions";
import { genererUrlTelechargement } from "@/lib/documents/actions";
import { REGIMES_FISCAUX, type Entreprise, type RegimeFiscal } from "@/lib/utilisateur/types";
import { SECTEURS_CIBLES } from "@/lib/veille/classification-secteur";

const REGIME_FISCAL_NON_RENSEIGNE = "_non_renseigne";

// Sous-composant local (pas partagé avec EnTetePiedPageCard, qui a sa
// propre logique de jetons {{logo}} à côté de son propre champ logo) :
// factorise l'upload/aperçu/retrait d'une image liée à l'entreprise,
// réutilisé pour le cachet et la signature ci-dessous. Même UX que le champ
// logo de EnTetePiedPageCard (aperçu via URL signée, bouton retirer).
function ChampImageEntreprise({
  label,
  cheminActuel,
  nomOriginalActuel,
  onTeleverser,
  onRetirer,
  texteBoutonTeleverser,
  texteBoutonRetirer,
  texteToastEnvoye,
  texteToastRetire,
}: {
  label: string;
  cheminActuel: string | null;
  nomOriginalActuel: string | null;
  onTeleverser: (formData: FormData) => Promise<{ erreur: string } | { succes: true }>;
  onRetirer: (cheminStockage: string) => Promise<{ erreur: string } | { succes: true }>;
  texteBoutonTeleverser: string;
  texteBoutonRetirer: string;
  texteToastEnvoye: string;
  texteToastRetire: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [retrait, setRetrait] = useState(false);

  useEffect(() => {
    if (!cheminActuel) {
      setUrl(null);
      return;
    }
    genererUrlTelechargement(cheminActuel).then((resultat) => {
      if ("url" in resultat) setUrl(resultat.url);
    });
  }, [cheminActuel]);

  async function televerser(formData: FormData) {
    setEnvoi(true);
    const resultat = await onTeleverser(formData);
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(texteToastEnvoye);
  }

  async function retirer() {
    if (!cheminActuel) return;
    setRetrait(true);
    const resultat = await onRetirer(cheminActuel);
    setRetrait(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(texteToastRetire);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {cheminActuel ? (
        <div className="flex items-center gap-3">
          {url && (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu d'une image privée (URL signée temporaire), pas une image optimisable par next/image
            <img src={url} alt={nomOriginalActuel ?? ""} className="h-10 w-auto rounded border" />
          )}
          <span className="text-sm">{nomOriginalActuel}</span>
          <Button type="button" variant="ghost" size="sm" onClick={retirer} disabled={retrait}>
            {retrait && <Loader2 className="h-4 w-4 animate-spin" />}
            {texteBoutonRetirer}
          </Button>
        </div>
      ) : (
        <form action={televerser} className="flex items-center gap-2">
          <Input type="file" name="fichier" accept="image/png,image/jpeg" required className="max-w-xs" />
          <Button type="submit" disabled={envoi}>
            {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
            {texteBoutonTeleverser}
          </Button>
        </form>
      )}
    </div>
  );
}

export function ProfilEntrepriseCard({ entreprise }: { entreprise: Entreprise | null }) {
  const t = useTranslations("Parametres.profilEntreprise");
  const tSecteurs = useTranslations("Secteurs");
  const [nom, setNom] = useState(entreprise?.nom ?? "");
  const [rccm, setRccm] = useState(entreprise?.rccm ?? "");
  const [adresse, setAdresse] = useState(entreprise?.adresse ?? "");
  const [representantLegalNom, setRepresentantLegalNom] = useState(
    entreprise?.representant_legal_nom ?? "",
  );
  const [representantLegalQualite, setRepresentantLegalQualite] = useState(
    entreprise?.representant_legal_qualite ?? "",
  );
  const [idu, setIdu] = useState(entreprise?.idu ?? "");
  const [telephone, setTelephone] = useState(entreprise?.telephone ?? "");
  const [email, setEmail] = useState(entreprise?.email ?? "");
  const [envoi, setEnvoi] = useState(false);
  const [secteursActivite, setSecteursActivite] = useState<string[]>(
    (entreprise?.secteurs_activite ?? []).filter((s) =>
      (SECTEURS_CIBLES as readonly string[]).includes(s),
    ),
  );
  const [regimeFiscal, setRegimeFiscal] = useState(
    entreprise?.regime_fiscal ?? REGIME_FISCAL_NON_RENSEIGNE,
  );

  async function enregistrer() {
    setEnvoi(true);
    const resultat = await modifierProfilEntreprise({
      nom,
      rccm: rccm.trim().length > 0 ? rccm : null,
      adresse: adresse.trim().length > 0 ? adresse : null,
      representantLegalNom: representantLegalNom.trim().length > 0 ? representantLegalNom : null,
      representantLegalQualite:
        representantLegalQualite.trim().length > 0 ? representantLegalQualite : null,
      idu: idu.trim().length > 0 ? idu : null,
      telephone: telephone.trim().length > 0 ? telephone : null,
      email: email.trim().length > 0 ? email : null,
      secteursActivite,
      regimeFiscal: regimeFiscal === REGIME_FISCAL_NON_RENSEIGNE ? null : regimeFiscal,
    });
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(t("erreurEnregistrement"));
      return;
    }
    toast.success(t("toastEnregistre"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titre")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-nom">{t("champNom")}</Label>
          <Input id="profil-nom" value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-rccm">{t("champRccm")}</Label>
          <Input id="profil-rccm" value={rccm} onChange={(e) => setRccm(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-adresse">{t("champAdresse")}</Label>
          <Input id="profil-adresse" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-representant-nom">{t("champRepresentantLegalNom")}</Label>
          <Input
            id="profil-representant-nom"
            value={representantLegalNom}
            onChange={(e) => setRepresentantLegalNom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-representant-qualite">{t("champRepresentantLegalQualite")}</Label>
          <Input
            id="profil-representant-qualite"
            value={representantLegalQualite}
            onChange={(e) => setRepresentantLegalQualite(e.target.value)}
          />
        </div>
        <ChampImageEntreprise
          label={t("champCachet")}
          cheminActuel={entreprise?.cachet_path ?? null}
          nomOriginalActuel={entreprise?.cachet_nom_original ?? null}
          onTeleverser={televerserCachetEntreprise}
          onRetirer={retirerCachetEntreprise}
          texteBoutonTeleverser={t("boutonTeleverserCachet")}
          texteBoutonRetirer={t("boutonRetirerCachet")}
          texteToastEnvoye={t("toastCachetEnvoye")}
          texteToastRetire={t("toastCachetRetire")}
        />
        <ChampImageEntreprise
          label={t("champSignature")}
          cheminActuel={entreprise?.signature_path ?? null}
          nomOriginalActuel={entreprise?.signature_nom_original ?? null}
          onTeleverser={televerserSignatureEntreprise}
          onRetirer={retirerSignatureEntreprise}
          texteBoutonTeleverser={t("boutonTeleverserSignature")}
          texteBoutonRetirer={t("boutonRetirerSignature")}
          texteToastEnvoye={t("toastSignatureEnvoyee")}
          texteToastRetire={t("toastSignatureRetiree")}
        />
        <div className="flex flex-col gap-2">
          <Label>{t("champSecteursActivite")}</Label>
          <div className="flex flex-col gap-2">
            {SECTEURS_CIBLES.map((secteur) => (
              <div key={secteur} className="flex items-center gap-2">
                <Checkbox
                  id={`secteur-${secteur}`}
                  checked={secteursActivite.includes(secteur)}
                  onCheckedChange={(coche) =>
                    setSecteursActivite((liste) =>
                      coche === true
                        ? [...liste, secteur]
                        : liste.filter((s) => s !== secteur),
                    )
                  }
                />
                <Label htmlFor={`secteur-${secteur}`} className="font-normal">
                  {tSecteurs(secteur)}
                </Label>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-regime-fiscal">{t("champRegimeFiscal")}</Label>
          <Select
            value={regimeFiscal}
            onValueChange={(valeur) => setRegimeFiscal(valeur as RegimeFiscal)}
          >
            <SelectTrigger id="profil-regime-fiscal" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={REGIME_FISCAL_NON_RENSEIGNE}>
                {t("regimeFiscalNonRenseigne")}
              </SelectItem>
              {REGIMES_FISCAUX.map((regime) => (
                <SelectItem key={regime} value={regime}>
                  {t(`regimeFiscal${regime.charAt(0).toUpperCase()}${regime.slice(1)}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-idu">{t("champIdu")}</Label>
          <Input id="profil-idu" value={idu} onChange={(e) => setIdu(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-telephone">{t("champTelephone")}</Label>
          <Input
            id="profil-telephone"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-email">{t("champEmail")}</Label>
          <Input
            id="profil-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button onClick={enregistrer} disabled={envoi} className="self-start">
          {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("boutonEnregistrer")}
        </Button>
      </CardContent>
    </Card>
  );
}
