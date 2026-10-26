"use client";

import { useState } from "react";
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
import { modifierProfilEntreprise } from "@/lib/utilisateur/actions";
import { REGIMES_FISCAUX, type Entreprise, type RegimeFiscal } from "@/lib/utilisateur/types";
import { SECTEURS_CIBLES } from "@/lib/veille/classification-secteur";

const REGIME_FISCAL_NON_RENSEIGNE = "_non_renseigne";

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
